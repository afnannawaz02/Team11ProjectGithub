/**
 * src/auth.js — local account cache (demo / localhost only)
 *
 * Storage layout in localStorage:
 *   cb_accounts  — JSON array of { username, passwordHash, profile }
 *   cb_session   — JSON { username } when someone is logged in
 *
 * Passwords are hashed with SHA-256 via the Web Crypto API before storage.
 * This is NOT production-grade security — it is appropriate for a local demo
 * where no data leaves the browser.
 */

const ACCOUNTS_KEY = 'cb_accounts';
const SESSION_KEY  = 'cb_session';

// ── Hashing ───────────────────────────────────────────────────────────────────
async function sha256(text) {
  const buf = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(text)
  );
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

// ── Raw store helpers ─────────────────────────────────────────────────────────
function loadAccounts() {
  try {
    return JSON.parse(localStorage.getItem(ACCOUNTS_KEY) || '[]');
  } catch {
    return [];
  }
}

function saveAccounts(accounts) {
  localStorage.setItem(ACCOUNTS_KEY, JSON.stringify(accounts));
}

// ── Public API ─────────────────────────────────────────────────────────────────

/**
 * createAccount(username, password, profile)
 * Returns { ok: true } or { ok: false, error: string }
 */
export async function createAccount(username, password, profile) {
  const accounts = loadAccounts();

  if (accounts.some((a) => a.username.toLowerCase() === username.toLowerCase())) {
    return { ok: false, error: 'That username is already taken.' };
  }

  const passwordHash = await sha256(password);
  accounts.push({ username, passwordHash, profile });
  saveAccounts(accounts);

  // Auto-login after creation
  localStorage.setItem(SESSION_KEY, JSON.stringify({ username }));

  return { ok: true };
}

/**
 * login(username, password)
 * Returns { ok: true, account } or { ok: false, error: string }
 */
export async function login(username, password) {
  const accounts = loadAccounts();
  const account  = accounts.find(
    (a) => a.username.toLowerCase() === username.toLowerCase()
  );

  if (!account) {
    return { ok: false, error: 'No account found with that username.' };
  }

  const passwordHash = await sha256(password);
  if (passwordHash !== account.passwordHash) {
    return { ok: false, error: 'Incorrect password.' };
  }

  localStorage.setItem(SESSION_KEY, JSON.stringify({ username: account.username }));
  return { ok: true, account };
}

/**
 * logout() — clears the active session (keeps the account in the store)
 */
export function logout() {
  localStorage.removeItem(SESSION_KEY);
}

/**
 * getSession() — returns { username } if logged in, or null
 */
export function getSession() {
  try {
    return JSON.parse(localStorage.getItem(SESSION_KEY) || 'null');
  } catch {
    return null;
  }
}

/**
 * getAccountByUsername(username) — returns the full account object or null
 */
export function getAccountByUsername(username) {
  return loadAccounts().find(
    (a) => a.username.toLowerCase() === username.toLowerCase()
  ) ?? null;
}

/**
 * hasAnyAccount() — true if at least one account has been created
 */
export function hasAnyAccount() {
  return loadAccounts().length > 0;
}

/**
 * updateProfile(username, profile) — saves an updated investor profile
 */
export function updateProfile(username, profile) {
  const accounts = loadAccounts();
  const idx = accounts.findIndex(
    (a) => a.username.toLowerCase() === username.toLowerCase()
  );
  if (idx !== -1) {
    accounts[idx].profile = profile;
    saveAccounts(accounts);
  }
}
