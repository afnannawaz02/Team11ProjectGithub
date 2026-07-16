/**
 * functions/knowledge.js — Cloudflare Pages Function
 * POST /knowledge
 *
 * watsonx.ai Custom Service knowledge source endpoint.
 *
 * watsonx sends: { "query": "string", "top_k": number, "user_token": "string" }
 * Returns:       { "results": [{ "content": "string", "score": number }] }
 *
 * user_token is a short-lived KV token issued by /api/auth?action=token.
 * It lets this endpoint look up the user's D1 profile even though watsonx
 * calls this from IBM's servers (no browser cookie available).
 */

import { KNOWLEDGE_BASE } from '../server/kb.js';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

// ── Helpers ───────────────────────────────────────────────────────────────────

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

function ageBracket(dob) {
  if (!dob) return null;
  const age = Math.floor((Date.now() - new Date(dob)) / (365.25 * 24 * 60 * 60 * 1000));
  if (age < 25) return 'Under 25';
  if (age < 35) return '25–34';
  if (age < 45) return '35–44';
  if (age < 55) return '45–54';
  if (age < 65) return '55–64';
  return '65+';
}

// Convert profile object → a readable text chunk for the AI
function profileToText(profile) {
  const GOAL_LABELS = {
    retirement:'Retirement', home:'Buying a home', education:'Education',
    wealth:'Wealth growth', short_term:'Short-term goals', long_term:'Long-term goals',
  };
  const RISK_LABELS = {
    conservative: 'Conservative (capital preservation, minimal volatility)',
    moderate:     'Moderate (balanced growth, manageable risk)',
    aggressive:   'Aggressive (high returns, accepts large swings)',
  };
  const HORIZON_LABELS = { short:'0–3 years', medium:'3–10 years', long:'10+ years' };
  const INCOME_LABELS = {
    'under-25k':'Under $25k', '25k-50k':'$25k–$50k', '50k-75k':'$50k–$75k',
    '75k-100k':'$75k–$100k', '100k-150k':'$100k–$150k', '150k-250k':'$150k–$250k',
    'over-250k':'$250k+', 'prefer-not':'Not disclosed',
  };

  const goals   = (profile.goals ?? []).map((g) => GOAL_LABELS[g] || g).join(', ') || 'Not set';
  const invests = (profile.currentInvestments ?? [])
    .map((i) => ({stocks:'Stocks',bonds:'Bonds',etfs:'ETFs',crypto:'Crypto',cash:'Cash',none:'None'})[i]||i)
    .join(', ') || 'None';
  const prefs   = (profile.preferences ?? [])
    .map((p) => ({esg:'ESG/Ethical',tech:'High-growth Tech',dividend:'Dividend Income',index:'Low-fee Index'})[p]||p)
    .join(', ') || 'None';

  return [
    `THIS USER'S INVESTOR PROFILE (from D1 database — use to personalise your response):`,
    `Goals: ${goals}`,
    `Risk tolerance: ${RISK_LABELS[profile.risk] || profile.risk || 'Not set'}`,
    `Time horizon: ${HORIZON_LABELS[profile.horizon] || profile.horizon || 'Not set'}`,
    `Annual income: ${INCOME_LABELS[profile.annualIncome] || profile.annualIncome || 'Not set'}`,
    `Monthly investment: ${profile.monthlySavings ? '$' + profile.monthlySavings : 'Not set'}`,
    `Emergency fund: ${profile.emergencyFund || 'Not set'}`,
    `Current holdings: ${invests}`,
    `Age bracket: ${ageBracket(profile.dob) || 'Not set'}`,
    `Employment: ${profile.employmentStatus || 'Not set'}`,
    `Credit score: ${profile.creditScore || 'Not set'}`,
    `Location: ${profile.city && profile.usState ? `${profile.city}, ${profile.usState}` : profile.usState || 'Not set'}`,
    `Veteran status: ${profile.veteranStatus || 'Not set'}`,
    `Investment preferences: ${prefs}`,
  ].join('\n');
}

// ── Main handler ──────────────────────────────────────────────────────────────
export async function onRequest({ request, env }) {
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  // GET — connection test used by watsonx when you click "Test connection"
  if (request.method === 'GET') {
    return Response.json({
      name: 'Candyland Bank Knowledge Base',
      description: 'Financial products, investment guidance, fees, and personalised user profile for Gumdrop AI.',
      version: '2.0.0',
    }, { headers: CORS_HEADERS });
  }

  if (request.method !== 'POST') {
    return Response.json({ error: 'Use POST' }, { status: 405, headers: CORS_HEADERS });
  }

  const body = await request.json().catch(() => ({}));
  const query      = (body.query || body.input || body.userMessage || '').toLowerCase().trim();
  const topK       = Math.min(body.top_k || body.topK || 5, 10);
  const userToken  = body.user_token || body.userToken || null;

  // ── Fetch user profile from D1 using the lookup token ────────────────────
  let profileChunk = null;
  if (userToken && env.OTP_STORE && env.DB) {
    try {
      const userId = await env.OTP_STORE.get(`lt_${userToken}`);
      if (userId) {
        const row = await env.DB.prepare(
          'SELECT * FROM profiles WHERE user_id = ?'
        ).bind(Number(userId)).first();
        if (row) {
          profileChunk = {
            id:      'user-profile',
            content: profileToText(rowToProfile(row)),
            score:   1.0, // always highest priority
            metadata: { type: 'user_profile' },
          };
          // Consume the token so it can only be used once per query
          await env.OTP_STORE.delete(`lt_${userToken}`);
        }
      }
    } catch (e) {
      console.error('token lookup error:', e.message);
    }
  }

  // ── Score KB chunks by keyword relevance ─────────────────────────────────
  const scored = KNOWLEDGE_BASE.map((chunk) => {
    const topicHits   = chunk.topic.filter((kw) => query.includes(kw)).length;
    const queryWords  = query.split(/\s+/).filter((w) => w.length > 3);
    const contentHits = queryWords.filter((w) => chunk.content.toLowerCase().includes(w)).length;
    const score       = (topicHits * 2 + contentHits) / (chunk.topic.length + queryWords.length + 1);
    return { chunk, score };
  });

  let kbResults = scored
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, topK)
    .map(({ chunk, score }, i) => ({
      id:       `kb-${i}`,
      content:  chunk.content,
      score:    Math.min(score, 0.99), // always below user profile score
      metadata: { topics: chunk.topic },
    }));

  // Fallback to top 3 general chunks if nothing matched
  if (kbResults.length === 0) {
    kbResults = KNOWLEDGE_BASE.slice(0, 3).map((chunk, i) => ({
      id:       `kb-fallback-${i}`,
      content:  chunk.content,
      score:    0.1,
      metadata: { topics: chunk.topic },
    }));
  }

  // User profile chunk always comes first so the AI sees it before KB content
  const results = profileChunk
    ? [profileChunk, ...kbResults]
    : kbResults;

  return Response.json({ results }, { headers: CORS_HEADERS });
}
