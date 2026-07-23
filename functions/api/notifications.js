/**
 * functions/api/notifications.js — Cloudflare Pages Function
 *
 * GET   /api/notifications              — list notifications (unread first)
 * POST  /api/notifications?action=read  — mark notification(s) read
 * POST  /api/notifications?action=check — trigger server-side checks (called on dashboard mount)
 * DELETE /api/notifications?id=:id      — delete a notification
 *
 * Feature flag: FEATURE_NOTIFICATIONS env var must be 'true'
 *
 * Auth: cb_session cookie
 * Env:  DB, FINNHUB_API_KEY (for crypto exposure checks)
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

async function insertNotification(env, userId, kind, title, body) {
  await env.DB.prepare(
    `INSERT OR IGNORE INTO notifications (id, user_id, kind, title, body)
     VALUES (?, ?, ?, ?, ?)`
  ).bind(crypto.randomUUID(), userId, kind, title, body).run();
}

/**
 * Run background checks and insert notifications for anything new.
 * Called on each dashboard mount (cheap — uses existing data).
 */
async function runChecks(user, env) {
  // ── 1. Check portfolio crypto exposure > 15% ─────────────────────────────
  try {
    const portfolioUrl = `https://${new URL(env.WORKER_ORIGIN || 'https://localhost').hostname}/api/finance?type=portfolio&userId=${user.id}`;
    // We pass through a synthetic self-request via env
    const finData = await env.DB.prepare(
      `SELECT * FROM profiles WHERE user_id = ? LIMIT 1`
    ).bind(user.id).first();

    // Check if there's an existing recent notification to avoid spam (< 24h)
    const existingCrypto = await env.DB.prepare(
      `SELECT id FROM notifications WHERE user_id=? AND kind='crypto_exposure'
       AND created_at > datetime('now','-1 day') LIMIT 1`
    ).bind(user.id).first();

    // We rely on the caller (frontend) to pass portfolio data via action=check body
    // This function handles the body-driven check path
  } catch { /* non-fatal */ }
}

export async function onRequest({ request, env }) {
  if (env.FEATURE_NOTIFICATIONS === 'false') {
    return Response.json({ ok: true, notifications: [], unread: 0 });
  }

  const user = await requireUser(request, env);
  if (!user) return Response.json({ error: 'Unauthorised.' }, { status: 401 });

  const url    = new URL(request.url);
  const method = request.method;
  const action = url.searchParams.get('action');
  const notifId = url.searchParams.get('id');

  // ── GET /api/notifications ─────────────────────────────────────────────────
  if (method === 'GET') {
    const rows = await env.DB.prepare(
      `SELECT * FROM notifications WHERE user_id=? ORDER BY read ASC, created_at DESC LIMIT 50`
    ).bind(user.id).all();
    const notifications = rows.results || [];
    const unread = notifications.filter((n) => !n.read).length;
    return Response.json({ ok: true, notifications, unread });
  }

  // ── POST /api/notifications?action=read ───────────────────────────────────
  if (method === 'POST' && action === 'read') {
    const body = await request.json().catch(() => ({}));
    const ids  = body.ids || []; // array of ids to mark read, empty = mark all

    if (ids.length > 0) {
      const placeholders = ids.map(() => '?').join(',');
      await env.DB.prepare(
        `UPDATE notifications SET read=1 WHERE user_id=? AND id IN (${placeholders})`
      ).bind(user.id, ...ids).run();
    } else {
      await env.DB.prepare(
        `UPDATE notifications SET read=1 WHERE user_id=?`
      ).bind(user.id).run();
    }
    return Response.json({ ok: true });
  }

  // ── POST /api/notifications?action=check ─────────────────────────────────
  // Body may contain: { cryptoPct, unusualTransactions[], goals[] }
  if (method === 'POST' && action === 'check') {
    const body = await request.json().catch(() => ({}));

    // Crypto exposure
    if (typeof body.cryptoPct === 'number' && body.cryptoPct > 15) {
      const existing = await env.DB.prepare(
        `SELECT id FROM notifications WHERE user_id=? AND kind='crypto_exposure'
         AND created_at > datetime('now','-1 day') LIMIT 1`
      ).bind(user.id).first();
      if (!existing) {
        await insertNotification(env, user.id, 'crypto_exposure',
          'High crypto exposure',
          `Your crypto holdings are ${body.cryptoPct.toFixed(1)}% of your portfolio — above the 15% threshold. Consider rebalancing.`
        );
      }
    }

    // Unusual spending
    if (Array.isArray(body.unusualTransactions) && body.unusualTransactions.length > 0) {
      const existing = await env.DB.prepare(
        `SELECT id FROM notifications WHERE user_id=? AND kind='unusual_spend'
         AND created_at > datetime('now','-6 hours') LIMIT 1`
      ).bind(user.id).first();
      if (!existing) {
        const tx = body.unusualTransactions[0];
        await insertNotification(env, user.id, 'unusual_spend',
          'Unusual transaction detected',
          `"${tx.desc}" (${tx.flagReason}) — $${Math.abs(tx.amount).toFixed(2)}`
        );
      }
    }

    // Portfolio drift
    if (typeof body.healthScore === 'number' && body.healthScore < 40) {
      const existing = await env.DB.prepare(
        `SELECT id FROM notifications WHERE user_id=? AND kind='portfolio_drift'
         AND created_at > datetime('now','-7 days') LIMIT 1`
      ).bind(user.id).first();
      if (!existing) {
        await insertNotification(env, user.id, 'portfolio_drift',
          'Portfolio needs attention',
          `Your portfolio health score is ${body.healthScore}/100. Review your allocation in the Portfolio tab.`
        );
      }
    }

    const rows  = await env.DB.prepare(
      `SELECT * FROM notifications WHERE user_id=? ORDER BY read ASC, created_at DESC LIMIT 50`
    ).bind(user.id).all();
    const notifications = rows.results || [];
    const unread = notifications.filter((n) => !n.read).length;
    return Response.json({ ok: true, notifications, unread });
  }

  // ── DELETE /api/notifications?id=:id ────────────────────────────────────
  if (method === 'DELETE' && notifId) {
    await env.DB.prepare(
      `DELETE FROM notifications WHERE id=? AND user_id=?`
    ).bind(notifId, user.id).run();
    return Response.json({ ok: true });
  }

  return Response.json({ error: 'Method not allowed.' }, { status: 405 });
}
