/**
 * functions/api/coinbase.js — Cloudflare Pages Function
 *
 * GET  /api/coinbase?action=connect    — redirect to Coinbase OAuth consent screen
 * GET  /api/coinbase?action=callback   — OAuth callback, stores token in D1
 * GET  /api/coinbase?action=status     — returns { connected, accounts[] }
 * POST /api/coinbase?action=disconnect — removes stored token from D1
 *
 * Env bindings required:
 *   COINBASE_CLIENT_ID      — Coinbase Developer Platform → OAuth app
 *   COINBASE_CLIENT_SECRET  — Coinbase Developer Platform → OAuth app
 *   DB                      — D1 database binding
 *
 * Auth: /connect and /callback use PKCE state; all others require cb_session cookie.
 */

const CB_API    = 'https://api.coinbase.com/v2';
const CB_AUTH   = 'https://login.coinbase.com/oauth2/auth';
const CB_TOKEN  = 'https://login.coinbase.com/oauth2/token';
const CB_SCOPES = 'wallet:accounts:read,wallet:transactions:read';

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

function redirectUrl(request) {
  const u = new URL(request.url);
  return `${u.origin}/api/coinbase?action=callback`;
}

export async function onRequest({ request, env }) {
  if (!env.COINBASE_CLIENT_ID || !env.COINBASE_CLIENT_SECRET) {
    return Response.json({ error: 'Coinbase not configured.' }, { status: 503 });
  }

  const url    = new URL(request.url);
  const action = url.searchParams.get('action');

  // ── GET /api/coinbase?action=connect ──────────────────────────────────────
  if (action === 'connect') {
    const user = await requireUser(request, env);
    if (!user) return Response.json({ error: 'Unauthorised.' }, { status: 401 });

    const state = crypto.randomUUID();
    // Store state in a short-lived KV or cookie; here we embed user_id in state
    const encoded = btoa(JSON.stringify({ userId: user.id, state }));

    const params = new URLSearchParams({
      response_type: 'code',
      client_id:     env.COINBASE_CLIENT_ID,
      redirect_uri:  redirectUrl(request),
      scope:         CB_SCOPES,
      state:         encoded,
    });
    return Response.redirect(`${CB_AUTH}?${params}`, 302);
  }

  // ── GET /api/coinbase?action=callback ─────────────────────────────────────
  if (action === 'callback') {
    const code  = url.searchParams.get('code');
    const state = url.searchParams.get('state');

    let userId;
    try {
      userId = JSON.parse(atob(state)).userId;
    } catch {
      return Response.redirect('/?coinbase=error', 302);
    }

    const tokenRes = await fetch(CB_TOKEN, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type:    'authorization_code',
        code,
        client_id:     env.COINBASE_CLIENT_ID,
        client_secret: env.COINBASE_CLIENT_SECRET,
        redirect_uri:  redirectUrl(request),
      }),
    });
    const tokens = await tokenRes.json().catch(() => ({}));
    if (!tokenRes.ok || !tokens.access_token) {
      return Response.redirect('/?coinbase=error', 302);
    }

    const expiresAt = new Date(Date.now() + tokens.expires_in * 1000).toISOString();
    await env.DB.prepare(
      `INSERT INTO coinbase_tokens (user_id, access_token, refresh_token, expires_at, connected_at)
       VALUES (?, ?, ?, ?, datetime('now'))
       ON CONFLICT(user_id) DO UPDATE SET
         access_token=excluded.access_token,
         refresh_token=excluded.refresh_token,
         expires_at=excluded.expires_at,
         connected_at=excluded.connected_at`
    ).bind(userId, tokens.access_token, tokens.refresh_token || '', expiresAt).run();

    return Response.redirect('/?coinbase=connected', 302);
  }

  // ── Remaining actions require a session cookie ────────────────────────────
  const user = await requireUser(request, env);
  if (!user) return Response.json({ error: 'Unauthorised.' }, { status: 401 });

  // ── GET /api/coinbase?action=status ───────────────────────────────────────
  if (action === 'status') {
    const row = await env.DB.prepare(
      'SELECT connected_at FROM coinbase_tokens WHERE user_id = ? LIMIT 1'
    ).bind(user.id).first();
    return Response.json({ ok: true, connected: !!row, connected_at: row?.connected_at || null });
  }

  // ── POST /api/coinbase?action=disconnect ─────────────────────────────────
  if (action === 'disconnect' && request.method === 'POST') {
    const row = await env.DB.prepare(
      'SELECT access_token FROM coinbase_tokens WHERE user_id = ? LIMIT 1'
    ).bind(user.id).first();
    if (row) {
      // Revoke token with Coinbase (best-effort)
      await fetch(`${CB_API}/auth/revoke`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ token: row.access_token }),
      }).catch(() => {});
      await env.DB.prepare('DELETE FROM coinbase_tokens WHERE user_id = ?').bind(user.id).run();
    }
    return Response.json({ ok: true });
  }

  return Response.json({ error: 'Unknown action.' }, { status: 400 });
}

/**
 * Exported helper — fetch Coinbase account balances for a user.
 * Returns null if no token is stored or refresh fails.
 */
export async function fetchCoinbaseHoldings(userId, env) {
  let row = await env.DB.prepare(
    'SELECT access_token, refresh_token, expires_at FROM coinbase_tokens WHERE user_id = ? LIMIT 1'
  ).bind(userId).first();
  if (!row) return null;

  // Refresh token if expired (within 60s buffer)
  if (new Date(row.expires_at) < new Date(Date.now() + 60000)) {
    const refreshed = await fetch(CB_TOKEN, {
      method: 'POST',
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
    ).bind(refreshed.access_token, refreshed.refresh_token || row.refresh_token, newExpiry, userId).run();
    row = { ...row, access_token: refreshed.access_token };
  }

  const data = await fetch(`${CB_API}/accounts?limit=100`, {
    headers: { Authorization: `Bearer ${row.access_token}`, 'CB-VERSION': '2024-01-01' },
  }).then((r) => r.json()).catch(() => null);

  if (!data?.data) return null;

  return data.data
    .filter((a) => parseFloat(a.balance?.amount || 0) > 0)
    .map((a) => ({
      symbol: a.currency?.code || a.balance?.currency || '?',
      name:   a.name || a.currency?.name || a.balance?.currency || '?',
      qty:    parseFloat(a.balance?.amount || 0),
      price:  0, // enriched separately with Finnhub/CoinGecko
      value:  parseFloat(a.native_balance?.amount || 0),
    }));
}
