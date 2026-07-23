/**
 * functions/api/finance.js — Cloudflare Pages Function
 * GET /api/finance?type=portfolio
 * GET /api/finance?type=networth
 *
 * Aggregates Plaid (bank), Coinbase (crypto), and Finnhub (equities) data
 * into a unified portfolio view with asset allocation and health metrics.
 *
 * In production these would call real Plaid + Coinbase APIs with user OAuth tokens.
 * Currently returns realistic demo data seeded by user session — ready to swap
 * for live API calls without changing the UI contract.
 *
 * Env bindings:
 *   FINNHUB_API_KEY   — for live equity quotes
 *   DB                — D1 database (survey profile for context)
 */

const FH_BASE = 'https://finnhub.io/api/v1';

// ── Demo data generators (deterministic per user) ────────────────────────────

function seedRand(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (Math.imul(31, h) + str.charCodeAt(i)) | 0;
  return function() { h = (Math.imul(31, h) + 0x6d2b79f5) | 0; return ((h >>> 0) / 0xffffffff); };
}

function demoPlaidAccounts(userId) {
  const r = seedRand(`plaid-${userId}`);
  return [
    { id: 'checking-1', name: 'Chase Checking',    type: 'checking',  balance: Math.round((2000 + r() * 8000) * 100) / 100  },
    { id: 'savings-1',  name: 'Chase Savings',     type: 'savings',   balance: Math.round((5000 + r() * 25000) * 100) / 100 },
    { id: 'credit-1',   name: 'Chase Sapphire',    type: 'credit',    balance: -Math.round((500 + r() * 3500) * 100) / 100  },
    { id: 'invest-1',   name: 'Fidelity Brokerage',type: 'investment',balance: Math.round((8000 + r() * 42000) * 100) / 100 },
  ];
}

function demoCoinbaseHoldings(userId) {
  const r = seedRand(`coinbase-${userId}`);
  const prices = { BTC: 67450, ETH: 3820, SOL: 185, USDC: 1.00 };
  return [
    { symbol: 'BTC',  name: 'Bitcoin',  qty: parseFloat((0.05 + r() * 0.35).toFixed(6)), price: prices.BTC  },
    { symbol: 'ETH',  name: 'Ethereum', qty: parseFloat((0.5  + r() * 3.5).toFixed(4)),  price: prices.ETH  },
    { symbol: 'SOL',  name: 'Solana',   qty: parseFloat((5    + r() * 45).toFixed(2)),    price: prices.SOL  },
    { symbol: 'USDC', name: 'USD Coin', qty: parseFloat((100  + r() * 900).toFixed(2)),   price: prices.USDC },
  ].map((h) => ({ ...h, value: parseFloat((h.qty * h.price).toFixed(2)) }));
}

function demoStockHoldings(userId) {
  const r = seedRand(`stocks-${userId}`);
  const prices = { AAPL: 191.85, MSFT: 422.06, GOOGL: 177.34, NVDA: 875.40, VTI: 241.55, BND: 74.20 };
  return Object.entries(prices).map(([sym, price]) => ({
    symbol: sym,
    shares: parseFloat((1 + r() * 20).toFixed(2)),
    price,
    value:  0, // filled after
  })).map((h) => ({ ...h, value: parseFloat((h.shares * h.price).toFixed(2)) }));
}

// Fetch a live quote from Finnhub — returns price or null on failure
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

