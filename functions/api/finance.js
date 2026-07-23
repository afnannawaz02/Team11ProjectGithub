/**
 * functions/api/finance.js — Cloudflare Pages Function
 *
 * GET /api/finance?type=portfolio   — unified portfolio view (Plaid + Coinbase + Finnhub)
 * GET /api/finance?type=networth    — net worth history (derived from live balances)
 * GET /api/finance?type=rebalance   — rebalancing insights based on user risk profile
 *
 * Auth: reads cb_session cookie → D1 sessions/users tables.
 * No session → 401. No connected accounts → notConnected:true empty-state response.
 *
 * Env bindings:
 *   DB                — D1 database
 *   PLAID_CLIENT_ID   — Plaid API key
 *   PLAID_SECRET      — Plaid secret
 *   PLAID_ENV         — "sandbox" | "development" | "production" (default: "sandbox")
 *   COINBASE_CLIENT_ID     — Coinbase OAuth app
 *   COINBASE_CLIENT_SECRET — Coinbase OAuth secret
 *   FINNHUB_API_KEY   — live equity quotes (optional enrichment)
 */

const FH_BASE    = 'https://finnhub.io/api/v1';
const PLAID_BASE = (env) => `https://${env.PLAID_ENV || 'sandbox'}.plaid.com`;
const CB_API     = 'https://api.coinbase.com/v2';
const CB_TOKEN   = 'https://login.coinbase.com/oauth2/token';

// ── Auth helper ───────────────────────────────────────────────────────────────
async function requireUser(request, env) {
  const cookie = request.headers.get('Cookie') || '';
  const token  = cookie.match(/cb_session=([^;]+)/)?.[1];
  if (!token) return null;
  const row = await env.DB.prepare(
    `SELECT u.id, u.username FROM sessions s
     JOIN users u ON u.id = s.user_id
     WHERE s.token = ? AND s.expires_at > datetime('now') LIMIT 1`
  ).bind(token).first().catch(() => null);
  return row || null;
}

// ── Plaid helpers (inlined — Pages Functions cannot import siblings) ──────────
async function plaidPost(env, path, body) {
  const res = await fetch(`${PLAID_BASE(env)}${path}`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id: env.PLAID_CLIENT_ID,
      secret:    env.PLAID_SECRET,
      ...body,
    }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error_message || `Plaid ${path} failed`);
  return data;
}

/** Returns mapped accounts array or null if not connected / error. */
async function fetchPlaidAccounts(userId, env) {
  if (!env.PLAID_CLIENT_ID || !env.PLAID_SECRET) return null;

  const row = await env.DB.prepare(
    'SELECT access_token, institution FROM plaid_tokens WHERE user_id = ? LIMIT 1'
  ).bind(userId).first().catch(() => null);
  if (!row) return null;

  const data = await plaidPost(env, '/accounts/get', {
    access_token: row.access_token,
  }).catch(() => null);

  if (!data?.accounts) return null;

  return data.accounts.map((a) => ({
    id:          a.account_id,
    name:        `${row.institution || 'Bank'} – ${a.name}`,
    type:        mapPlaidType(a.type, a.subtype),
    balance:     a.type === 'credit'
                   ? -(a.balances.current ?? 0)
                   : (a.balances.current ?? 0),
    institution: row.institution || '',
  }));
}

function mapPlaidType(type, subtype) {
  if (type === 'credit')                              return 'credit';
  if (subtype === 'savings')                          return 'savings';
  if (subtype === 'checking')                         return 'checking';
  if (type === 'investment' || type === 'brokerage')  return 'investment';
  return 'checking';
}

