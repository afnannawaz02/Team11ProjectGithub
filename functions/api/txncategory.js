/**
 * functions/api/txncategory.js — Cloudflare Pages Function
 *
 * GET  /api/txncategory                         — list all overrides for user
 * POST /api/txncategory                         — upsert a category override
 * DELETE /api/txncategory?txn_id=X              — remove an override
 *
 * Auth: cb_session cookie
 * Env:  DB
 */

async function requireUser(request, env) {
  const cookie = request.headers.get('Cookie') || '';
  const token  = cookie.match(/cb_session=([^;]+)/)?.[1];
  if (!token) return null;
  return await env.DB.prepare(
    `SELECT u.id, u.username FROM sessions s
     JOIN users u ON u.id = s.user_id
     WHERE s.token = ? AND s.expires_at > datetime('now') LIMIT 1`
  ).bind(token).first();
}

export async function onRequest({ request, env }) {
  const user = await requireUser(request, env);
  if (!user) return Response.json({ error: 'Unauthorised.' }, { status: 401 });

  const url    = new URL(request.url);
  const method = request.method;

  // ── GET ───────────────────────────────────────────────────────────────────
  if (method === 'GET') {
    const rows = await env.DB.prepare(
      `SELECT txn_id, category, recurring FROM txn_category_overrides WHERE user_id=?`
    ).bind(user.id).all();
    const overrides = {};
    for (const r of (rows.results || [])) {
      overrides[r.txn_id] = { category: r.category, recurring: !!r.recurring };
    }
    return Response.json({ ok: true, overrides });
  }

  // ── POST ──────────────────────────────────────────────────────────────────
  if (method === 'POST') {
    const body = await request.json().catch(() => ({}));
    const { txn_id, category, recurring = false } = body;

    if (!txn_id?.trim() || !category?.trim()) {
      return Response.json({ error: 'txn_id and category required.' }, { status: 400 });
    }

    await env.DB.prepare(
      `INSERT INTO txn_category_overrides (user_id, txn_id, category, recurring)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(user_id, txn_id) DO UPDATE SET category=excluded.category, recurring=excluded.recurring, updated_at=datetime('now')`
    ).bind(user.id, txn_id.trim(), category.trim(), recurring ? 1 : 0).run();

    return Response.json({ ok: true });
  }

  // ── DELETE ────────────────────────────────────────────────────────────────
  if (method === 'DELETE') {
    const txnId = url.searchParams.get('txn_id');
    if (!txnId) return Response.json({ error: 'txn_id required.' }, { status: 400 });

    await env.DB.prepare(
      `DELETE FROM txn_category_overrides WHERE user_id=? AND txn_id=?`
    ).bind(user.id, txnId).run();

    return Response.json({ ok: true });
  }

  return Response.json({ error: 'Method not allowed.' }, { status: 405 });
}
