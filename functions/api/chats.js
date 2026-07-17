/**
 * functions/api/chats.js — Cloudflare Pages Function
 * Chat session & message persistence in D1.
 *
 * Routes (all require a valid session cookie):
 *   GET  /api/chats?action=list                      — all sessions for the user
 *   GET  /api/chats?action=messages&session_id=<id>  — messages for one session
 *   POST /api/chats?action=upsert_session            — create/update a session (title, pinned)
 *   POST /api/chats?action=save_message              — append one message to a session
 *   POST /api/chats?action=delete_session            — delete a session + all its messages
 */

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function getSessionToken(request) {
  const cookie = request.headers.get('cookie') || '';
  const match  = cookie.match(/cb_session=([a-f0-9]{64})/);
  return match ? match[1] : null;
}

async function getUser(request, env) {
  const token = getSessionToken(request);
  if (!token) return null;
  return env.DB.prepare(`
    SELECT users.id, users.username
    FROM sessions
    JOIN users ON users.id = sessions.user_id
    WHERE sessions.token = ? AND sessions.expires_at > datetime('now')
  `).bind(token).first();
}

export async function onRequest({ request, env }) {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204 });

  const url    = new URL(request.url);
  const action = url.searchParams.get('action');

  try {
    const user = await getUser(request, env);
    if (!user) return json({ error: 'Unauthorised' }, 401);

    // ── GET: list all sessions for the user ──────────────────────────────────
    if (action === 'list' && request.method === 'GET') {
      const { results } = await env.DB.prepare(`
        SELECT id, title, pinned, created_at
        FROM chat_sessions
        WHERE user_id = ?
        ORDER BY pinned DESC, created_at DESC
        LIMIT 100
      `).bind(user.id).all();
      return json({ ok: true, sessions: results ?? [] });
    }

    // ── GET: messages for one session ────────────────────────────────────────
    if (action === 'messages' && request.method === 'GET') {
      const sessionId = url.searchParams.get('session_id');
      if (!sessionId) return json({ error: 'session_id required' }, 400);

      // Verify session belongs to user
      const sess = await env.DB.prepare(
        'SELECT id FROM chat_sessions WHERE id = ? AND user_id = ?'
      ).bind(sessionId, user.id).first();
      if (!sess) return json({ error: 'Not found' }, 404);

      const { results } = await env.DB.prepare(`
        SELECT sender, content, created_at
        FROM chat_messages
        WHERE session_id = ?
        ORDER BY created_at ASC, id ASC
      `).bind(sessionId).all();
      return json({ ok: true, messages: results ?? [] });
    }

    // ── POST: create or update a session (title, pinned) ─────────────────────
    if (action === 'upsert_session' && request.method === 'POST') {
      const { id, title, pinned } = await request.json();
      if (!id) return json({ error: 'id required' }, 400);

      await env.DB.prepare(`
        INSERT INTO chat_sessions (id, user_id, title, pinned)
        VALUES (?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          title  = CASE WHEN excluded.user_id = user_id THEN excluded.title  ELSE title  END,
          pinned = CASE WHEN excluded.user_id = user_id THEN excluded.pinned ELSE pinned END
      `).bind(id, user.id, title ?? 'New chat', pinned ? 1 : 0).run();

      return json({ ok: true });
    }

    // ── POST: append a message to a session ──────────────────────────────────
    if (action === 'save_message' && request.method === 'POST') {
      const { session_id, sender, content } = await request.json();
      if (!session_id || !sender || content === undefined) {
        return json({ error: 'session_id, sender and content required' }, 400);
      }

      // Ensure the session exists and belongs to this user (upsert with default title)
      await env.DB.prepare(`
        INSERT INTO chat_sessions (id, user_id, title, pinned)
        VALUES (?, ?, 'New chat', 0)
        ON CONFLICT(id) DO NOTHING
      `).bind(session_id, user.id).run();

      await env.DB.prepare(
        'INSERT INTO chat_messages (session_id, sender, content) VALUES (?, ?, ?)'
      ).bind(session_id, sender, content).run();

      return json({ ok: true });
    }

    // ── POST: delete a session and all its messages ──────────────────────────
    if (action === 'delete_session' && request.method === 'POST') {
      const { session_id } = await request.json();
      if (!session_id) return json({ error: 'session_id required' }, 400);

      // Only delete if it belongs to the user
      await env.DB.prepare(
        'DELETE FROM chat_sessions WHERE id = ? AND user_id = ?'
      ).bind(session_id, user.id).run();

      return json({ ok: true });
    }

    return json({ error: 'Not found' }, 404);

  } catch (err) {
    console.error('chats error', err);
    return json({ error: 'Internal server error' }, 500);
  }
}
