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
 * saveSessions / loadSessions — chat history UI cache (localStorage, non-sensitive)
 */
export function saveSessions(username, sessions) {
  if (!username) return;
  localStorage.setItem(`cb_sessions_${username.toLowerCase()}`, JSON.stringify(sessions));
}

export function loadSessions(username) {
  if (!username) return null;
  try {
    const raw = localStorage.getItem(`cb_sessions_${username.toLowerCase()}`);
    if (!raw) return null;
    const sessions = JSON.parse(raw);
    // Strip any messages that contain old error text from broken sessions
    const cleaned = sessions.map((s) => ({
      ...s,
      messages: s.messages.filter((m) =>
        !(m.sender === 'bot' && (
          m.text?.includes('Could not reach the AI server') ||
          m.text?.includes('Network error') ||
          m.text?.includes('npm run server') ||
          m.text?.includes('<!DOCTYPE')
        ))
      ),
    }));
    return cleaned;
  } catch {
    return null;
  }
}
