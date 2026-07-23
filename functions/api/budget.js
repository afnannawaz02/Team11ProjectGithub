/**
 * functions/api/budget.js — Cloudflare Pages Function
 *
 * GET  /api/budget?month=YYYY-MM   — get planned budget + actual spending for a month
 * POST /api/budget                 — upsert a planned budget row for a category
 * DELETE /api/budget?category=X&month=YYYY-MM — remove a budget line
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

  // ── GET /api/budget?month=YYYY-MM ─────────────────────────────────────────
  if (method === 'GET') {
    const month = url.searchParams.get('month') || new Date().toISOString().slice(0, 7);

    // Load plans for the month
    const planRows = await env.DB.prepare(
      `SELECT category, planned FROM budget_plans WHERE user_id=? AND month=?`
    ).bind(user.id, month).all();
    const plans = {};
    for (const row of (planRows.results || [])) {
      plans[row.category] = row.planned;
    }

    // Budget vs actual is built from the transaction category totals held in the
    // spending endpoint's demo data (or real Plaid if connected). We return only
    // the plan data here; the frontend merges with spending data.
    return Response.json({ ok: true, month, plans });
  }

  // ── POST /api/budget ───────────────────────────────────────────────────────
  if (method === 'POST') {
    const body = await request.json().catch(() => ({}));
    const { category, planned, month } = body;

    if (!category?.trim() || planned == null || !month?.match(/^\d{4}-\d{2}$/)) {
      return Response.json({ error: 'category, planned, and month (YYYY-MM) required.' }, { status: 400 });
    }

    await env.DB.prepare(
      `INSERT INTO budget_plans (user_id, category, planned, month)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(user_id, category, month) DO UPDATE SET planned=excluded.planned`
    ).bind(user.id, category.trim(), planned, month).run();

    return Response.json({ ok: true });
  }

  // ── DELETE /api/budget?category=X&month=YYYY-MM ───────────────────────────
  if (method === 'DELETE') {
    const category = url.searchParams.get('category');
    const month    = url.searchParams.get('month');
    if (!category || !month) return Response.json({ error: 'category and month required.' }, { status: 400 });

    await env.DB.prepare(
      `DELETE FROM budget_plans WHERE user_id=? AND category=? AND month=?`
    ).bind(user.id, category, month).run();

    return Response.json({ ok: true });
  }

  return Response.json({ error: 'Method not allowed.' }, { status: 405 });
}