// ── Coinbase helpers (inlined) ────────────────────────────────────────────────
/** Returns holdings array or null if not connected / token refresh fails. */
async function fetchCoinbaseHoldings(userId, env) {
  if (!env.COINBASE_CLIENT_ID || !env.COINBASE_CLIENT_SECRET) return null;

  let row = await env.DB.prepare(
    'SELECT access_token, refresh_token, expires_at FROM coinbase_tokens WHERE user_id = ? LIMIT 1'
  ).bind(userId).first().catch(() => null);
  if (!row) return null;

  // Refresh token if expired (60s buffer)
  if (new Date(row.expires_at) < new Date(Date.now() + 60000)) {
    const refreshed = await fetch(CB_TOKEN, {
      method:  'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type:    'refresh_token',
        refresh_token: row.refresh_token,
        client_id:     env.COINBASE_CLIENT_ID,
        client_secret: env.COINBASE_CLIENT_SECRET,
      }),
    }).then((r) => r.json()).catch(() => null);

    if (!refreshed?.access_token) return null;

    const newExpiry = new Date(Date.now() + refreshed.expires_in * 1000).toISOString();
    await env.DB.prepare(
      'UPDATE coinbase_tokens SET access_token=?, refresh_token=?, expires_at=? WHERE user_id=?'
    ).bind(
      refreshed.access_token,
      refreshed.refresh_token || row.refresh_token,
      newExpiry,
      userId,
    ).run().catch(() => {});

    row = { ...row, access_token: refreshed.access_token };
  }

  const data = await fetch(`${CB_API}/accounts?limit=100`, {
    headers: {
      Authorization: `Bearer ${row.access_token}`,
      'CB-VERSION':  '2024-01-01',
    },
  }).then((r) => r.json()).catch(() => null);

  if (!data?.data) return null;

  return data.data
    .filter((a) => parseFloat(a.balance?.amount || 0) > 0)
    .map((a) => ({
      symbol: a.currency?.code || a.balance?.currency || '?',
      name:   a.name || a.currency?.name || a.balance?.currency || '?',
      qty:    parseFloat(a.balance?.amount || 0),
      // native_balance is in USD; price derived below if qty > 0
      price:  parseFloat(a.balance?.amount || 0) > 0
                ? parseFloat((parseFloat(a.native_balance?.amount || 0) / parseFloat(a.balance.amount)).toFixed(4))
                : 0,
      value:  parseFloat(a.native_balance?.amount || 0),
    }));
}

// ── Finnhub helper ────────────────────────────────────────────────────────────
async function liveQuote(ticker, apiKey) {
  try {
    const r = await fetch(`${FH_BASE}/quote?symbol=${ticker}&token=${apiKey}`, {
      headers: { 'X-Finnhub-Token': apiKey },
    });
    if (!r.ok) return null;
    const d = await r.json();
    return d.c || null;
  } catch { return null; }
}

// ── Target allocation by risk level ──────────────────────────────────────────
function targetAllocation(risk) {
  const targets = {
    conservative: { equities: 30, bonds: 50, cash: 15, crypto: 5  },
    moderate:     { equities: 55, bonds: 25, cash: 15, crypto: 5  },
    aggressive:   { equities: 70, bonds: 10, cash:  5, crypto: 15 },
  };
  return targets[risk] ?? targets.moderate;
}

// ── Empty-state helpers ───────────────────────────────────────────────────────
function emptyPortfolio() {
  return {
    notConnected:     true,
    totalAssets:      0,
    totalDebt:        0,
    netWorth:         0,
    allocation:       [],
    sectors:          [],
    stocks:           [],
    crypto:           [],
    plaidAccounts:    [],
    topConcentration: 0,
    diversScore:      0,
    healthScore:      0,
    cryptoPct:        0,
    plaidConnected:   false,
    coinbaseConnected: false,
  };
}

