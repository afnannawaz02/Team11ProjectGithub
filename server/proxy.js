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
 *   WO_USERNAME  — Your watsonx Orchestrate login email (e.g. user@ibm.com)
 *                  Same credentials you use to log in at:
 *                    https://dl.watson-orchestrate.ibm.com
 *   WO_PASSWORD  — Password for the above login
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
  WO_USERNAME,
  WO_PASSWORD,
  RESEND_API_KEY,
  RESEND_FROM          = 'noreply@team11.uk',
  ALLOWED_EMAIL_DOMAIN = 'ibm.com',
  FINNHUB_API_KEY,
} = process.env;

// ── watsonx Orchestrate constants ─────────────────────────────────────────────
const WO_HOST     = 'https://dl.watson-orchestrate.ibm.com';
const WO_AGENT_ID = '77dfacb4-0d9a-4cd8-bf9c-6db1c7e554aa';
const TOKEN_URL       = `${WO_HOST}/v1/auth/token`;
const COMPLETIONS_URL = `${WO_HOST}/v1/orchestrate/${WO_AGENT_ID}/chat/completions`;

// Token cache — reuse within expiry window
let _woToken  = null;
let _woExpiry = 0;

async function getWOToken() {
  if (_woToken && Date.now() < _woExpiry) return _woToken;

  const res = await fetch(TOKEN_URL, {
    method:  'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body:    new URLSearchParams({
      username:   WO_USERNAME,
      password:   WO_PASSWORD,
      grant_type: 'password',
      scope:      '',
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`WO auth failed (${res.status}): ${body.slice(0, 200)}`);
  }

  const json = await res.json();
  const token = json.access_token ?? json.token ?? json.id_token;
  if (!token) throw new Error('WO auth response contained no token field');

  // Cache for 50 minutes (WO tokens typically expire in 60 min)
  _woToken  = token;
  _woExpiry = Date.now() + 50 * 60 * 1000;
  return token;
}

// ── Profile system prompt builder ──────────────────────────────────────────────
function buildSystemPrompt(profile, context) {
  const today = new Date().toISOString().slice(0, 10);
  const base  = [
    'You are Gumdrop, the Financial Advisor AI for Candyland Bank.',
    'Help users with budgeting, savings, investing, debt, and financial planning.',
    'Be encouraging, concise, and actionable. Use bullet points where helpful.',
    `Today: ${today}.`,
  ];

  if (profile && Object.keys(profile).length > 0) {
    const goalMap = {
      retirement: 'Retirement planning', home: 'Home purchase',
      education:  'Education funding',   wealth: 'Wealth growth',
      short_term: 'Short-term savings',  long_term: 'Long-term investing',
    };
    const goals       = (profile.goals ?? []).map((g) => goalMap[g] || g).join(', ') || 'Not specified';
    const investments = (profile.currentInvestments ?? []).join(', ') || 'None listed';
    const prefs       = (profile.preferences ?? []).join(', ') || 'None';

    base.push(
      '',
      'USER PROFILE:',
      `- Goals: ${goals}`,
      `- Risk tolerance: ${profile.risk || 'Not specified'}`,
      `- Time horizon: ${profile.horizon || 'Not specified'}`,
      `- Annual income: ${profile.annualIncome ? '$' + Number(profile.annualIncome).toLocaleString() : 'Not disclosed'}`,
      `- Monthly savings: ${profile.monthlySavings ? '$' + Number(profile.monthlySavings).toLocaleString() : 'Not disclosed'}`,
      `- Emergency fund: ${profile.emergencyFund || 'Unknown'}`,
      `- Current investments: ${investments}`,
      `- Employment: ${profile.employmentStatus || 'Not specified'}`,
      `- Marital status: ${profile.maritalStatus || 'Not specified'}`,
      `- Credit score: ${profile.creditScore || 'Not disclosed'}`,
      `- Investment preferences: ${prefs}`,
      'Use this profile to personalise every response. Be specific, actionable, and encouraging.',
    );
  }

  if (context) {
    base.push('', 'RELEVANT CANDYLAND BANK KNOWLEDGE:', context);
  }

  return base.filter((l) => l !== undefined).join('\n');
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
  if (!WO_USERNAME || !WO_PASSWORD) {
    const missing = [!WO_USERNAME && 'WO_USERNAME', !WO_PASSWORD && 'WO_PASSWORD'].filter(Boolean).join(', ');
    return res.status(503).json({
      error: `Proxy not configured — missing .env.local key(s): ${missing}. ` +
             `Add WO_USERNAME (your watsonx Orchestrate email) and WO_PASSWORD to .env.local and restart the server.`,
    });
  }

  const { messages = [], profile = {}, userMessage = '' } = req.body;
  if (!userMessage.trim()) return res.status(400).json({ error: 'userMessage is required.' });

  const context   = retrieve(userMessage);
  const sysPrompt = buildSystemPrompt(profile, context);

  const fullMessages = [
    { role: 'system', content: sysPrompt },
    ...messages
      .filter((m) => m.sender !== 'system' && !m.pending)
      .slice(-10)
      .map((m) => ({ role: m.sender === 'user' ? 'user' : 'assistant', content: m.text })),
    { role: 'user', content: userMessage },
  ];

  try {
    const token = await getWOToken();

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
      console.error(`[chat] WO completions error ${woRes.status}:`, errText.slice(0, 400));

      if (woRes.status === 401 || woRes.status === 403) {
        return res.json({ reply: 'Authentication failed — check WO_USERNAME and WO_PASSWORD in .env.local.' });
      }
      if (woRes.status === 404) {
        return res.json({ reply: `Agent not found (404). Verify agent ID ${WO_AGENT_ID} is published in your Orchestrate instance.` });
      }
      return res.json({ reply: `Orchestrate returned an error (${woRes.status}). Check server logs.` });
    }

    const data  = await woRes.json();
    const reply = data.choices?.[0]?.message?.content?.trim()
      ?? data.reply
      ?? 'I received a response but could not read it. Please try again.';

    res.json({ reply });

  } catch (err) {
    console.error('[chat] error:', err.message);
    res.json({ reply: `Server error: ${err.message.slice(0, 120)}` });
  }
});

app.listen(PORT, HOST, () => {
  console.log(`\n🍬 Candyland Bank dev proxy running on http://${HOST === '0.0.0.0' ? 'localhost' : HOST}:${PORT}`);
  console.log(`   Agent : ${WO_AGENT_ID}`);
  if (!WO_USERNAME) console.warn('   ⚠  WO_USERNAME not set — /chat will return 503');
  if (!WO_PASSWORD) console.warn('   ⚠  WO_PASSWORD not set — /chat will return 503');
});
