/**
 * server/proxy.js — Candyland Bank local dev proxy
 *
 * Runs on http://127.0.0.1:3001
 * Keeps watsonx Orchestrate credentials server-side; the browser never sees them.
 *
 * Usage:
 *   npm run server    (or: node --env-file=.env.local server/proxy.js)
 *
 * Required .env.local keys for chat:
 *   WXO_API_KEY  — API key from watsonx Orchestrate → Settings → API details
 *                  → Generate API key  (NOT an IBM Cloud IAM key)
 *
 * Optional:
 *   RESEND_API_KEY    — for OTP email delivery
 *   FINNHUB_API_KEY   — for live stock data
 */

import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { Resend } from 'resend';
import { retrieve } from './kb.js';

const PORT = process.env.PORT || 3001;
const HOST = process.env.HOST || '127.0.0.1';

const {
  WXO_API_KEY,
  RESEND_API_KEY,
  RESEND_FROM          = 'noreply@team11.uk',
  ALLOWED_EMAIL_DOMAIN = 'ibm.com',
  FINNHUB_API_KEY,
} = process.env;

// ── watsonx Orchestrate constants (AWS MCSP instance) ─────────────────────────
const WXO_INSTANCE_URL = 'https://api.dl.watson-orchestrate.ibm.com/instances/20260716-1822-4087-90fe-3b3ba1d4cc84';
const WXO_AGENT_ID     = 'a9e0ab50-e784-458e-b631-0946779be803';
const MCSP_TOKEN_URL   = 'https://iam.platform.saas.ibm.com/siusermgr/api/1.0/apikeys/token';
const COMPLETIONS_URL  = `${WXO_INSTANCE_URL}/v1/orchestrate/${WXO_AGENT_ID}/chat/completions`;

// Token cache — reuse within expiry window (MCSP tokens expire in ~60 min)
let _wxoToken  = null;
let _wxoExpiry = 0;

async function getMCSPToken() {
  if (_wxoToken && Date.now() < _wxoExpiry) return _wxoToken;

  const res = await fetch(MCSP_TOKEN_URL, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ apikey: WXO_API_KEY }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`MCSP token exchange failed (${res.status}): ${body.slice(0, 200)}`);
  }

  const json  = await res.json();
  const token = json.token ?? json.access_token;
  if (!token) throw new Error('MCSP token response contained no token field');

  _wxoToken  = token;
  _wxoExpiry = Date.now() + 50 * 60 * 1000;
  return token;
}

// ── Profile context builder ────────────────────────────────────────────────────
// No system prompt injection — the agent has its own instructions.
// We prepend structured profile data to the user message so the agent
// can personalise its response.
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

const resend = RESEND_API_KEY ? new Resend(RESEND_API_KEY) : null;

// ── OTP store (in-memory, per-process) ────────────────────────────────────────
const otpStore = new Map();

function generateOTP() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

// ── Express app ───────────────────────────────────────────────────────────────
const app = express();

app.use(cors({ origin: ['http://localhost:5173', /\.pages\.dev$/, /\.workers\.dev$/] }));
app.use(express.json({ limit: '64kb' }));

// Health check
app.get('/health', (_req, res) => res.json({ status: 'ok' }));

/**
 * GET /api/stock?type=quote&ticker=AAPL
 */
const FH_BASE = 'https://finnhub.io/api/v1';
function fhRangeParams(range) {
  const to   = Math.floor(Date.now() / 1000);
  const days = range === '1W' ? 14 : range === '1M' ? 45 : 120;
  return { resolution: 'D', from: to - days * 86400, to };
}

