/**
 * functions/api/auth.js — Cloudflare Pages Function
 * Handles: POST /api/auth?action=register|login|me|logout
 *
 * D1 binding: DB
 * KV binding: OTP_STORE
 */

const SESSION_TTL = 60 * 60 * 24 * 7; // 7 days in seconds

// ── Helpers ────────────────────────────────────────────────────────────────────
async function sha256hex(text) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

function randomToken() {
  const arr = new Uint8Array(32);
  crypto.getRandomValues(arr);
  return Array.from(arr).map((b) => b.toString(16).padStart(2, '0')).join('');
}

function sessionCookie(token, clear = false) {
  const val   = clear ? '' : token;
  const maxAge = clear ? 0 : SESSION_TTL;
  return `cb_session=${val}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${maxAge}`;
}

function getSessionToken(request) {
  const cookie = request.headers.get('cookie') || '';
  const match  = cookie.match(/cb_session=([a-f0-9]{64})/);
  return match ? match[1] : null;
}

function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers },
  });
}

// ── Route handler ──────────────────────────────────────────────────────────────
export async function onRequest({ request, env }) {
  const url    = new URL(request.url);
  const action = url.searchParams.get('action');

  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204 });
  }

  try {
    if (action === 'register' && request.method === 'POST') return register(request, env);
    if (action === 'login'    && request.method === 'POST') return loginHandler(request, env);
    if (action === 'me'       && request.method === 'GET')  return me(request, env);
    if (action === 'logout'   && request.method === 'POST') return logoutHandler(request, env);
    if (action === 'profile'  && request.method === 'POST') return saveProfile(request, env);
    return json({ error: 'Not found' }, 404);
  } catch (err) {
    console.error('auth error', err);
    return json({ error: 'Internal server error' }, 500);
  }
}

