/**
 * src/auth.js — API-backed auth (D1 + HttpOnly session cookie)
 *
 * All account data lives in Cloudflare D1 via /api/auth.
 * The browser holds only an HttpOnly session cookie — no passwords or
 * account data ever touch localStorage.
 *
 * Chat session titles/pins are still kept in localStorage as a lightweight
 * UI-only cache (no sensitive data).
 */

const BASE = '/api/auth';

async function call(action, body, method = 'POST') {
  const res = await fetch(`${BASE}?action=${action}`, {
    method,
    credentials: 'same-origin',
    headers: body ? { 'Content-Type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, ...data };
}

// ── Public API ─────────────────────────────────────────────────────────────────

/**
 * createAccount(username, password, email, profile)
 * Registers via D1. Returns { ok, username } or { ok: false, error }.
 */
export async function createAccount(username, password, email, profile) {
  return call('register', { username, password, email, profile });
}

/**
 * login(username, password)
 * Returns { ok, username, profile } or { ok: false, error }.
 */
export async function login(username, password) {
  const res = await call('login', { username, password });
  if (res.ok) {
    // Cache username for quick UI reads (no sensitive data)
    sessionStorage.setItem('cb_user', JSON.stringify({ username: res.username }));
  }
  return res;
}

/**
 * logout() — invalidates the server session and clears local cache.
 */
export async function logout() {
  sessionStorage.removeItem('cb_user');
  await call('logout', null);
}

/**
 * getSession() — returns { username } from in-memory cache, or null.
 * For page-load restoration, call restoreSession() instead.
 */
export function getSession() {
  try {
    return JSON.parse(sessionStorage.getItem('cb_user') || 'null');
  } catch {
    return null;
  }
}

/**
 * restoreSession() — validates the HttpOnly cookie with the server.
 * Returns { ok, username, profile } or { ok: false }.
 * Call once on app boot.
 */
export async function restoreSession() {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 4000);
  const res = await fetch(`${BASE}?action=me`, {
    method: 'GET',
    credentials: 'same-origin',
    signal: controller.signal,
  }).then((r) => r.json()).catch(() => ({ ok: false }));
  clearTimeout(timer);

  if (res.ok) {
    sessionStorage.setItem('cb_user', JSON.stringify({ username: res.username }));
  } else {
    sessionStorage.removeItem('cb_user');
  }
  return res;
}

/**
 * hasAnyAccount() — can't know without a server call when using D1.
 * Returns false so the UI always shows the "create account" path.
 */
export function hasAnyAccount() {
  return !!getSession();
}

/**
 * getAccountByUsername() — not needed with server-side sessions.
 * Kept for compatibility; returns null.
 */
export function getAccountByUsername() {
  return null;
}

/**
 * saveSessions / loadSessions — local UI cache kept for offline/fallback only.
 * The authoritative store is D1 via /api/chats.
 */
export function saveSessions(username, sessions) {
  if (!username) return;
  localStorage.setItem(`cb_sessions_${username.toLowerCase()}`, JSON.stringify(sessions));
}

export function loadSessions(username) {
  if (!username) return null;
  try {
    const raw = localStorage.getItem(`cb_sessions_${username.toLowerCase()}`);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

// ── D1-backed chat API helpers ─────────────────────────────────────────────────

const CHATS = '/api/chats';

async function chatsCall(action, params = {}, body = null) {
  const qs  = new URLSearchParams({ action, ...params });
  const res = await fetch(`${CHATS}?${qs}`, {
    method:      body ? 'POST' : 'GET',
    credentials: 'same-origin',
    headers:     body ? { 'Content-Type': 'application/json' } : {},
    body:        body ? JSON.stringify(body) : undefined,
  });
  return res.json().catch(() => ({ ok: false }));
}

/** Fetch all chat sessions for the logged-in user from D1. */
export async function fetchChatSessions() {
  const data = await chatsCall('list');
  return data.ok ? data.sessions : null;
}

/** Fetch all messages for one session id from D1. */
export async function fetchChatMessages(sessionId) {
  const data = await chatsCall('messages', { session_id: sessionId });
  return data.ok ? data.messages : null;
}

/** Create or update a session (title, pinned). */
export async function upsertChatSession(id, title, pinned) {
  return chatsCall('upsert_session', {}, { id, title, pinned });
}

/** Append a single message to a session. */
export async function saveChatMessage(sessionId, sender, content) {
  return chatsCall('save_message', {}, { session_id: sessionId, sender, content });
}

/** Delete a session (and all its messages) from D1. */
export async function deleteChatSession(sessionId) {
  return chatsCall('delete_session', {}, { session_id: sessionId });
}
