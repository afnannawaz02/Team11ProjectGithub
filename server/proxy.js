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
import { Resend } from 'resend';
import { retrieve } from './kb.js';

const PORT = 3001;
const HOST = '127.0.0.1'; // never bind to 0.0.0.0

const {
  WATSONX_API_KEY,
  WATSONX_PROJECT_ID,
  WATSONX_REGION       = 'us-south',
  WATSONX_MODEL_ID     = 'ibm/granite-3-8b-instruct',
  RESEND_API_KEY,
  RESEND_FROM          = 'noreply@candylandbank.com',
  ALLOWED_EMAIL_DOMAIN = 'ibm.com',
} = process.env;

const resend = RESEND_API_KEY ? new Resend(RESEND_API_KEY) : null;

// ── OTP store (in-memory, per-process) ────────────────────────────────────────
// Map of email → { code, expiresAt }
const otpStore = new Map();

function generateOTP() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

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

app.use(cors({ origin: ['http://localhost:5173', /\.pages\.dev$/, /\.workers\.dev$/] }));
app.use(express.json({ limit: '64kb' }));

// Health check
app.get('/health', (_req, res) => res.json({ status: 'ok' }));

/**
 * POST /send-otp
 * Body: { email: string }
 * Sends a 6-digit OTP to the given email if it matches ALLOWED_EMAIL_DOMAIN.
 */
app.post('/send-otp', async (req, res) => {
  const { email = '' } = req.body;
  const normalised = email.trim().toLowerCase();

  if (!normalised.endsWith(`@${ALLOWED_EMAIL_DOMAIN}`)) {
    return res.status(403).json({ error: `Only @${ALLOWED_EMAIL_DOMAIN} addresses are allowed.` });
  }

  if (!resend) {
    return res.status(503).json({ error: 'Email service not configured. Add RESEND_API_KEY to .env.local.' });
  }

  const code      = generateOTP();
  const expiresAt = Date.now() + 10 * 60 * 1000; // 10 minutes
  otpStore.set(normalised, { code, expiresAt });

  try {
    await resend.emails.send({
      from: RESEND_FROM,
      to:   normalised,
      subject: 'Your Candyland Bank access code',
      html: `
        <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:2rem;">
          <h2 style="margin:0 0 0.5rem;">Your access code</h2>
          <p style="color:#555;margin:0 0 1.5rem;">Use the code below to access Candyland Bank. It expires in 10 minutes.</p>
          <div style="font-size:2.5rem;font-weight:700;letter-spacing:0.15em;color:#3b82d4;margin-bottom:1.5rem;">${code}</div>
          <p style="color:#999;font-size:0.8rem;">If you didn't request this, ignore this email.</p>
        </div>
      `,
    });
    res.json({ ok: true });
  } catch (err) {
    console.error('Resend error:', err.message);
    res.status(500).json({ error: 'Failed to send email. Check server logs.' });
  }
});

/**
 * POST /verify-otp
 * Body: { email: string, code: string }
 * Returns { ok: true } or { error: string }
 */
app.post('/verify-otp', (req, res) => {
  const { email = '', code = '' } = req.body;
  const normalised = email.trim().toLowerCase();
  const entry      = otpStore.get(normalised);

  if (!entry)                        return res.status(400).json({ error: 'No code found for this email. Request a new one.' });
  if (Date.now() > entry.expiresAt)  { otpStore.delete(normalised); return res.status(400).json({ error: 'Code expired. Request a new one.' }); }
  if (entry.code !== code.trim())    return res.status(400).json({ error: 'Incorrect code. Try again.' });

  otpStore.delete(normalised); // single-use
  res.json({ ok: true });
});

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