app.get('/api/stock', async (req, res) => {
  if (!FINNHUB_API_KEY) {
    return res.status(503).json({ error: 'FINNHUB_API_KEY not configured on the server.' });
  }

  const { type = 'quote', ticker = '', query = '', range = '1M' } = req.query;
  const sym = ticker.toUpperCase();
  const key = FINNHUB_API_KEY;

  let endpoint;
  if (type === 'quote') {
    endpoint = `${FH_BASE}/quote?symbol=${sym}&token=${key}`;
  } else if (type === 'candle') {
    const { resolution, from, to } = fhRangeParams(range);
    endpoint = `${FH_BASE}/stock/candle?symbol=${sym}&resolution=${resolution}&from=${from}&to=${to}&token=${key}`;
  } else if (type === 'profile') {
    endpoint = `${FH_BASE}/stock/profile2?symbol=${sym}&token=${key}`;
  } else if (type === 'search') {
    endpoint = `${FH_BASE}/search?q=${encodeURIComponent(query)}&token=${key}`;
  } else {
    return res.status(400).json({ error: 'Unknown type.' });
  }

  try {
    const fhRes = await fetch(endpoint, { headers: { 'X-Finnhub-Token': key } });
    if (!fhRes.ok) return res.status(502).json({ error: `Finnhub error ${fhRes.status}` });
    const data = await fhRes.json();
    if (data.s === 'no_data') return res.status(404).json({ error: 'No data available.' });
    res.json(data);
  } catch (err) {
    console.error('Finnhub proxy error:', err.message);
    res.status(500).json({ error: 'Stock data fetch failed.' });
  }
});

/**
 * POST /send-otp
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
  const expiresAt = Date.now() + 10 * 60 * 1000;
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
 */
app.post('/verify-otp', (req, res) => {
  const { email = '', code = '' } = req.body;
  const normalised = email.trim().toLowerCase();
  const entry      = otpStore.get(normalised);

  if (!entry)                        return res.status(400).json({ error: 'No code found for this email. Request a new one.' });
  if (Date.now() > entry.expiresAt)  { otpStore.delete(normalised); return res.status(400).json({ error: 'Code expired. Request a new one.' }); }
  if (entry.code !== code.trim())    return res.status(400).json({ error: 'Incorrect code. Try again.' });

  otpStore.delete(normalised);
  res.json({ ok: true });
});

/**
 * POST /chat
 * Body: { messages: [...], profile: {...}, userMessage: string }
 * Returns: { reply: string }
 */
app.post('/chat', async (req, res) => {
  if (!WXO_API_KEY) {
    return res.status(503).json({
      error: 'Proxy not configured — missing WXO_API_KEY in .env.local. ' +
             'Get it from watsonx Orchestrate → Settings → API details → Generate API key.',
    });
  }

  const { messages = [], profile = {}, userMessage = '' } = req.body;
  if (!userMessage.trim()) return res.status(400).json({ error: 'userMessage is required.' });

  const profileCtx  = buildProfileContext(profile);
  const userContent = profileCtx ? `${profileCtx}\n\n${userMessage}` : userMessage;

  const fullMessages = [
    ...messages
      .filter((m) => m.sender !== 'system' && !m.pending)
      .slice(-10)
      .map((m) => ({ role: m.sender === 'user' ? 'user' : 'assistant', content: m.text })),
    { role: 'user', content: userContent },
  ];

  try {
    const token = await getMCSPToken();

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
        return res.json({ reply: 'Authentication failed — check WXO_API_KEY in .env.local.' });
      }
      if (woRes.status === 404) {
        return res.json({ reply: `Agent not found (404). Verify agent ID ${WXO_AGENT_ID} is published in your Orchestrate instance.` });
      }
      return res.json({ reply: `Orchestrate returned an error (${woRes.status}). Check server logs.` });
    }

    const data  = await woRes.json();
    const reply = data.choices?.[0]?.message?.content?.trim()
      ?? data.reply
      ?? 'I received a response but could not parse it. Please try again.';

    res.json({ reply });

  } catch (err) {
    console.error('[chat] error:', err.message);
    res.json({ reply: `Server error: ${err.message.slice(0, 120)}` });
  }
});

app.listen(PORT, HOST, () => {
  console.log(`\n🍬 Candyland Bank dev proxy running on http://${HOST === '0.0.0.0' ? 'localhost' : HOST}:${PORT}`);
  console.log(`   Agent : ${WXO_AGENT_ID}`);
  if (!WXO_API_KEY) console.warn('   ⚠  WXO_API_KEY not set — /chat will return 503');
});
