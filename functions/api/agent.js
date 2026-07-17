/**
 * functions/api/agent.js  —  Cloudflare Pages Function
 *
 * POST /api/agent
 *
 * Proxies conversation turns to the IBM watsonx Orchestrate Agent Completions
 * API.  All AI reasoning is handled by the published Financial Advisor agent —
 * this function only:
 *   1. Authenticates with an IAM bearer token (WXO_API_KEY)
 *   2. Injects the user's D1 profile as a system context message
 *   3. Forwards the conversation to the Orchestrate endpoint
 *   4. Streams the response back to the browser as NDJSON
 *
 * Required Cloudflare secrets (set via wrangler pages secret put …):
 *   WXO_API_KEY      — IBM Cloud IAM API key for the watsonx Orchestrate instance
 *
 * Optional secrets (enhances context):
 *   PLAID_CLIENT_ID     — Plaid production client ID
 *   PLAID_SECRET        — Plaid production secret
 *   COINBASE_API_KEY    — Coinbase CDP API key
 *   COINBASE_API_SECRET — Coinbase CDP API secret
 *
 * D1 binding: DB  (same database used by auth.js)
 */

// ── Constants ──────────────────────────────────────────────────────────────────
const WXO_HOST        = 'https://dl.watson-orchestrate.ibm.com';
const WXO_INSTANCE_ID = '20260716-1817-5864-6037-ecdb2563fd26';
const WXO_AGENT_ID    = '77dfacb4-0d9a-4cd8-bf9c-6db1c7e554aa';
const WXO_ENV_ID      = 'faad14aa-f677-4cac-ae54-fdb68514856f';

// Agent Completions endpoint (REST, non-streaming + streaming)
const COMPLETIONS_URL = `${WXO_HOST}/instances/${WXO_INSTANCE_ID}/v1/chat`;

// IAM token exchange endpoint
const IAM_TOKEN_URL = 'https://iam.cloud.ibm.com/identity/token';

// ── Helpers ────────────────────────────────────────────────────────────────────
function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
    },
  });
}

function getSessionToken(request) {
  const cookie = request.headers.get('cookie') || '';
  const match  = cookie.match(/cb_session=([a-f0-9]{64})/);
  return match ? match[1] : null;
}

