/**
 * functions/api/agent.js  —  Cloudflare Pages Function
 *
 * POST /api/agent
 *
 * Proxies conversation turns to the IBM watsonx Orchestrate Agent Completions
 * API.  All AI reasoning is handled by the published Financial Advisor agent.
 *
 * Authentication:
 *   The Agent Completions endpoint uses a ZenApiKey credential, NOT an IAM
 *   API key and NOT WATSONX_PROJECT_ID.  Obtain the key from:
 *     Cloudflare Dashboard → Pages → Settings → Environment variables → Secrets
 *     Secret name: WXO_ZEN_API_KEY
 *
 *   To get your ZenApiKey:
 *     1. Open your watsonx Orchestrate instance in IBM Cloud
 *     2. Go to Service credentials → New credential
 *     3. Copy the "apikey" value from the generated JSON — that is your ZenApiKey
 *
 * Endpoint reference:
 *   POST https://dl.watson-orchestrate.ibm.com/instances/{serviceInstanceId}/v1/chat/completions
 *   Authorization: ZenApiKey {zenApiKey}
 *   Content-Type: application/json
 *
 *   Body (OpenAI-compatible):
 *   {
 *     "model": "{agentId}",          // the published agent ID
 *     "messages": [...],              // conversation history
 *     "agent_env_id": "{envId}",     // optional: pin to specific environment
 *     "stream": false
 *   }
 *
 * D1 binding: DB  (same database used by auth.js)
 */

// ── Constants ──────────────────────────────────────────────────────────────────
const WXO_HOST         = 'https://dl.watson-orchestrate.ibm.com';
const WXO_INSTANCE_ID  = '20260716-1817-5864-6037-ecdb2563fd26';
const WXO_AGENT_ID     = '77dfacb4-0d9a-4cd8-bf9c-6db1c7e554aa';
const WXO_ENV_ID       = 'faad14aa-f677-4cac-ae54-fdb68514856f';

// Agent Completions endpoint — OpenAI-compatible /chat/completions path
const COMPLETIONS_URL  = `${WXO_HOST}/instances/${WXO_INSTANCE_ID}/v1/chat/completions`;

