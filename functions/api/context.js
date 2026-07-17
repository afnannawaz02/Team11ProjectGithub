/**
 * functions/api/context.js  —  Cloudflare Pages Function
 *
 * GET /api/context
 *
 * Returns the authenticated user's financial profile from D1 as JSON,
 * used by the dashboard sidebar cards.  No sensitive credentials are exposed.
 *
 * D1 binding: DB
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

export async function onRequestGet({ request, env }) {
  const token = getSessionToken(request);
  if (!token) return json({ ok: false, profile: null }, 401);

  try {
    const session = await env.DB.prepare(`
      SELECT users.id, users.username, users.email
      FROM sessions
      JOIN users ON users.id = sessions.user_id
      WHERE sessions.token = ? AND sessions.expires_at > datetime('now')
    `).bind(token).first();

    if (!session) return json({ ok: false, profile: null }, 401);

    const profileRow = await env.DB.prepare(
      'SELECT * FROM profiles WHERE user_id = ?'
    ).bind(session.id).first();

    const profile = profileRow ? {
      goals:              JSON.parse(profileRow.goals               || '[]'),
      risk:               profileRow.risk               || '',
      horizon:            profileRow.horizon            || '',
      annualIncome:       profileRow.annual_income      || '',
      monthlySavings:     profileRow.monthly_savings    || '',
      emergencyFund:      profileRow.emergency_fund     || '',
      currentInvestments: JSON.parse(profileRow.current_investments || '[]'),
      dob:                profileRow.dob                || '',
      maritalStatus:      profileRow.marital_status     || '',
      employmentStatus:   profileRow.employment_status  || '',
      creditScore:        profileRow.credit_score       || '',
      usState:            profileRow.us_state           || '',
      city:               profileRow.city               || '',
      veteranStatus:      profileRow.veteran_status     || '',
      preferences:        JSON.parse(profileRow.preferences        || '[]'),
    } : null;

    return json({ ok: true, username: session.username, profile });
  } catch (err) {
    console.error('context error:', err);
    return json({ error: 'Internal server error' }, 500);
  }
}