// ── Handler ───────────────────────────────────────────────────────────────────
export async function onRequestGet({ request, env }) {
  const url    = new URL(request.url);
  const type   = url.searchParams.get('type') || 'portfolio';
  const userId = url.searchParams.get('userId') || 'demo';

  if (type === 'portfolio') {
    // 1. Try live data first; fall back to demo
    const livePlaid  = await tryLivePlaid(userId, env);
    const liveCrypto = await tryLiveCoinbase(userId, env);

    const plaid  = livePlaid  || demoPlaidAccounts(userId);
    const crypto = liveCrypto || demoCoinbaseHoldings(userId);
    let   stocks = demoStockHoldings(userId);

    // 2. Try to enrich top 3 stock holdings with live Finnhub prices
    if (env.FINNHUB_API_KEY) {
      const top3 = stocks.slice(0, 3);
      await Promise.allSettled(top3.map(async (h) => {
        const price = await liveQuote(h.symbol, env.FINNHUB_API_KEY);
        if (price) {
          h.price = price;
          h.value = parseFloat((h.shares * price).toFixed(2));
        }
      }));
    }

    // 3. Compute totals
    const bankCash    = plaid.filter((a) => a.type === 'checking' || a.type === 'savings').reduce((s, a) => s + a.balance, 0);
    const bankInvest  = plaid.filter((a) => a.type === 'investment').reduce((s, a) => s + a.balance, 0);
    const bankDebt    = Math.abs(plaid.filter((a) => a.type === 'credit').reduce((s, a) => s + a.balance, 0));
    const cryptoTotal = crypto.reduce((s, h) => s + h.value, 0);
    const stockTotal  = stocks.reduce((s, h) => s + h.value, 0);
    const totalAssets = bankCash + bankInvest + cryptoTotal + stockTotal;
    const netWorth    = totalAssets - bankDebt;

    // 4. Asset allocation
    const allocation = [
      { label: 'US Equities',     value: stockTotal,  pct: 0, color: '#f472a0' },
      { label: 'Bank / Savings',  value: bankCash,    pct: 0, color: '#c0356a' },
      { label: 'Brokerage Acct',  value: bankInvest,  pct: 0, color: '#9d2256' },
      { label: 'Cryptocurrency',  value: cryptoTotal, pct: 0, color: '#6b2040' },
    ].map((a) => ({ ...a, pct: totalAssets > 0 ? parseFloat(((a.value / totalAssets) * 100).toFixed(1)) : 0 }));

    // 5. Sector exposure (hardcoded for demo stocks)
    const sectorMap = { AAPL: 'Technology', MSFT: 'Technology', GOOGL: 'Technology', NVDA: 'Technology', VTI: 'Diversified ETF', BND: 'Fixed Income' };
    const sectorAgg = {};
    for (const h of stocks) {
      const sec = sectorMap[h.symbol] || 'Other';
      sectorAgg[sec] = (sectorAgg[sec] || 0) + h.value;
    }
    const sectors = Object.entries(sectorAgg)
      .map(([label, value]) => ({ label, value: parseFloat(value.toFixed(2)), pct: parseFloat(((value / stockTotal) * 100).toFixed(1)) }))
      .sort((a, b) => b.value - a.value);

    // 6. Concentration risk — top holding pct
    const allPositions = [
      ...stocks.map((h) => ({ label: h.symbol, value: h.value })),
      ...crypto.map((h) => ({ label: h.symbol, value: h.value })),
    ].sort((a, b) => b.value - a.value);
    const topConcentration = allPositions[0] ? parseFloat(((allPositions[0].value / totalAssets) * 100).toFixed(1)) : 0;

    // 7. Diversification score (0–100): penalise concentration and crypto > 20%
    const cryptoPct   = cryptoTotal / totalAssets * 100;
    const diversScore = Math.max(0, Math.min(100, Math.round(100 - topConcentration * 0.6 - Math.max(0, cryptoPct - 20) * 0.5)));

    // 8. Financial health score (0–100)
    const healthScore = Math.round(Math.min(100, diversScore * 0.4 + (netWorth > 50000 ? 30 : netWorth / 50000 * 30) + (bankCash > 10000 ? 30 : bankCash / 10000 * 30)));

    return Response.json({
      totalAssets:      parseFloat(totalAssets.toFixed(2)),
      totalDebt:        parseFloat(bankDebt.toFixed(2)),
      netWorth:         parseFloat(netWorth.toFixed(2)),
      allocation,
      sectors,
      stocks,
      crypto,
      plaidAccounts:    plaid,
      topConcentration,
      diversScore,
      healthScore,
      cryptoPct:        parseFloat(cryptoPct.toFixed(1)),
    });
  }

  if (type === 'networth') {
    // Historical net worth — 12 months of demo data, extended to support 3M view
    const r    = seedRand(`nw-${userId}`);
    const base = 45000 + r() * 80000;
    const months = Array.from({ length: 12 }, (_, i) => {
      const d = new Date();
      d.setMonth(d.getMonth() - (11 - i));
      return {
        label: d.toLocaleString('en-US', { month: 'short', year: '2-digit' }),
        // Weekly data points within each month (4 weeks × 12 months = 48 points for 3M range)
        value: parseFloat((base * (0.85 + i * 0.013 + (r() - 0.5) * 0.04)).toFixed(2)),
      };
    });

    // Also include 90-day daily breakdown for 3M chart range
    const daily90 = Array.from({ length: 90 }, (_, i) => {
      const d = new Date();
      d.setDate(d.getDate() - (89 - i));
      return {
        label: d.toISOString().slice(0, 10),
        value: parseFloat((base * (0.90 + (89 - i) * -0.0005 + (r() - 0.5) * 0.02)).toFixed(2)),
      };
    });

    return Response.json({ history: months, daily90 });
  }

  if (type === 'rebalance') {
    // Portfolio rebalancing insights — derives from portfolio data + user risk profile
    const livePlaid  = await tryLivePlaid(userId, env);
    const liveCrypto = await tryLiveCoinbase(userId, env);
    const plaid  = livePlaid  || demoPlaidAccounts(userId);
    const crypto = liveCrypto || demoCoinbaseHoldings(userId);
    const stocks = demoStockHoldings(userId);

    const bankCash   = plaid.filter((a) => a.type === 'checking' || a.type === 'savings').reduce((s, a) => s + a.balance, 0);
    const bankInvest = plaid.filter((a) => a.type === 'investment').reduce((s, a) => s + a.balance, 0);
    const bankDebt   = Math.abs(plaid.filter((a) => a.type === 'credit').reduce((s, a) => s + a.balance, 0));
    const cryptoTotal = crypto.reduce((s, h) => s + h.value, 0);
    const stockTotal  = stocks.reduce((s, h) => s + h.value, 0);
    const totalAssets = bankCash + bankInvest + cryptoTotal + stockTotal;

    // Look up user risk profile from D1
    let risk = 'moderate';
    if (user && env.DB) {
      const profile = await env.DB.prepare(
        `SELECT risk FROM profiles WHERE user_id=? LIMIT 1`
      ).bind(user.id).first().catch(() => null);
      if (profile?.risk) risk = profile.risk;
    }

    const target = targetAllocation(risk);

    // Current actual allocation %
    const actual = {
      equities: totalAssets > 0 ? (stockTotal  / totalAssets) * 100 : 0,
      bonds:    totalAssets > 0 ? (bankInvest  / totalAssets) * 100 : 0,
      cash:     totalAssets > 0 ? (bankCash    / totalAssets) * 100 : 0,
      crypto:   totalAssets > 0 ? (cryptoTotal / totalAssets) * 100 : 0,
    };

    // Drift per class (actual - target)
    const drift = Object.fromEntries(
      Object.keys(target).map((k) => [k, parseFloat((actual[k] - target[k]).toFixed(1))])
    );

    // Max drift = portfolio health penalty
    const maxDrift = Math.max(...Object.values(drift).map(Math.abs));

    // Generate buy/sell suggestions (dollar amounts to reach target)
    const suggestions = Object.entries(drift)
      .filter(([, d]) => Math.abs(d) >= 2)  // only flag >= 2% drift
      .sort(([, a], [, b]) => Math.abs(b) - Math.abs(a))
      .map(([cls, d]) => {
        const delta = Math.abs((d / 100) * totalAssets);
        return {
          asset_class: cls,
          action:      d > 0 ? 'sell' : 'buy',
          amount:      parseFloat(delta.toFixed(2)),
          drift_pct:   d,
          target_pct:  target[cls],
          actual_pct:  parseFloat(actual[cls].toFixed(1)),
        };
      });

    // Portfolio health score (0-100)
    const healthScore = Math.max(0, Math.min(100, Math.round(100 - maxDrift * 1.5)));

    return Response.json({
      ok:           true,
      risk,
      target,
      actual:       Object.fromEntries(Object.keys(actual).map((k) => [k, parseFloat(actual[k].toFixed(1))])),
      drift,
      suggestions,
      healthScore,
      totalAssets:  parseFloat(totalAssets.toFixed(2)),
      maxDrift:     parseFloat(maxDrift.toFixed(1)),
    });
  }

  return Response.json({ error: 'Unknown type.' }, { status: 400 });
}
