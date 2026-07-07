/**
 * server/proxy.js — Candyland Bank local AI proxy
 *
 * Runs on http://127.0.0.1:3001
 * Keeps watsonx credentials server-side; the browser never sees them.
 *
 * Usage:
 *   node server/proxy.js          (or via `npm run server`)
 *
 * Required .env.local keys:
 *   WATSONX_API_KEY      — IBM Cloud IAM API key
 *   WATSONX_PROJECT_ID   — watsonx.ai project ID
 *   WATSONX_REGION       — e.g. us-south, eu-gb, jp-tok (default: us-south)
 *   WATSONX_MODEL_ID     — e.g. ibm/granite-13b-chat-v2 (default below)
 */

import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { retrieve } from './kb.js';

const PORT = 3001;
const HOST = '127.0.0.1'; // never bind to 0.0.0.0

const {
  WATSONX_API_KEY,
  WATSONX_PROJECT_ID,
  WATSONX_REGION    = 'us-south',
  WATSONX_MODEL_ID  = 'ibm/granite-3-8b-instruct',
} = process.env;

// ── IAM token cache ───────────────────────────────────────────────────────────
let _iamToken = null;
let _iamExpiry = 0;

async function getIAMToken() {
  if (_iamToken && Date.now() < _iamExpiry) return _iamToken;

  const res = await fetch('https://iam.cloud.ibm.com/identity/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ibm:params:oauth:grant-type:apikey',
      apikey: WATSONX_API_KEY,
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`IAM token fetch failed (${res.status}): ${body}`);
  }

  const json = await res.json();
  _iamToken  = json.access_token;
  // Refresh 5 minutes before expiry
  _iamExpiry = Date.now() + (json.expires_in - 300) * 1000;
  return _iamToken;
}

// ── Express app ───────────────────────────────────────────────────────────────
const app = express();

app.use(cors({ origin: 'http://localhost:5173' })); // Vite dev server only
app.use(express.json({ limit: '64kb' }));

// Health check
app.get('/health', (_req, res) => res.json({ status: 'ok' }));

/**
 * POST /chat
 * Body: { messages: [{role, content}], profile: {...}, userMessage: string }
 * Returns: { reply: string }
 */
app.post('/chat', async (req, res) => {
  if (!WATSONX_API_KEY || !WATSONX_PROJECT_ID) {
    return res.status(503).json({
      error: 'Proxy not configured. Add WATSONX_API_KEY and WATSONX_PROJECT_ID to .env.local and restart the server.',
    });
  }

  const { messages = [], profile = {}, userMessage = '' } = req.body;

  // ── Retrieve relevant KB chunks for this query ────────────────────────────
  const context = retrieve(userMessage);

  // ── Build system prompt ───────────────────────────────────────────────────
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
    context
      ? `\nRELEVANT CANDYLAND BANK KNOWLEDGE:\n${context}`
      : '',
  ].filter(Boolean).join('\n');

  // ── Call watsonx.ai text generation API ──────────────────────────────────
  const endpoint = `https://${WATSONX_REGION}.ml.cloud.ibm.com/ml/v1/text/chat?version=2024-05-01`;

  try {
    const token = await getIAMToken();

    // Convert our message history to watsonx format
    const wxMessages = [
      { role: 'system', content: systemPrompt },
      ...messages.map((m) => ({
        role: m.sender === 'user' ? 'user' : 'assistant',
        content: m.text,
      })),
      { role: 'user', content: userMessage },
    ];

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
        parameters: {
          max_new_tokens: 512,
          temperature: 0.7,
          top_p: 0.9,
        },
      }),
    });

    if (!wxRes.ok) {
      const body = await wxRes.text();
      console.error('watsonx error:', wxRes.status, body);
      return res.status(502).json({ error: 'AI service error. Please try again.' });
    }

    const wxJson = await wxRes.json();
    const reply  = wxJson.results?.[0]?.generated_text?.trim()
      ?? wxJson.choices?.[0]?.message?.content?.trim()
      ?? 'Sorry, I could not generate a response. Please try again.';

    res.json({ reply });

  } catch (err) {
    console.error('Proxy error:', err.message);
    res.status(500).json({ error: 'Internal proxy error. Check the server logs.' });
  }
});

app.listen(PORT, HOST, () => {
  console.log(`\n🍬 Candyland Bank AI proxy running on http://${HOST}:${PORT}`);
  console.log(`   Model : ${WATSONX_MODEL_ID}`);
  console.log(`   Region: ${WATSONX_REGION}`);
  if (!WATSONX_API_KEY)    console.warn('   ⚠  WATSONX_API_KEY not set — /chat will return 503');
  if (!WATSONX_PROJECT_ID) console.warn('   ⚠  WATSONX_PROJECT_ID not set — /chat will return 503');
});
