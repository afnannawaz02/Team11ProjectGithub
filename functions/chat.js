/**
 * functions/chat.js — Cloudflare Pages Function
 * POST /chat
 *
 * Env bindings required (set in Cloudflare Pages → Settings → Environment variables):
 *   WATSONX_API_KEY    — IBM Cloud IAM API key
 *   WATSONX_PROJECT_ID — watsonx.ai project ID
 *   WATSONX_REGION     — e.g. us-south (default)
 *   WATSONX_MODEL_ID   — e.g. ibm/granite-3-8b-instruct (default)
 */

import { KNOWLEDGE_BASE } from '../server/kb.js';

// ── KB retrieval (copied from server/kb.js) ───────────────────────────────────
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

// ── IAM token (no in-memory cache in Workers — fetch each time, fast enough) ──
async function getIAMToken(apiKey) {
  const res = await fetch('https://iam.cloud.ibm.com/identity/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ibm:params:oauth:grant-type:apikey',
      apikey: apiKey,
    }),
  });
  if (!res.ok) throw new Error(`IAM token fetch failed: ${res.status}`);
  const json = await res.json();
  return json.access_token;
}

export async function onRequestPost({ request, env }) {
  const WATSONX_API_KEY    = env.WATSONX_API_KEY;
  const WATSONX_PROJECT_ID = env.WATSONX_PROJECT_ID;
  const WATSONX_REGION     = env.WATSONX_REGION     || 'us-south';
  const WATSONX_MODEL_ID   = env.WATSONX_MODEL_ID   || 'ibm/granite-3-8b-instruct';

  if (!WATSONX_API_KEY || !WATSONX_PROJECT_ID) {
    return Response.json({ reply: 'The AI service is not configured yet — check back soon!' }, { status: 200 });
  }

  const { messages = [], profile = {}, userMessage = '' } =
    await request.json().catch(() => ({}));

  const context = retrieve(userMessage);

  const systemPrompt = [
    `You are Gumdrop, a friendly and knowledgeable financial assistant for Candyland Bank.`,
    `You give concise, accurate, personalised investment guidance. Never give regulated financial advice — always recommend the user consults a qualified adviser for major decisions.`,
    ``,
    `USER PROFILE:`,
    `- Goals: ${profile.goals?.join(', ') || 'not specified'}`,
    `- Risk tolerance: ${profile.risk || 'not specified'}`,
    `- Time horizon: ${profile.horizon || 'not specified'}`,
    `- Age bracket: ${profile.ageBracket || 'not specified'}`,
    `- Annual income: ${profile.annualIncome ? `$${profile.annualIncome}` : 'not specified'}`,
    `- Monthly savings: ${profile.monthlySavings ? `$${profile.monthlySavings}` : 'not specified'}`,
    `- Emergency fund: ${profile.emergencyFund || 'not specified'}`,
    `- Current investments: ${profile.currentInvestments?.join(', ') || 'none'}`,
    `- Investment preferences: ${profile.preferences?.join(', ') || 'none'}`,
    context ? `\nRELEVANT CANDYLAND BANK KNOWLEDGE:\n${context}` : '',
  ].filter(Boolean).join('\n');

  try {
    const token = await getIAMToken(WATSONX_API_KEY);

    const wxMessages = [
      { role: 'system', content: systemPrompt },
      ...messages.map((m) => ({
        role: m.sender === 'user' ? 'user' : 'assistant',
        content: m.text,
      })),
      { role: 'user', content: userMessage },
    ];

    const endpoint = `https://${WATSONX_REGION}.ml.cloud.ibm.com/ml/v1/text/chat?version=2024-05-01`;
    const wxRes = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({
        model_id: WATSONX_MODEL_ID,
        project_id: WATSONX_PROJECT_ID,
        messages: wxMessages,
        parameters: { max_new_tokens: 512, temperature: 0.7, top_p: 0.9 },
      }),
    });

    if (!wxRes.ok) {
      console.error('watsonx error:', wxRes.status, await wxRes.text());
      return Response.json({ error: 'AI service error. Please try again.' }, { status: 502 });
    }

    const wxJson = await wxRes.json();
    const reply  = wxJson.results?.[0]?.generated_text?.trim()
      ?? wxJson.choices?.[0]?.message?.content?.trim()
      ?? 'Sorry, I could not generate a response.';

    return Response.json({ reply });

  } catch (err) {
    console.error('Function error:', err.message);
    return Response.json({ error: 'Internal error. Check function logs.' }, { status: 500 });
  }
}
