/**
 * functions/chat.js — Cloudflare Pages Function
 * POST /chat
 *
 * Reads the user's full investor profile from D1 (via session cookie) so the AI
 * always has accurate, up-to-date survey answers — even if the browser doesn't
 * send them. Falls back to whatever the browser provides if no session exists.
 *
 * Env bindings required:
 *   WATSONX_API_KEY    — IBM Cloud IAM API key
 *   WATSONX_PROJECT_ID — watsonx.ai project ID
 *   WATSONX_REGION     — e.g. us-south (default)
 *   WATSONX_MODEL_ID   — e.g. ibm/granite-3-8b-instruct (default)
 *   DB                 — D1 database binding
 */

import { KNOWLEDGE_BASE } from '../server/kb.js';

// ── KB retrieval ───────────────────────────────────────────────────────────────
function retrieve(query, topN = 3) {
  const q = query.toLowerCase();
  const scored = KNOWLEDGE_BASE.map((chunk) => ({
    chunk,
    hits: chunk.topic.filter((kw) => q.includes(kw)).length,
  }));
  return scored
    .filter(({ hits }) => hits > 0)
    .sort((a, b) => b.hits - a.hits)
    .slice(0, topN)
    .map(({ chunk }) => chunk.content)
    .join('\n\n---\n\n');
}

// ── Convert raw D1 profile row → JS object ─────────────────────────────────────
function rowToProfile(row) {
  if (!row) return null;
  return {
    goals:              JSON.parse(row.goals              || '[]'),
    risk:               row.risk,
    horizon:            row.horizon,
    annualIncome:       row.annual_income,
    monthlySavings:     row.monthly_savings,
    emergencyFund:      row.emergency_fund,
    currentInvestments: JSON.parse(row.current_investments || '[]'),
    dob:                row.dob,
    maritalStatus:      row.marital_status,
    employmentStatus:   row.employment_status,
    creditScore:        row.credit_score,
    usState:            row.us_state,
    city:               row.city,
    veteranStatus:      row.veteran_status,
    preferences:        JSON.parse(row.preferences        || '[]'),
  };
}

// ── Derive age bracket from date of birth ──────────────────────────────────────
function ageBracket(dob) {
  if (!dob) return null;
  const age = Math.floor((Date.now() - new Date(dob)) / (365.25 * 24 * 60 * 60 * 1000));
  if (age < 25)  return 'Under 25';
  if (age < 35)  return '25–34';
  if (age < 45)  return '35–44';
  if (age < 55)  return '45–54';
  if (age < 65)  return '55–64';
  return '65+';
}

// ── Build rich user-knowledge context from survey answers ──────────────────────
function buildUserContext(profile) {
  if (!profile) return '';

  const GOAL_LABELS = {
    retirement: 'Retirement', home: 'Buying a home', education: 'Education',
    wealth: 'Wealth growth', short_term: 'Short-term goals', long_term: 'Long-term goals',
  };
  const RISK_LABELS = {
    conservative: 'Conservative — prefers capital preservation and minimal volatility',
    moderate:     'Moderate — comfortable with balanced growth and manageable swings',
    aggressive:   'Aggressive — willing to accept large swings in pursuit of high returns',
  };
  const HORIZON_LABELS = {
    short:  'Short (0–3 years)',
    medium: 'Medium (3–10 years)',
    long:   'Long (10+ years)',
  };
  const INCOME_LABELS = {
    'under-25k': 'Under $25,000',   '25k-50k':   '$25,000–$49,999',
    '50k-75k':   '$50,000–$74,999', '75k-100k':  '$75,000–$99,999',
    '100k-150k': '$100,000–$149,999','150k-250k': '$150,000–$249,999',
    'over-250k': '$250,000+',       'prefer-not': 'Not disclosed',
  };
  const EMERGENCY_LABELS = {
    none: 'No emergency fund yet', partial: '1–3 months of expenses', full: '3–6+ months covered',
  };

  const goals   = (profile.goals ?? []).map((g) => GOAL_LABELS[g] || g);
  const invests = (profile.currentInvestments ?? [])
    .map((i) => ({ stocks:'Stocks', bonds:'Bonds', etfs:'ETFs', crypto:'Crypto', cash:'Cash/Savings', none:'No current holdings' })[i] || i);
  const prefs   = (profile.preferences ?? [])
    .map((p) => ({ esg:'ESG/Ethical investing', tech:'High-growth Tech', dividend:'Dividend Income', index:'Low-fee Index funds' })[p] || p);

  const lines = [
    `USER SURVEY ANSWERS (stored in D1 — use these to personalise every response):`,
    `- Investment goals: ${goals.length ? goals.join(', ') : 'Not specified'}`,
    `- Risk tolerance: ${RISK_LABELS[profile.risk] || profile.risk || 'Not specified'}`,
    `- Time horizon: ${HORIZON_LABELS[profile.horizon] || profile.horizon || 'Not specified'}`,
    `- Annual income: ${INCOME_LABELS[profile.annualIncome] || profile.annualIncome || 'Not specified'}`,
    `- Monthly investment amount: ${profile.monthlySavings ? '$' + profile.monthlySavings : 'Not specified'}`,
    `- Emergency fund: ${EMERGENCY_LABELS[profile.emergencyFund] || profile.emergencyFund || 'Not specified'}`,
    `- Current holdings: ${invests.length ? invests.join(', ') : 'None specified'}`,
    `- Age bracket: ${ageBracket(profile.dob) || 'Not specified'}`,
    `- Marital status: ${profile.maritalStatus || 'Not specified'}`,
    `- Employment: ${profile.employmentStatus || 'Not specified'}`,
    `- Credit score range: ${profile.creditScore || 'Not specified'}`,
    `- Location: ${profile.city && profile.usState ? `${profile.city}, ${profile.usState}` : profile.usState || 'Not specified'}`,
    `- Veteran status: ${profile.veteranStatus || 'Not specified'}`,
    `- Investment preferences: ${prefs.length ? prefs.join(', ') : 'None specified'}`,
  ];

  return lines.join('\n');
}