// ── Register ──────────────────────────────────────────────────────────────────
async function register(request, env) {
  const { username, password, email, profile } = await request.json();

  if (!username || username.length < 3)   return json({ error: 'Username must be at least 3 characters.' }, 400);
  if (!password || password.length < 6)   return json({ error: 'Password must be at least 6 characters.' }, 400);
  if (!email || !email.endsWith('@ibm.com')) return json({ error: 'A verified @ibm.com email is required.' }, 400);

  const normalEmail = email.trim().toLowerCase();

  // Check username not taken
  const existing = await env.DB.prepare(
    'SELECT id FROM users WHERE LOWER(username) = ?'
  ).bind(username.toLowerCase()).first();
  if (existing) return json({ error: 'That username is already taken.' }, 409);

  const passwordHash = await sha256hex(password);

  // Insert user
  const result = await env.DB.prepare(
    'INSERT INTO users (username, password_hash, email) VALUES (?, ?, ?) RETURNING id'
  ).bind(username.trim(), passwordHash, normalEmail).first();

  const userId = result.id;

  // Save profile if provided
  if (profile) {
    await env.DB.prepare(`
      INSERT INTO profiles (user_id, goals, risk, horizon, annual_income, monthly_savings,
        emergency_fund, current_investments, dob, marital_status, employment_status,
        credit_score, us_state, city, veteran_status, preferences)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      userId,
      JSON.stringify(profile.goals ?? []),
      profile.risk ?? '',
      profile.horizon ?? '',
      profile.annualIncome ?? '',
      profile.monthlySavings ?? '',
      profile.emergencyFund ?? '',
      JSON.stringify(profile.currentInvestments ?? []),
      profile.dob ?? '',
      profile.maritalStatus ?? '',
      profile.employmentStatus ?? '',
      profile.creditScore ?? '',
      profile.usState ?? '',
      profile.city ?? '',
      profile.veteranStatus ?? '',
      JSON.stringify(profile.preferences ?? []),
    ).run();
  }

  // Create session
  const token = randomToken();
  await env.DB.prepare(
    'INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, datetime("now", "+7 days"))'
  ).bind(token, userId).run();

  return json({ ok: true, username: username.trim() }, 201, {
    'Set-Cookie': sessionCookie(token),
  });
}

// ── Login ──────────────────────────────────────────────────────────────────────
async function loginHandler(request, env) {
  const { username, password } = await request.json();

  if (!username || !password) return json({ error: 'Username and password required.' }, 400);

  const user = await env.DB.prepare(
    'SELECT id, username, password_hash FROM users WHERE LOWER(username) = ?'
  ).bind(username.toLowerCase()).first();

  if (!user) return json({ error: 'No account found with that username.' }, 401);

  const hash = await sha256hex(password);
  if (hash !== user.password_hash) return json({ error: 'Incorrect password.' }, 401);

  // Fetch profile
  const profileRow = await env.DB.prepare(
    'SELECT * FROM profiles WHERE user_id = ?'
  ).bind(user.id).first();

  const profile = profileRow ? {
    goals:               JSON.parse(profileRow.goals               || '[]'),
    risk:                profileRow.risk,
    horizon:             profileRow.horizon,
    annualIncome:        profileRow.annual_income,
    monthlySavings:      profileRow.monthly_savings,
    emergencyFund:       profileRow.emergency_fund,
    currentInvestments:  JSON.parse(profileRow.current_investments || '[]'),
    dob:                 profileRow.dob,
    maritalStatus:       profileRow.marital_status,
    employmentStatus:    profileRow.employment_status,
    creditScore:         profileRow.credit_score,
    usState:             profileRow.us_state,
    city:                profileRow.city,
    veteranStatus:       profileRow.veteran_status,
    preferences:         JSON.parse(profileRow.preferences         || '[]'),
  } : null;

  // Create session
  const token = randomToken();
  await env.DB.prepare(
    'INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, datetime("now", "+7 days"))'
  ).bind(token, user.id).run();

  return json({ ok: true, username: user.username, profile }, 200, {
    'Set-Cookie': sessionCookie(token),
  });
}

// ── Me (session check) ─────────────────────────────────────────────────────────
async function me(request, env) {
  const token = getSessionToken(request);
  if (!token) return json({ ok: false }, 401);

  const session = await env.DB.prepare(`
    SELECT users.id, users.username
    FROM sessions
    JOIN users ON users.id = sessions.user_id
    WHERE sessions.token = ? AND sessions.expires_at > datetime('now')
  `).bind(token).first();

  if (!session) return json({ ok: false }, 401);

  const profileRow = await env.DB.prepare(
    'SELECT * FROM profiles WHERE user_id = ?'
  ).bind(session.id).first();

  const profile = profileRow ? {
    goals:               JSON.parse(profileRow.goals               || '[]'),
    risk:                profileRow.risk,
    horizon:             profileRow.horizon,
    annualIncome:        profileRow.annual_income,
    monthlySavings:      profileRow.monthly_savings,
    emergencyFund:       profileRow.emergency_fund,
    currentInvestments:  JSON.parse(profileRow.current_investments || '[]'),
    dob:                 profileRow.dob,
    maritalStatus:       profileRow.marital_status,
    employmentStatus:    profileRow.employment_status,
    creditScore:         profileRow.credit_score,
    usState:             profileRow.us_state,
    city:                profileRow.city,
    veteranStatus:       profileRow.veteran_status,
    preferences:         JSON.parse(profileRow.preferences         || '[]'),
  } : null;

  return json({ ok: true, username: session.username, profile });
}

// ── Logout ─────────────────────────────────────────────────────────────────────
async function logoutHandler(request, env) {
  const token = getSessionToken(request);
  if (token) {
    await env.DB.prepare('DELETE FROM sessions WHERE token = ?').bind(token).run();
  }
  return json({ ok: true }, 200, { 'Set-Cookie': sessionCookie('', true) });
}

// ── Save / update profile ──────────────────────────────────────────────────────
async function saveProfile(request, env) {
  const token = getSessionToken(request);
  if (!token) return json({ error: 'Unauthorised' }, 401);

  const session = await env.DB.prepare(`
    SELECT users.id FROM sessions
    JOIN users ON users.id = sessions.user_id
    WHERE sessions.token = ? AND sessions.expires_at > datetime('now')
  `).bind(token).first();

  if (!session) return json({ error: 'Session expired' }, 401);

  const p = await request.json();

  await env.DB.prepare(`
    INSERT INTO profiles (user_id, goals, risk, horizon, annual_income, monthly_savings,
      emergency_fund, current_investments, dob, marital_status, employment_status,
      credit_score, us_state, city, veteran_status, preferences, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
    ON CONFLICT(user_id) DO UPDATE SET
      goals=excluded.goals, risk=excluded.risk, horizon=excluded.horizon,
      annual_income=excluded.annual_income, monthly_savings=excluded.monthly_savings,
      emergency_fund=excluded.emergency_fund, current_investments=excluded.current_investments,
      dob=excluded.dob, marital_status=excluded.marital_status,
      employment_status=excluded.employment_status, credit_score=excluded.credit_score,
      us_state=excluded.us_state, city=excluded.city,
      veteran_status=excluded.veteran_status, preferences=excluded.preferences,
      updated_at=datetime('now')
  `).bind(
    session.id,
    JSON.stringify(p.goals ?? []),
    p.risk ?? '',
    p.horizon ?? '',
    p.annualIncome ?? '',
    p.monthlySavings ?? '',
    p.emergencyFund ?? '',
    JSON.stringify(p.currentInvestments ?? []),
    p.dob ?? '',
    p.maritalStatus ?? '',
    p.employmentStatus ?? '',
    p.creditScore ?? '',
    p.usState ?? '',
    p.city ?? '',
    p.veteranStatus ?? '',
    JSON.stringify(p.preferences ?? []),
  ).run();

  return json({ ok: true });
}
