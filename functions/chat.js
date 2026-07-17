/**
 * functions/chat.js — Cloudflare Pages Function
 * POST /chat
 *
 * Calls the IBM watsonx Orchestrate Agent Completions API using
 * MCSP v2 API-key authentication (AWS-hosted instance).
 *
 * Auth flow:
 *   Exchange WXO_API_KEY → MCSP bearer token
 *   → POST /v1/orchestrate/{agent_id}/chat/completions
 *
 * Required Cloudflare Pages secret (set once via dashboard or wrangler):
 *   WXO_API_KEY  — the API key from:
 *                  watsonx Orchestrate → Settings → API details → Generate API key
 *
 * Instance URL: https://api.dl.watson-orchestrate.ibm.com/instances/20260716-1822-4087-90fe-3b3ba1d4cc84
 */

const WXO_INSTANCE_URL = 'https://api.dl.watson-orchestrate.ibm.com/instances/20260716-1822-4087-90fe-3b3ba1d4cc84';
const WXO_AGENT_ID     = 'a9e0ab50-e784-458e-b631-0946779be803';

const MCSP_TOKEN_URL   = 'https://iam.platform.saas.ibm.com/siusermgr/api/1.0/apikeys/token';
const COMPLETIONS_URL  = `${WXO_INSTANCE_URL}/v1/orchestrate/${WXO_AGENT_ID}/chat/completions`;

// ── MCSP v2 token exchange ─────────────────────────────────────────────────────
async function getMCSPToken(apiKey) {
  const res = await fetch(MCSP_TOKEN_URL, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ apikey: apiKey }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`MCSP token exchange failed (${res.status}): ${text.slice(0, 200)}`);
  }

  const data = await res.json();
  const token = data.token ?? data.access_token;
  if (!token) throw new Error('MCSP token response contained no token field');
  return token;
}

// ── Build a profile context prefix for the user message ──────────────────────
// The agent itself has instructions; we only pass structured profile data so it
// can personalise responses. We do NOT inject a system prompt override.
function buildProfileContext(profile) {
  if (!profile || Object.keys(profile).length === 0) return null;

  const goalMap = {
    retirement: 'Retirement planning', home: 'Home purchase',
    education:  'Education funding',   wealth: 'Wealth growth',
    short_term: 'Short-term savings',  long_term: 'Long-term investing',
  };
  const goals       = (profile.goals ?? []).map((g) => goalMap[g] || g).join(', ') || 'Not specified';
  const investments = (profile.currentInvestments ?? []).join(', ') || 'None listed';

  return [
    '[User financial profile for context]',
    `Goals: ${goals}`,
    `Risk tolerance: ${profile.risk || 'Not specified'}`,
    `Time horizon: ${profile.horizon || 'Not specified'}`,
    profile.annualIncome    ? `Annual income: $${Number(profile.annualIncome).toLocaleString()}`    : null,
    profile.monthlySavings  ? `Monthly savings: $${Number(profile.monthlySavings).toLocaleString()}` : null,
    profile.emergencyFund   ? `Emergency fund: ${profile.emergencyFund}`                              : null,
    investments !== 'None listed' ? `Current investments: ${investments}`                             : null,
    profile.employmentStatus ? `Employment: ${profile.employmentStatus}`                              : null,
    profile.creditScore      ? `Credit score band: ${profile.creditScore}`                           : null,
  ].filter(Boolean).join('\n');
}

// ── Handler ────────────────────────────────────────────────────────────────────
export async function onRequestPost({ request, env }) {
  const apiKey = env.WXO_API_KEY;

  if (!apiKey) {
    return Response.json({
      reply: 'Gumdrop is not configured — missing WXO_API_KEY secret. ' +
             'Add it in Cloudflare Pages → Settings → Environment variables.',
    });
  }

  const { messages = [], profile = {}, userMessage = '' } =
    await request.json().catch(() => ({}));

  if (!userMessage.trim()) {
    return Response.json({ reply: 'Please send a message.' });
  }

  // Build message list — no system prompt injection; prepend profile context
  // to the first user turn of this request so the agent can personalise.
  const profileCtx = buildProfileContext(profile);
  const userContent = profileCtx
    ? `${profileCtx}\n\n${userMessage}`
    : userMessage;

  const fullMessages = [
    // Include recent history (skip pending/system, last 10 turns)
    ...messages
      .filter((m) => m.sender !== 'system' && !m.pending)
      .slice(-10)
      .map((m) => ({
        role:    m.sender === 'user' ? 'user' : 'assistant',
        content: m.text,
      })),
    { role: 'user', content: userContent },
  ];

  try {
    const token = await getMCSPToken(apiKey);

    const woRes = await fetch(COMPLETIONS_URL, {
      method:  'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({ messages: fullMessages, stream: false }),
    });

    if (!woRes.ok) {
      const errText = await woRes.text().catch(() => '');
      console.error(`[chat] Orchestrate error ${woRes.status}:`, errText.slice(0, 400));

      if (woRes.status === 401 || woRes.status === 403) {
        return Response.json({
          reply: 'Authentication failed — check that WXO_API_KEY is correct and not expired.',
        });
      }
      if (woRes.status === 404) {
        return Response.json({
          reply: `Agent not found (404). Verify agent ID ${WXO_AGENT_ID} is published in your Orchestrate instance.`,
        });
      }
      return Response.json({
        reply: `Orchestrate returned an error (${woRes.status}). Check Cloudflare logs.`,
      });
    }

    const data  = await woRes.json();
    // OpenAI-compatible shape: { choices: [{ message: { content: "..." } }] }
    const reply = data.choices?.[0]?.message?.content?.trim()
      ?? data.reply
      ?? 'I received a response but could not parse it. Please try again.';

    return Response.json({ reply });

  } catch (err) {
    console.error('[chat] error:', err.message);
    return Response.json({
      reply: `Error reaching Orchestrate: ${err.message.slice(0, 120)}`,
    });
  }
}