// ── Helpers ────────────────────────────────────────────────────────────────────
function jsonResp(data, status = 200) {
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

// Fetch the user's full profile from D1 given a session cookie token.
async function getUserProfile(db, sessionToken) {
  if (!sessionToken || !db) return null;
  try {
    const session = await db.prepare(`
      SELECT users.id, users.username, users.email
      FROM sessions
      JOIN users ON users.id = sessions.user_id
      WHERE sessions.token = ? AND sessions.expires_at > datetime('now')
    `).bind(sessionToken).first();

    if (!session) return null;

    const row = await db.prepare(
      'SELECT * FROM profiles WHERE user_id = ?'
    ).bind(session.id).first();

    return {
      username:           session.username,
      email:              session.email,
      goals:              JSON.parse(row?.goals               || '[]'),
      risk:               row?.risk               || '',
      horizon:            row?.horizon            || '',
      annualIncome:       row?.annual_income      || '',
      monthlySavings:     row?.monthly_savings    || '',
      emergencyFund:      row?.emergency_fund     || '',
      currentInvestments: JSON.parse(row?.current_investments || '[]'),
      dob:                row?.dob                || '',
      maritalStatus:      row?.marital_status     || '',
      employmentStatus:   row?.employment_status  || '',
      creditScore:        row?.credit_score       || '',
      usState:            row?.us_state           || '',
      city:               row?.city               || '',
      veteranStatus:      row?.veteran_status     || '',
      preferences:        JSON.parse(row?.preferences        || '[]'),
    };
  } catch {
    return null;
  }
}

// Build the system prompt injected as the first message.
// The Orchestrate agent handles all reasoning — this just provides user context.
function buildSystemPrompt(profile) {
  const today = new Date().toISOString().slice(0, 10);

  if (!profile) {
    return [
      'You are Gumdrop, the Financial Advisor AI for Candyland Bank.',
      'Help users with budgeting, savings, investing, debt, and financial planning.',
      'Be encouraging, concise, and actionable. Use bullet points for clarity.',
      `Today: ${today}.`,
    ].join('\n');
  }

  const goalMap = {
    retirement: 'Retirement planning', home: 'Home purchase',
    education:  'Education funding',   wealth: 'Wealth growth',
    short_term: 'Short-term savings',  long_term: 'Long-term investing',
  };

  const goals       = profile.goals.map((g) => goalMap[g] || g).join(', ') || 'Not specified';
  const investments = profile.currentInvestments.join(', ') || 'None listed';
  const prefs       = profile.preferences.join(', ') || 'None';
  const location    = profile.city && profile.usState
    ? `${profile.city}, ${profile.usState}` : profile.usState || 'Not specified';

  return `You are Gumdrop, the Financial Advisor AI for Candyland Bank.

USER PROFILE (from Candyland Bank D1 database):
- Name: ${profile.username}
- Goals: ${goals}
- Risk tolerance: ${profile.risk || 'Not specified'}
- Time horizon: ${profile.horizon || 'Not specified'}
- Annual income: ${profile.annualIncome ? '$' + Number(profile.annualIncome).toLocaleString() : 'Not disclosed'}
- Monthly savings: ${profile.monthlySavings ? '$' + Number(profile.monthlySavings).toLocaleString() : 'Not disclosed'}
- Emergency fund: ${profile.emergencyFund || 'Unknown'}
- Current investments: ${investments}
- Employment: ${profile.employmentStatus || 'Not specified'}
- Marital status: ${profile.maritalStatus || 'Not specified'}
- Credit score: ${profile.creditScore || 'Not disclosed'}
- Location: ${location}
- Veteran: ${profile.veteranStatus || 'Not specified'}
- Preferences: ${prefs}

Use this profile to personalise every response. Be specific, actionable, and encouraging.
Never reveal raw profile data — use it to contextualise advice.
Today: ${today}.`;
}

// ── Main handler ───────────────────────────────────────────────────────────────
export async function onRequestPost({ request, env }) {
  // CORS preflight
  if (request.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin':  '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      },
    });
  }

  // ── Secret validation ───────────────────────────────────────────────────────
  const zenKey = env.WXO_ZEN_API_KEY;
  if (!zenKey) {
    return jsonResp({
      error: [
        'WXO_ZEN_API_KEY is not set.',
        'Add it via: npx wrangler pages secret put WXO_ZEN_API_KEY --project-name team11projectgithub',
        'Get the key from: IBM Cloud → your Orchestrate instance → Service credentials.',
      ].join(' '),
    }, 503);
  }

  // ── Parse body ──────────────────────────────────────────────────────────────
  let body;
  try { body = await request.json(); }
  catch { return jsonResp({ error: 'Invalid JSON body.' }, 400); }

  const { messages = [] } = body;
  if (!Array.isArray(messages) || messages.length === 0) {
    return jsonResp({ error: 'messages array is required and must not be empty.' }, 400);
  }

  // ── Load user context from D1 ───────────────────────────────────────────────
  const sessionToken = getSessionToken(request);
  const profile      = await getUserProfile(env.DB, sessionToken);
  const systemPrompt = buildSystemPrompt(profile);

  // Build the full message list: system context first, then conversation
  const fullMessages = [
    { role: 'system', content: systemPrompt },
    ...messages.filter((m) => m.role !== 'system'),
  ];

  // ── Call Orchestrate Agent Completions ─────────────────────────────────────
  // Uses the OpenAI-compatible /chat/completions endpoint.
  // Auth: ZenApiKey header (service credential, not IAM API key).
  // "model" field = the published agent ID.
  const orchestrateBody = {
    model:        WXO_AGENT_ID,
    messages:     fullMessages,
    agent_env_id: WXO_ENV_ID,
    stream:       false,
  };

  let wxoRes;
  try {
    wxoRes = await fetch(COMPLETIONS_URL, {
      method: 'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': `ZenApiKey ${zenKey}`,
      },
      body: JSON.stringify(orchestrateBody),
    });
  } catch (err) {
    console.error('[agent] network error reaching Orchestrate:', err.message);
    return jsonResp({ error: 'Network error reaching watsonx Orchestrate.' }, 502);
  }

  // ── Handle upstream errors ─────────────────────────────────────────────────
  if (!wxoRes.ok) {
    let upstream = '';
    try { upstream = await wxoRes.text(); } catch {}

    // Expose just enough for debugging without leaking secrets
    console.error(`[agent] Orchestrate ${wxoRes.status}:`, upstream.slice(0, 500));

    // Surface a clean error to the frontend
    const clientMsg = wxoRes.status === 401
      ? 'Authentication failed — check WXO_ZEN_API_KEY is a valid Orchestrate service credential.'
      : wxoRes.status === 403
        ? 'Access denied — ensure the credential has access to this Orchestrate instance.'
        : wxoRes.status === 404
          ? `Agent not found. Verify WXO_AGENT_ID (${WXO_AGENT_ID}) exists in instance ${WXO_INSTANCE_ID}.`
          : `Orchestrate returned ${wxoRes.status}. Check Cloudflare logs for details.`;

    return jsonResp({ error: clientMsg }, wxoRes.status >= 500 ? 502 : wxoRes.status);
  }

  // ── Parse and forward the response ────────────────────────────────────────
  let data;
  try { data = await wxoRes.json(); }
  catch {
    return jsonResp({ error: 'Orchestrate returned an unparseable response.' }, 502);
  }

  // OpenAI-compatible response shape:
  // { choices: [{ message: { role: "assistant", content: "..." } }] }
  return jsonResp({ ok: true, message: data });
}

export async function onRequestOptions() {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin':  '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  });
}
