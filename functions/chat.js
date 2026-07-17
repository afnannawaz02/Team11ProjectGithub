/**
 * functions/chat.js — Cloudflare Pages Function
 * POST /chat
 *
 * Calls the IBM watsonx Orchestrate Agent Completions API:
 *   POST https://dl.watson-orchestrate.ibm.com/v1/orchestrate/{agent_id}/chat/completions
 *
 * Authentication flow (two-step):
 *   1. Exchange WO_USERNAME + WO_PASSWORD → Bearer token via /v1/auth/token
 *   2. Call the agent completions endpoint with that token
 *
 * Required Cloudflare secrets (set via Dashboard or wrangler):
 *   WO_USERNAME  — Your watsonx Orchestrate login email (e.g. user@ibm.com)
 *   WO_PASSWORD  — Your watsonx Orchestrate login password
 *
 * These are NOT an IBM Cloud IAM key and NOT WATSONX_PROJECT_ID.
 * They are the credentials you use to log in to
 *   https://dl.watson-orchestrate.ibm.com
 */

const WO_HOST     = 'https://dl.watson-orchestrate.ibm.com';
const WO_AGENT_ID = '77dfacb4-0d9a-4cd8-bf9c-6db1c7e554aa';

const TOKEN_URL       = `${WO_HOST}/v1/auth/token`;
const COMPLETIONS_URL = `${WO_HOST}/v1/orchestrate/${WO_AGENT_ID}/chat/completions`;

// ── Auth ───────────────────────────────────────────────────────────────────────
async function getWOToken(username, password) {
  const res = await fetch(TOKEN_URL, {
    method:  'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body:    new URLSearchParams({
      username,
      password,
      grant_type: 'password',
      scope:      '',
    }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`WO auth failed (${res.status}): ${text.slice(0, 200)}`);
  }

  const data = await res.json();
  const token = data.access_token ?? data.token ?? data.id_token;
  if (!token) throw new Error('WO auth response had no token field');
  return token;
}

// ── Profile context ────────────────────────────────────────────────────────────
function buildSystemPrompt(profile) {
  const today = new Date().toISOString().slice(0, 10);

  if (!profile || Object.keys(profile).length === 0) {
    return [
      'You are Gumdrop, the Financial Advisor AI for Candyland Bank.',
      'Help users with budgeting, savings, investing, debt, and financial planning.',
      'Be encouraging, concise, and actionable. Use bullet points where helpful.',
      `Today: ${today}.`,
    ].join('\n');
  }

  const goalMap = {
    retirement: 'Retirement planning', home: 'Home purchase',
    education:  'Education funding',   wealth: 'Wealth growth',
    short_term: 'Short-term savings',  long_term: 'Long-term investing',
  };

  const goals = (profile.goals ?? []).map((g) => goalMap[g] || g).join(', ') || 'Not specified';
  const investments = (profile.currentInvestments ?? []).join(', ') || 'None listed';
  const prefs = (profile.preferences ?? []).join(', ') || 'None';

  return `You are Gumdrop, the Financial Advisor AI for Candyland Bank.

USER PROFILE:
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
- Investment preferences: ${prefs}

Use this profile to personalise every response. Be specific, actionable, and encouraging.
Today: ${today}.`;
}

// ── Handler ────────────────────────────────────────────────────────────────────
export async function onRequestPost({ request, env }) {
  const WO_USERNAME = env.WO_USERNAME;
  const WO_PASSWORD = env.WO_PASSWORD;

  if (!WO_USERNAME || !WO_PASSWORD) {
    const missing = [
      !WO_USERNAME && 'WO_USERNAME',
      !WO_PASSWORD && 'WO_PASSWORD',
    ].filter(Boolean).join(', ');
    return Response.json({
      reply: `Gumdrop is not configured yet — missing secret(s): ${missing}. ` +
             `Add them in Cloudflare Pages → Settings → Environment variables.`,
    });
  }

  const { messages = [], profile = {}, userMessage = '' } =
    await request.json().catch(() => ({}));

  if (!userMessage.trim()) {
    return Response.json({ reply: 'Please send a message.' });
  }

  // Build the full message list with system context prepended
  const systemPrompt = buildSystemPrompt(profile);
  const fullMessages = [
    { role: 'system', content: systemPrompt },
    // Include recent conversation history (skip system messages, limit to last 10)
    ...messages
      .filter((m) => m.sender !== 'system' && !m.pending)
      .slice(-10)
      .map((m) => ({
        role:    m.sender === 'user' ? 'user' : 'assistant',
        content: m.text,
      })),
    { role: 'user', content: userMessage },
  ];

  try {
    // Step 1: get a bearer token from WO
    const token = await getWOToken(WO_USERNAME, WO_PASSWORD);

    // Step 2: call the agent completions endpoint
    const woRes = await fetch(COMPLETIONS_URL, {
      method:  'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({
        messages: fullMessages,
        stream:   false,
      }),
    });

    if (!woRes.ok) {
      const errText = await woRes.text().catch(() => '');
      console.error(`[chat] WO completions error ${woRes.status}:`, errText.slice(0, 400));

      // Surface clear diagnostic messages without leaking credentials
      if (woRes.status === 401 || woRes.status === 403) {
        return Response.json({
          reply: 'Authentication failed — check WO_USERNAME and WO_PASSWORD are correct.',
        });
      }
      if (woRes.status === 404) {
        return Response.json({
          reply: `Agent not found (404). Verify the agent ID ${WO_AGENT_ID} is published in your Orchestrate instance.`,
        });
      }
      return Response.json({
        reply: `Orchestrate returned an error (${woRes.status}). Check Cloudflare logs.`,
      });
    }

    const data  = await woRes.json();

    // The WO completions endpoint returns OpenAI-compatible shape:
    // { choices: [{ message: { role: "assistant", content: "..." } }] }
    const reply = data.choices?.[0]?.message?.content?.trim()
      ?? data.reply
      ?? 'I received a response but could not read it. Please try again.';

    return Response.json({ reply });

  } catch (err) {
    console.error('[chat] error:', err.message);
    return Response.json({
      reply: `Error: ${err.message.slice(0, 120)}`,
    });
  }
}