// ── Handler ───────────────────────────────────────────────────────────────────
export async function onRequestGet({ request, env }) {
  const user = await requireUser(request, env);
  if (!user) {
    return Response.json({ error: 'Unauthorised.' }, { status: 401 });
  }

  const url  = new URL(request.url);
  const type = url.searchParams.get('type') || 'portfolio';

  // ── /api/finance?type=portfolio ──────────────────────────────────────────
  if (type === 'portfolio') {
    const plaid  = await fetchPlaidAccounts(user.id, env);
    const crypto = await fetchCoinbaseHoldings(user.id, env);

    // If neither account is connected, return an explicit empty state.
    if (!plaid && !crypto) {
      return Response.json(emptyPortfolio());
    }

    const accounts       = plaid  || [];
    const cryptoHoldings = crypto || [];

    // Plaid brokerage/investment accounts are surfaced as a single "Brokerage" line
    // (Plaid does not expose individual stock positions via /accounts/get).
    const investmentAccounts = accounts.filter((a) => a.type === 'investment');
    const stocks = investmentAccounts.map((a) => ({
      symbol: 'BROKERAGE',
      name:   a.name,
      shares: null,            // no per-share data from Plaid
      price:  null,
      value:  a.balance,
    }));

    // Try to enrich crypto prices via Finnhub if not already populated
    if (env.FINNHUB_API_KEY && cryptoHoldings.length) {
      await Promise.allSettled(cryptoHoldings.map(async (h) => {
        if (h.price && h.price > 0) return; // already has price from native_balance
        const sym   = `${h.symbol}USD`;      // e.g. BTCUSD
        const price = await liveQuote(sym, env.FINNHUB_API_KEY);
        if (price) {
          h.price = price;
          h.value = parseFloat((h.qty * price).toFixed(2));
        }
      }));
    }

    // Totals
    const bankCash    = accounts.filter((a) => a.type === 'checking' || a.type === 'savings').reduce((s, a) => s + a.balance, 0);
    const bankInvest  = investmentAccounts.reduce((s, a) => s + a.balance, 0);
    const bankDebt    = Math.abs(accounts.filter((a) => a.type === 'credit').reduce((s, a) => s + a.balance, 0));
    const cryptoTotal = cryptoHoldings.reduce((s, h) => s + h.value, 0);
    const stockTotal  = bankInvest; // Plaid investment balance IS the stock total
    const totalAssets = bankCash + bankInvest + cryptoTotal;
    const netWorth    = totalAssets - bankDebt;

    // Asset allocation
    const allocation = [
      { label: 'Bank / Savings',  value: bankCash,    pct: 0, color: '#c0356a' },
      { label: 'Brokerage Acct',  value: bankInvest,  pct: 0, color: '#9d2256' },
      { label: 'Cryptocurrency',  value: cryptoTotal, pct: 0, color: '#6b2040' },
    ]
      .filter((a) => a.value > 0)
      .map((a) => ({
        ...a,
        pct: totalAssets > 0 ? parseFloat(((a.value / totalAssets) * 100).toFixed(1)) : 0,
      }));

    // Crypto concentration
    const cryptoPct        = totalAssets > 0 ? parseFloat(((cryptoTotal / totalAssets) * 100).toFixed(1)) : 0;
    const allPositions     = cryptoHoldings.map((h) => ({ label: h.symbol, value: h.value })).sort((a, b) => b.value - a.value);
    const topConcentration = allPositions[0] ? parseFloat(((allPositions[0].value / totalAssets) * 100).toFixed(1)) : 0;

    // Scores
    const diversScore = Math.max(0, Math.min(100, Math.round(100 - topConcentration * 0.6 - Math.max(0, cryptoPct - 20) * 0.5)));
    const healthScore = Math.max(0, Math.min(100, Math.round(
      diversScore * 0.4
      + (netWorth > 50000 ? 30 : netWorth / 50000 * 30)
      + (bankCash > 10000 ? 30 : bankCash / 10000 * 30)
    )));

    // Sector breakdown is not available without individual stock positions
    const sectors = [];

    return Response.json({
      notConnected:     false,
      plaidConnected:   !!plaid,
      coinbaseConnected: !!crypto,
      totalAssets:      parseFloat(totalAssets.toFixed(2)),
      totalDebt:        parseFloat(bankDebt.toFixed(2)),
      netWorth:         parseFloat(netWorth.toFixed(2)),
      allocation,
      sectors,
      stocks,
      crypto:           cryptoHoldings,
      plaidAccounts:    accounts,
      topConcentration,
      diversScore,
      healthScore,
      cryptoPct,
    });
  }

  // ── /api/finance?type=networth ───────────────────────────────────────────
  if (type === 'networth') {
    // Derive current net worth from live accounts; return a single data point if
    // no history table exists yet. Returns empty arrays if no accounts connected.
    const plaid  = await fetchPlaidAccounts(user.id, env);
    const crypto = await fetchCoinbaseHoldings(user.id, env);

    if (!plaid && !crypto) {
      return Response.json({ history: [], daily90: [], notConnected: true });
    }

    const accounts    = plaid  || [];
    const cryptoHoldings = crypto || [];
    const bankCash    = accounts.filter((a) => a.type === 'checking' || a.type === 'savings').reduce((s, a) => s + a.balance, 0);
    const bankInvest  = accounts.filter((a) => a.type === 'investment').reduce((s, a) => s + a.balance, 0);
    const bankDebt    = Math.abs(accounts.filter((a) => a.type === 'credit').reduce((s, a) => s + a.balance, 0));
    const cryptoTotal = cryptoHoldings.reduce((s, h) => s + h.value, 0);
    const currentNW   = parseFloat((bankCash + bankInvest + cryptoTotal - bankDebt).toFixed(2));

    const today = new Date().toISOString().slice(0, 10);
    const label = new Date().toLocaleString('en-US', { month: 'short', year: '2-digit' });

    // Single snapshot point — historical snapshots require a separate cron job
    // that persists daily net worth snapshots to a net_worth_history D1 table.
    // TODO: implement nightly snapshot cron + query history here.
    return Response.json({
      notConnected: false,
      history:  [{ label, value: currentNW }],
      daily90:  [{ label: today, value: currentNW }],
    });
  }

  // ── /api/finance?type=rebalance ──────────────────────────────────────────
  if (type === 'rebalance') {
    const plaid  = await fetchPlaidAccounts(user.id, env);
    const crypto = await fetchCoinbaseHoldings(user.id, env);

    if (!plaid && !crypto) {
      return Response.json({ notConnected: true, ok: false });
    }

    const accounts       = plaid  || [];
    const cryptoHoldings = crypto || [];

    const bankCash    = accounts.filter((a) => a.type === 'checking' || a.type === 'savings').reduce((s, a) => s + a.balance, 0);
    const bankInvest  = accounts.filter((a) => a.type === 'investment').reduce((s, a) => s + a.balance, 0);
    const bankDebt    = Math.abs(accounts.filter((a) => a.type === 'credit').reduce((s, a) => s + a.balance, 0));
    const cryptoTotal = cryptoHoldings.reduce((s, h) => s + h.value, 0);
    const totalAssets = bankCash + bankInvest + cryptoTotal;

    // Look up user risk profile from D1
    let risk = 'moderate';
    const profile = await env.DB.prepare(
      'SELECT risk FROM profiles WHERE user_id=? LIMIT 1'
    ).bind(user.id).first().catch(() => null);
    if (profile?.risk) risk = profile.risk;

    const target = targetAllocation(risk);

    // Current actual allocation %
    const actual = {
      equities: totalAssets > 0 ? (bankInvest  / totalAssets) * 100 : 0,
      bonds:    0, // Plaid does not expose bond holdings separately
      cash:     totalAssets > 0 ? (bankCash    / totalAssets) * 100 : 0,
      crypto:   totalAssets > 0 ? (cryptoTotal / totalAssets) * 100 : 0,
    };

    // Drift per class (actual - target)
    const drift = Object.fromEntries(
      Object.keys(target).map((k) => [k, parseFloat(((actual[k] ?? 0) - target[k]).toFixed(1))])
    );

    // Max drift for health score
    const maxDrift = Math.max(...Object.values(drift).map(Math.abs));

    // Buy/sell suggestions for classes with >= 2% drift
    const suggestions = Object.entries(drift)
      .filter(([, d]) => Math.abs(d) >= 2)
      .sort(([, a], [, b]) => Math.abs(b) - Math.abs(a))
      .map(([cls, d]) => ({
        asset_class: cls,
        action:      d > 0 ? 'sell' : 'buy',
        amount:      parseFloat(Math.abs((d / 100) * totalAssets).toFixed(2)),
        drift_pct:   d,
        target_pct:  target[cls],
        actual_pct:  parseFloat((actual[cls] ?? 0).toFixed(1)),
      }));

    const healthScore = Math.max(0, Math.min(100, Math.round(100 - maxDrift * 1.5)));

    return Response.json({
      ok:          true,
      notConnected: false,
      risk,
      target,
      actual: Object.fromEntries(Object.keys(actual).map((k) => [k, parseFloat((actual[k] ?? 0).toFixed(1))])),
      drift,
      suggestions,
      healthScore,
      totalAssets: parseFloat(totalAssets.toFixed(2)),
      maxDrift:    parseFloat(maxDrift.toFixed(1)),
    });
  }

  return Response.json({ error: 'Unknown type.' }, { status: 400 });
}