// ── IAM token ─────────────────────────────────────────────────────────────────
async function getIAMToken(apiKey) {
  const res = await fetch('https://iam.cloud.ibm.com/identity/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ibm:params:oauth:grant-type:apikey',
      apikey: apiKey,
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`IAM token fetch failed (${res.status}): ${body.slice(0, 200)}`);
  }
  const json = await res.json();
  return json.access_token;
}

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

// ── Main handler (all methods) ────────────────────────────────────────────────
export async function onRequest({ request, env }) {
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }
  if (request.method !== 'POST') {
    return Response.json({ error: 'Use POST' }, { status: 405, headers: CORS_HEADERS });
  }

  const WATSONX_API_KEY    = env.WATSONX_API_KEY;
  const WATSONX_PROJECT_ID = env.WATSONX_PROJECT_ID;
  const WATSONX_REGION     = env.WATSONX_REGION   || 'us-south';
  const WATSONX_MODEL_ID   = env.WATSONX_MODEL_ID  || 'ibm/granite-3-8b-instruct';

  if (!WATSONX_API_KEY || !WATSONX_PROJECT_ID) {
    const missing = [!WATSONX_API_KEY && 'WATSONX_API_KEY', !WATSONX_PROJECT_ID && 'WATSONX_PROJECT_ID'].filter(Boolean).join(', ');
    return Response.json(
      { reply: `AI service not configured — missing: ${missing}` },
      { status: 200, headers: CORS_HEADERS },
    );
  }

  const { messages = [], profile: browserProfile = {}, userMessage = '' } =
    await request.json().catch(() => ({}));

  // ── Load profile from D1 if user is logged in ─────────────────────────────
  let profile = browserProfile;
  if (env.DB) {
    try {
      const cookie  = request.headers.get('cookie') || '';
      const match   = cookie.match(/cb_session=([a-f0-9]{64})/);
      const token   = match ? match[1] : null;
      if (token) {
        const session = await env.DB.prepare(`
          SELECT users.id FROM sessions
          JOIN users ON users.id = sessions.user_id
          WHERE sessions.token = ? AND sessions.expires_at > datetime('now')
        `).bind(token).first();

        if (session) {
          const row = await env.DB.prepare(
            'SELECT * FROM profiles WHERE user_id = ?'
          ).bind(session.id).first();
          if (row) profile = rowToProfile(row);
        }
      }
    } catch (e) {
      console.error('D1 profile fetch error:', e.message);
      // fall back to browser-supplied profile
    }
  }

  // ── Build system prompt with survey data + KB ─────────────────────────────
  const kbContext  = retrieve(userMessage);
  const userCtx    = buildUserContext(profile);

  const systemPrompt = [
    `You are Gumdrop, a friendly and knowledgeable financial assistant for Candyland Bank.`,
    `You give concise, accurate, personalised investment guidance based on the user's survey answers below.`,
    `Never give regulated financial advice — always recommend consulting a qualified adviser for major decisions.`,
    ``,
    userCtx,
    kbContext ? `\nCANDYLAND BANK KNOWLEDGE BASE:\n${kbContext}` : '',
  ].filter(Boolean).join('\n');

  // ── Call watsonx ──────────────────────────────────────────────────────────
  try {
    const token = await getIAMToken(WATSONX_API_KEY);

    const wxMessages = [
      { role: 'system', content: systemPrompt },
      ...messages
        .filter((m) => !m.pending && m.text)
        .slice(-10)
        .map((m) => ({
          role:    m.sender === 'user' ? 'user' : 'assistant',
          content: m.text,
        })),
      { role: 'user', content: userMessage },
    ];

    const endpoint = `https://${WATSONX_REGION}.ml.cloud.ibm.com/ml/v1/text/chat?version=2024-05-01`;
    const wxRes = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({
        model_id:   WATSONX_MODEL_ID,
        project_id: WATSONX_PROJECT_ID,
        messages:   wxMessages,
        parameters: { max_tokens: 512, temperature: 0.7, top_p: 0.9 },
      }),
    });

    if (!wxRes.ok) {
      const errBody = await wxRes.text();
      console.error('watsonx error:', wxRes.status, errBody);
      return Response.json(
        { reply: `AI error ${wxRes.status} — ${errBody.slice(0, 200)}` },
        { status: 200, headers: CORS_HEADERS },
      );
    }

    const wxJson = await wxRes.json();
    const reply  = wxJson.choices?.[0]?.message?.content?.trim()
      ?? wxJson.results?.[0]?.generated_text?.trim()
      ?? JSON.stringify(wxJson).slice(0, 200);

    return Response.json({ reply }, { headers: CORS_HEADERS });

  } catch (err) {
    console.error('Function error:', err.message);
    return Response.json(
      { reply: `Server error: ${err.message}` },
      { status: 200, headers: CORS_HEADERS },
    );
  }
}
