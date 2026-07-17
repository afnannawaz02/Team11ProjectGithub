/**
 * functions/api/plaid.js — Cloudflare Pages Function
 *
 * POST /api/plaid?action=link_token   — create Plaid Link token for the UI
 * POST /api/plaid?action=exchange     — exchange public_token → access_token (store in D1)
 * GET  /api/plaid?action=status       — returns { connected, institution } for current user
 * POST /api/plaid?action=disconnect   — removes stored access token from D1
 *
 * Env bindings required:
 *   PLAID_CLIENT_ID  — Plaid dashboard → Team Settings → Keys
 *   PLAID_SECRET     — Plaid sandbox/production secret
 *   PLAID_ENV        — "sandbox" | "development" | "production"  (default: "sandbox")
 *   DB               — D1 database binding
 *
 * Auth: requires a valid cb_session cookie (same as /api/auth).
 */

const PLAID_BASE = (env) =>
  `https://${env.PLAID_ENV || 'sandbox'}.plaid.com`;

async function plaidPost(env, path, body) {
  const res = await fetch(`${PLAID_BASE(env)}${path}`, {
    method: 'POST',
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

async function requireUser(request, env) {
  const cookie = request.headers.get('Cookie') || '';
  const token  = cookie.match(/cb_session=([^;]+)/)?.[1];
  if (!token) return null;
  const row = await env.DB.prepare(
    `SELECT u.id, u.username FROM sessions s
     JOIN users u ON u.id = s.user_id
     WHERE s.token = ? AND s.expires_at > datetime('now') LIMIT 1`
  ).bind(token).first();
  return row || null;
}

export async function onRequest({ request, env }) {
  if (!env.PLAID_CLIENT_ID || !env.PLAID_SECRET) {
    return Response.json({ error: 'Plaid not configured.' }, { status: 503 });
  }

  const user = await requireUser(request, env);
  if (!user) {
    return Response.json({ error: 'Unauthorised.' }, { status: 401 });
  }

  const url    = new URL(request.url);
  const action = url.searchParams.get('action');

  // ── POST /api/plaid?action=link_token ──────────────────────────────────────
  if (action === 'link_token' && request.method === 'POST') {
    const data = await plaidPost(env, '/link/token/create', {
      user:          { client_user_id: String(user.id) },
      client_name:   'Candyland Bank',
      products:      ['transactions'],
      country_codes: ['US'],
      language:      'en',
    }).catch((e) => ({ error: e.message }));

    if (data.error) return Response.json({ error: data.error }, { status: 502 });
    return Response.json({ ok: true, link_token: data.link_token });
  }

  // ── POST /api/plaid?action=exchange ───────────────────────────────────────
  if (action === 'exchange' && request.method === 'POST') {
    const { public_token } = await request.json().catch(() => ({}));
    if (!public_token) return Response.json({ error: 'public_token required.' }, { status: 400 });

    const data = await plaidPost(env, '/item/public_token/exchange', { public_token })
      .catch((e) => ({ error: e.message }));
    if (data.error) return Response.json({ error: data.error }, { status: 502 });

    // Fetch institution name
    let institution = '';
    try {
      const item = await plaidPost(env, '/item/get', { access_token: data.access_token });
      const inst = await plaidPost(env, '/institutions/get_by_id', {
        institution_id: item.item.institution_id,
        country_codes: ['US'],
      });
      institution = inst.institution?.name || '';
    } catch { /* non-fatal */ }

    // Upsert into D1
    await env.DB.prepare(
      `INSERT INTO plaid_tokens (user_id, access_token, item_id, institution, connected_at)
       VALUES (?, ?, ?, ?, datetime('now'))
       ON CONFLICT(user_id) DO UPDATE SET
         access_token=excluded.access_token,
         item_id=excluded.item_id,
         institution=excluded.institution,
         connected_at=excluded.connected_at`
    ).bind(user.id, data.access_token, data.item_id, institution).run();

    return Response.json({ ok: true, institution });
  }

  // ── GET /api/plaid?action=status ───────────────────────────────────────────
  if (action === 'status' && request.method === 'GET') {
    const row = await env.DB.prepare(
      'SELECT institution, connected_at FROM plaid_tokens WHERE user_id = ? LIMIT 1'
    ).bind(user.id).first();
    return Response.json({ ok: true, connected: !!row, institution: row?.institution || '', connected_at: row?.connected_at || null });
  }

  // ── POST /api/plaid?action=disconnect ─────────────────────────────────────
  if (action === 'disconnect' && request.method === 'POST') {
    // Attempt to revoke the token with Plaid (best-effort)
    const row = await env.DB.prepare(
      'SELECT access_token FROM plaid_tokens WHERE user_id = ? LIMIT 1'
    ).bind(user.id).first();
    if (row) {
      await plaidPost(env, '/item/remove', { access_token: row.access_token }).catch(() => {});
      await env.DB.prepare('DELETE FROM plaid_tokens WHERE user_id = ?').bind(user.id).run();
    }
    return Response.json({ ok: true });
  }

  return Response.json({ error: 'Unknown action.' }, { status: 400 });
}

/**
 * Exported helper — fetch Plaid transactions for a user from the live API.
 * Returns null if no token is stored.
 */
export async function fetchPlaidTransactions(userId, env) {
  const row = await env.DB.prepare(
    'SELECT access_token FROM plaid_tokens WHERE user_id = ? LIMIT 1'
  ).bind(userId).first();
  if (!row) return null;

  const endDate   = new Date().toISOString().slice(0, 10);
  const startDate = new Date(Date.now() - 90 * 86400000).toISOString().slice(0, 10);

  const data = await plaidPost(env, '/transactions/get', {
    access_token: row.access_token,
    start_date:   startDate,
    end_date:     endDate,
    options:      { count: 200, offset: 0 },
  }).catch(() => null);

  if (!data?.transactions) return null;

  return data.transactions.map((t) => ({
    id:        t.transaction_id,
    date:      t.date,
    desc:      t.name,
    category:  mapPlaidCategory(t.category),
    amount:    -t.amount, // Plaid: positive = debit from account
    recurring: t.recurring_transaction_id ? true : false,
  }));
}

/**
 * Exported helper — fetch Plaid accounts for a user.
 * Returns null if no token is stored.
 */
export async function fetchPlaidAccounts(userId, env) {
  const row = await env.DB.prepare(
    'SELECT access_token, institution FROM plaid_tokens WHERE user_id = ? LIMIT 1'
  ).bind(userId).first();
  if (!row) return null;

  const data = await plaidPost(env, '/accounts/get', {
    access_token: row.access_token,
  }).catch(() => null);

  if (!data?.accounts) return null;

  return data.accounts.map((a) => ({
    id:          a.account_id,
    name:        `${row.institution || 'Bank'} ${a.name}`,
    type:        mapPlaidAccountType(a.type, a.subtype),
    balance:     a.type === 'credit' ? -(a.balances.current ?? 0) : (a.balances.current ?? 0),
    institution: row.institution,
  }));
}

function mapPlaidCategory(cats) {
  if (!cats?.length) return 'Other';
  const top = cats[0]?.toLowerCase() || '';
  if (top.includes('food') || top.includes('restaurant'))    return 'Food & Dining';
  if (top.includes('travel') || top.includes('airlines'))    return 'Travel';
  if (top.includes('transport') || top.includes('taxi'))     return 'Transportation';
  if (top.includes('shop') || top.includes('retail'))        return 'Shopping';
  if (top.includes('utilities') || top.includes('telecom'))  return 'Utilities';
  if (top.includes('health') || top.includes('medical'))     return 'Health';
  if (top.includes('entertain') || top.includes('arts'))     return 'Entertainment';
  if (top.includes('service') || top.includes('subscript'))  return 'Subscriptions';
  if (top.includes('payroll') || top.includes('deposit'))    return 'Income';
  if (top.includes('education') || top.includes('tuition'))  return 'Education';
  return 'Other';
}

function mapPlaidAccountType(type, subtype) {
  if (type === 'credit')     return 'credit';
  if (subtype === 'savings') return 'savings';
  if (subtype === 'checking') return 'checking';
  if (type === 'investment' || type === 'brokerage') return 'investment';
  return 'checking';
}
