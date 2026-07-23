/**
 * functions/api/goals.js — Cloudflare Pages Function
 *
 * GET    /api/goals            — list all goals for user
 * POST   /api/goals            — create a goal
 * PUT    /api/goals?id=:id     — update a goal (amount, contribution, etc.)
 * DELETE /api/goals?id=:id     — delete a goal
 *
 * Auth: requires cb_session cookie.
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

/** Compute estimated completion date from a goal row */
function computeGoal(goal) {
  const remaining = goal.target_amount - goal.current_amount;
  const pct = goal.target_amount > 0
    ? Math.min(100, Math.round((goal.current_amount / goal.target_amount) * 100))
    : 0;

  let estimated_months = null;
  let estimated_date   = null;

  if (goal.monthly_contribution > 0 && remaining > 0) {
    estimated_months = Math.ceil(remaining / goal.monthly_contribution);
    const d = new Date();
    d.setMonth(d.getMonth() + estimated_months);
    estimated_date = d.toISOString().slice(0, 7); // YYYY-MM
  } else if (remaining <= 0) {
    estimated_date = 'Completed';
  }

  return {
    ...goal,
    pct,
    remaining: Math.max(0, remaining),
    estimated_months,
    estimated_date,
  };
}

export async function onRequest({ request, env }) {
  const user = await requireUser(request, env);
  if (!user) return Response.json({ error: 'Unauthorised.' }, { status: 401 });

  const url    = new URL(request.url);
  const method = request.method;
  const goalId = url.searchParams.get('id');

  // ── GET /api/goals ─────────────────────────────────────────────────────────
  if (method === 'GET') {
    const rows = await env.DB.prepare(
      `SELECT * FROM goals WHERE user_id = ? ORDER BY created_at ASC`
    ).bind(user.id).all();

    const goals = (rows.results || []).map(computeGoal);
    return Response.json({ ok: true, goals });
  }

  // ── POST /api/goals ────────────────────────────────────────────────────────
  if (method === 'POST') {
    const body = await request.json().catch(() => ({}));
    const { name, target_amount, current_amount = 0, monthly_contribution = 0, target_date = null, category = 'general' } = body;

    if (!name?.trim() || !target_amount || target_amount <= 0) {
      return Response.json({ error: 'name and target_amount are required.' }, { status: 400 });
    }

    const id = crypto.randomUUID();
    await env.DB.prepare(
      `INSERT INTO goals (id, user_id, name, target_amount, current_amount, monthly_contribution, target_date, category)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(id, user.id, name.trim(), target_amount, current_amount, monthly_contribution, target_date, category).run();

    // Seed standard milestones (25%, 50%, 75%, 100%)
    await env.DB.batch([
      env.DB.prepare(`INSERT INTO goal_milestones (goal_id, pct) VALUES (?, 25)`).bind(id),
      env.DB.prepare(`INSERT INTO goal_milestones (goal_id, pct) VALUES (?, 50)`).bind(id),
      env.DB.prepare(`INSERT INTO goal_milestones (goal_id, pct) VALUES (?, 75)`).bind(id),
      env.DB.prepare(`INSERT INTO goal_milestones (goal_id, pct) VALUES (?, 100)`).bind(id),
    ]);

    const row = await env.DB.prepare(`SELECT * FROM goals WHERE id = ?`).bind(id).first();
    return Response.json({ ok: true, goal: computeGoal(row) }, { status: 201 });
  }

  // ── PUT /api/goals?id=:id ──────────────────────────────────────────────────
  if (method === 'PUT' && goalId) {
    const body = await request.json().catch(() => ({}));
    const { name, target_amount, current_amount, monthly_contribution, target_date, category } = body;

    // Only update provided fields
    const existing = await env.DB.prepare(
      `SELECT * FROM goals WHERE id = ? AND user_id = ?`
    ).bind(goalId, user.id).first();

    if (!existing) return Response.json({ error: 'Goal not found.' }, { status: 404 });

    const updated = {
      name:                name               ?? existing.name,
      target_amount:       target_amount      ?? existing.target_amount,
      current_amount:      current_amount     ?? existing.current_amount,
      monthly_contribution: monthly_contribution ?? existing.monthly_contribution,
      target_date:         target_date        !== undefined ? target_date : existing.target_date,
      category:            category           ?? existing.category,
    };

    await env.DB.prepare(
      `UPDATE goals SET name=?, target_amount=?, current_amount=?, monthly_contribution=?,
       target_date=?, category=?, updated_at=datetime('now') WHERE id=? AND user_id=?`
    ).bind(
      updated.name, updated.target_amount, updated.current_amount,
      updated.monthly_contribution, updated.target_date, updated.category,
      goalId, user.id
    ).run();

    // Check & mark newly reached milestones, fire notifications
    const prevPct = existing.target_amount > 0
      ? Math.round((existing.current_amount / existing.target_amount) * 100) : 0;
    const newPct  = updated.target_amount  > 0
      ? Math.round((updated.current_amount  / updated.target_amount)  * 100) : 0;

    if (newPct > prevPct) {
      const milestones = await env.DB.prepare(
        `SELECT * FROM goal_milestones WHERE goal_id = ? AND reached_at IS NULL AND pct <= ?`
      ).bind(goalId, newPct).all();

      for (const m of (milestones.results || [])) {
        await env.DB.prepare(
          `UPDATE goal_milestones SET reached_at=datetime('now') WHERE id=?`
        ).bind(m.id).run();

        // Insert notification
        await env.DB.prepare(
          `INSERT INTO notifications (id, user_id, kind, title, body)
           VALUES (?, ?, 'goal_milestone', ?, ?)`
        ).bind(
          crypto.randomUUID(),
          user.id,
          `Goal milestone reached!`,
          `"${updated.name}" is ${m.pct}% funded — great progress!`
        ).run();
      }
    }

    const row = await env.DB.prepare(`SELECT * FROM goals WHERE id = ?`).bind(goalId).first();
    return Response.json({ ok: true, goal: computeGoal(row) });
  }

  // ── DELETE /api/goals?id=:id ───────────────────────────────────────────────
  if (method === 'DELETE' && goalId) {
    const result = await env.DB.prepare(
      `DELETE FROM goals WHERE id = ? AND user_id = ?`
    ).bind(goalId, user.id).run();

    if (!result.meta?.changes) return Response.json({ error: 'Goal not found.' }, { status: 404 });
    return Response.json({ ok: true });
  }

  return Response.json({ error: 'Method not allowed.' }, { status: 405 });
}
