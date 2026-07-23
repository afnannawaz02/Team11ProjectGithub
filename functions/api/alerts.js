/**
 * functions/api/alerts.js — Cloudflare Pages Function
 *
 * GET    /api/alerts           — list stock alerts for user
 * POST   /api/alerts           — create an alert
 * DELETE /api/alerts?id=:id    — delete an alert
 *
 * POST /api/alerts?action=cron — Cloudflare Cron trigger endpoint
 *   Checks all active alerts, fires notifications for triggered ones.
 *   Bind to: scheduled cron via wrangler.toml (see notes below).
 *
 * Feature flag: FEATURE_ALERTS env var must not be 'false'
 *
 * Env: DB, FINNHUB_API_KEY
 */

const FH_BASE = 'https://finnhub.io/api/v1';

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

async function getPrice(ticker, apiKey) {
  try {
    const r = await fetch(`${FH_BASE}/quote?symbol=${ticker}&token=${apiKey}`);
    if (!r.ok) return null;
    const d = await r.json();
    return d.c || null;
  } catch { return null; }
}

/** Called by Cloudflare Cron — checks all untriggered alerts */
export async function onScheduled({ scheduledTime, env, ctx }) {
  if (!env.FINNHUB_API_KEY) return;

  const rows = await env.DB.prepare(
    `SELECT a.*, u.id as uid FROM stock_alerts a
     JOIN users u ON u.id = a.user_id
     WHERE a.triggered = 0`
  ).all();

  const alerts = rows.results || [];
  if (!alerts.length) return;

  // Group by ticker to minimise API calls
  const tickers = [...new Set(alerts.map((a) => a.ticker))];
  const prices  = {};
  await Promise.allSettled(tickers.map(async (t) => {
    const p = await getPrice(t, env.FINNHUB_API_KEY);
    if (p) prices[t] = p;
  }));

  const batch = [];
  for (const alert of alerts) {
    const price = prices[alert.ticker];
    if (!price) continue;

    const triggered = (alert.direction === 'above' && price >= alert.threshold)
                   || (alert.direction === 'below' && price <= alert.threshold);
    if (!triggered) continue;

    batch.push(
      env.DB.prepare(`UPDATE stock_alerts SET triggered=1, triggered_at=datetime('now') WHERE id=?`).bind(alert.id),
      env.DB.prepare(
        `INSERT INTO notifications (id, user_id, kind, title, body)
         VALUES (?, ?, 'alert_triggered', ?, ?)`
      ).bind(
        crypto.randomUUID(),
        alert.user_id,
        `${alert.ticker} price alert triggered`,
        `${alert.ticker} is now $${price.toFixed(2)} — ${alert.direction === 'above' ? 'above' : 'below'} your $${alert.threshold} threshold.`
      )
    );
  }

  if (batch.length) await env.DB.batch(batch);
}

export async function onRequest({ request, env }) {
  if (env.FEATURE_ALERTS === 'false') {
    return Response.json({ ok: true, alerts: [] });
  }

  const user = await requireUser(request, env);
  if (!user) return Response.json({ error: 'Unauthorised.' }, { status: 401 });

  const url    = new URL(request.url);
  const method = request.method;
  const alertId = url.searchParams.get('id');
  const action  = url.searchParams.get('action');

  // ── GET /api/alerts ────────────────────────────────────────────────────────
  if (method === 'GET') {
    const rows = await env.DB.prepare(
      `SELECT * FROM stock_alerts WHERE user_id=? ORDER BY created_at DESC`
    ).bind(user.id).all();
    return Response.json({ ok: true, alerts: rows.results || [] });
  }

  // ── POST /api/alerts ───────────────────────────────────────────────────────
  if (method === 'POST' && !action) {
    const body = await request.json().catch(() => ({}));
    const { ticker, direction, threshold } = body;

    if (!ticker?.trim() || !['above','below'].includes(direction) || !threshold) {
      return Response.json({ error: 'ticker, direction (above|below), and threshold required.' }, { status: 400 });
    }

    const id = crypto.randomUUID();
    await env.DB.prepare(
      `INSERT INTO stock_alerts (id, user_id, ticker, direction, threshold)
       VALUES (?, ?, ?, ?, ?)`
    ).bind(id, user.id, ticker.toUpperCase().trim(), direction, threshold).run();

    const row = await env.DB.prepare(`SELECT * FROM stock_alerts WHERE id=?`).bind(id).first();
    return Response.json({ ok: true, alert: row }, { status: 201 });
  }

  // ── POST /api/alerts?action=cron (manual trigger for testing) ────────────
  if (method === 'POST' && action === 'cron') {
    await onScheduled({ scheduledTime: Date.now(), env, ctx: {} });
    return Response.json({ ok: true, message: 'Alert check complete.' });
  }

  // ── DELETE /api/alerts?id=:id ─────────────────────────────────────────────
  if (method === 'DELETE' && alertId) {
    await env.DB.prepare(
      `DELETE FROM stock_alerts WHERE id=? AND user_id=?`
    ).bind(alertId, user.id).run();
    return Response.json({ ok: true });
  }

  return Response.json({ error: 'Method not allowed.' }, { status: 405 });
}