// Exchange an IBM Cloud IAM API key for a short-lived bearer token.
// In production this should be cached — for simplicity we exchange on each
// request; the IAM endpoint is fast (~80 ms) and Cloudflare Worker CPU budget
// is per-request so there is no cross-request cache.
async function getIamToken(apiKey) {
  const res = await fetch(IAM_TOKEN_URL, {
    method:  'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body:    `grant_type=urn:ibm:params:oauth:grant-type:apikey&apikey=${encodeURIComponent(apiKey)}`,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`IAM token exchange failed (${res.status}): ${text.slice(0, 200)}`);
  }
  const data = await res.json();
  return data.access_token;
}

// Fetch the user's full profile from D1 given a session token.
async function getUserProfile(db, sessionToken) {
  if (!sessionToken) return null;
  try {
    const session = await db.prepare(`
      SELECT users.id, users.username, users.email
      FROM sessions
      JOIN users ON users.id = sessions.user_id
      WHERE sessions.token = ? AND sessions.expires_at > datetime('now')
    `).bind(sessionToken).first();

    if (!session) return null;

    const profileRow = await db.prepare(
      'SELECT * FROM profiles WHERE user_id = ?'
    ).bind(session.id).first();

    return {
      username:           session.username,
      email:              session.email,
      goals:              JSON.parse(profileRow?.goals               || '[]'),
      risk:               profileRow?.risk               || '',
      horizon:            profileRow?.horizon            || '',
      annualIncome:       profileRow?.annual_income      || '',
      monthlySavings:     profileRow?.monthly_savings    || '',
      emergencyFund:      profileRow?.emergency_fund     || '',
      currentInvestments: JSON.parse(profileRow?.current_investments || '[]'),
      dob:                profileRow?.dob                || '',
      maritalStatus:      profileRow?.marital_status     || '',
      employmentStatus:   profileRow?.employment_status  || '',
      creditScore:        profileRow?.credit_score       || '',
      usState:            profileRow?.us_state           || '',
      city:               profileRow?.city               || '',
      veteranStatus:      profileRow?.veteran_status     || '',
      preferences:        JSON.parse(profileRow?.preferences        || '[]'),
    };
  } catch {
    return null;
  }
}

// Build a system context string from the user's D1 profile.
// This is injected as the first system message so the agent has full context.
function buildSystemContext(profile) {
  if (!profile) {
    return `You are Gumdrop, a friendly and knowledgeable Financial Advisor AI for Candyland Bank.
You help users with budgeting, savings, investments, debt management, and financial planning.
Always be encouraging, clear, and practical. Format responses with concise bullet points where helpful.
Today's date: ${new Date().toISOString().slice(0, 10)}.`;
  }

  const goalMap = {
    retirement: 'Retirement planning',
    home:       'Home purchase',
    education:  'Education funding',
    wealth:     'Wealth growth',
    short_term: 'Short-term goals',
    long_term:  'Long-term goals',
  };

  const goals = profile.goals.map((g) => goalMap[g] || g).join(', ') || 'Not specified';
  const investments = profile.currentInvestments.join(', ') || 'None listed';
  const preferences = profile.preferences.join(', ') || 'None';

  return `You are Gumdrop, the Financial Advisor AI for Candyland Bank.

## User Profile
- **Name**: ${profile.username}
- **Financial Goals**: ${goals}
- **Risk Tolerance**: ${profile.risk || 'Not specified'}
- **Time Horizon**: ${profile.horizon || 'Not specified'}
- **Annual Income**: ${profile.annualIncome ? `$${Number(profile.annualIncome).toLocaleString()}` : 'Not disclosed'}
- **Monthly Savings**: ${profile.monthlySavings ? `$${Number(profile.monthlySavings).toLocaleString()}` : 'Not disclosed'}
- **Emergency Fund Status**: ${profile.emergencyFund || 'Unknown'}
- **Current Investments**: ${investments}
- **Employment Status**: ${profile.employmentStatus || 'Not specified'}
- **Marital Status**: ${profile.maritalStatus || 'Not specified'}
- **Credit Score Range**: ${profile.creditScore || 'Not disclosed'}
- **Location**: ${profile.city && profile.usState ? `${profile.city}, ${profile.usState}` : profile.usState || 'Not specified'}
- **Veteran Status**: ${profile.veteranStatus || 'Not specified'}
- **Investment Preferences**: ${preferences}

## Your Role
You are a personalised financial advisor. Use the user's profile above to give highly relevant,
contextualised advice. Be encouraging, concise, and actionable. Use bullet points and structure
for clarity. Never speculate about missing data — ask clarifying questions instead.

Today's date: ${new Date().toISOString().slice(0, 10)}.`;
}

// ── Main handler ───────────────────────────────────────────────────────────────
export async function onRequestPost({ request, env }) {
  // CORS preflight
  if (request.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type' },
    });
  }

  // Validate API key is configured
  if (!env.WXO_API_KEY) {
    return json({
      error: 'WXO_API_KEY secret is not configured. Run: npx wrangler pages secret put WXO_API_KEY --project-name team11projectgithub',
    }, 503);
  }

  // Parse request body
  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Invalid JSON body.' }, 400);
  }

  const { messages = [], stream = false } = body;

  if (!Array.isArray(messages) || messages.length === 0) {
    return json({ error: 'messages array is required.' }, 400);
  }

  // Load user profile from D1 (best-effort — no auth required for chat)
  const sessionToken = getSessionToken(request);
  const profile      = env.DB ? await getUserProfile(env.DB, sessionToken) : null;
  const systemCtx    = buildSystemContext(profile);

  // Prepend system context as first message (only if not already present)
  const allMessages = [
    { role: 'system', content: systemCtx },
    ...messages.filter((m) => m.role !== 'system'),
  ];

  // Exchange API key for IAM bearer token
  let iamToken;
  try {
    iamToken = await getIamToken(env.WXO_API_KEY);
  } catch (err) {
    console.error('IAM token error:', err.message);
    return json({ error: 'Authentication failed. Check WXO_API_KEY.' }, 401);
  }

  // Build the Agent Completions request body
  // https://developer.watson-orchestrate.ibm.com/webchat/get_started#agent-completions-api
  const agentPayload = {
    agent_id:    WXO_AGENT_ID,
    env_id:      WXO_ENV_ID,
    messages:    allMessages,
    stream:      !!stream,
  };

  // Forward to watsonx Orchestrate
  let wxoRes;
  try {
    wxoRes = await fetch(COMPLETIONS_URL, {
      method:  'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': `Bearer ${iamToken}`,
        'Accept':        stream ? 'text/event-stream' : 'application/json',
      },
      body: JSON.stringify(agentPayload),
    });
  } catch (err) {
    console.error('WXO fetch error:', err.message);
    return json({ error: 'Failed to reach watsonx Orchestrate.' }, 502);
  }

  if (!wxoRes.ok) {
    let errBody = '';
    try { errBody = await wxoRes.text(); } catch {}
    console.error(`WXO error ${wxoRes.status}:`, errBody.slice(0, 500));
    return json({
      error: `Agent returned ${wxoRes.status}. ${errBody.slice(0, 200)}`,
    }, wxoRes.status >= 500 ? 502 : wxoRes.status);
  }

  if (stream) {
    // Pass through the SSE stream directly to the browser
    return new Response(wxoRes.body, {
      status: 200,
      headers: {
        'Content-Type':                'text/event-stream',
        'Cache-Control':               'no-cache',
        'Connection':                  'keep-alive',
        'Access-Control-Allow-Origin': '*',
      },
    });
  }

  // Non-streaming: parse and return assistant message
  const data = await wxoRes.json();
  return json({ ok: true, message: data });
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
