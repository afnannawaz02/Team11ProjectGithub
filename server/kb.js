/**
 * server/kb.js — Candyland Bank local knowledge base
 *
 * This is your "own data" that trains Gumdrop's responses.
 * Each entry has a `topic` (used for retrieval matching) and
 * `content` (injected verbatim into the system prompt as context).
 *
 * HOW TO ADD YOUR OWN DATA
 * ─────────────────────────
 * 1. Add a new object to the KNOWLEDGE_BASE array below.
 * 2. Set `topic` to keywords that should trigger this chunk.
 * 3. Put your content (product details, policies, fund data, etc.) in `content`.
 * 4. Restart the proxy server — no build needed.
 *
 * For larger datasets (PDFs, CSVs) see the README integration notes at
 * the bottom of this file.
 */

export const KNOWLEDGE_BASE = [

  // ── Candyland Bank products ──────────────────────────────────────────────────
  {
    topic: ['savings account', 'savings', 'interest rate', 'deposit'],
    content: `
Candyland Bank Savings Accounts (as of 2025):
- Candy Saver (standard): 4.10% AER, no minimum balance, instant access.
- Sweet Saver (premium): 4.75% AER, minimum £10,000 balance, 30-day notice period.
- Junior Jar: 5.00% AER for under-18s, max £5,000. Managed by parent/guardian.
All accounts are FSCS protected up to £85,000.
    `.trim(),
  },

  {
    topic: ['investment fund', 'fund', 'portfolio', 'etf', 'index'],
    content: `
Candyland Bank Investment Funds (2025 lineup):
- Candy Growth Fund: 80% global equities, 20% bonds. Ongoing charge 0.35%. Risk: high.
- Balanced Brittle Fund: 60% equities, 40% bonds/gilts. Ongoing charge 0.28%. Risk: medium.
- Safe Truffle Fund: 100% UK government bonds. Ongoing charge 0.18%. Risk: low.
- ESG Rainbow Fund: Screened global equities (no fossil fuels, tobacco, weapons). Charge 0.42%. Risk: high.
- Dividend Drop Fund: High-yield dividend stocks, quarterly payouts. Charge 0.38%. Risk: medium-high.
Minimum investment: £500 lump sum or £50/month.
    `.trim(),
  },

  {
    topic: ['isa', 'stocks and shares isa', 'cash isa', 'tax', 'allowance'],
    content: `
Candyland Bank ISAs (2025/26 tax year):
- Cash ISA: 4.25% AER, up to £20,000 annual allowance, instant access.
- Stocks & Shares ISA: Access all 5 Candyland funds tax-free. Same £20,000 allowance.
- Lifetime ISA (LISA): 25% government bonus on up to £4,000/year. For first home or retirement.
ISA allowance is use-it-or-lose-it each tax year (6 April – 5 April).
    `.trim(),
  },

  {
    topic: ['pension', 'retirement', 'sipp', 'workplace pension'],
    content: `
Candyland Bank Pension (SIPP):
- Self-Invested Personal Pension with access to all Candyland funds.
- 20% basic-rate tax relief added automatically (40%/45% claimable via self-assessment).
- Annual allowance: £60,000 or 100% of earnings (whichever is lower) for 2025/26.
- Minimum retirement age: 57 (rising to 57 in 2028).
- No platform fee under age 55; 0.15% annual platform fee thereafter.
    `.trim(),
  },

  // ── Investment guidance (your custom financial logic) ────────────────────────
  {
    topic: ['conservative', 'low risk', 'safe', 'capital preservation'],
    content: `
For conservative investors at Candyland Bank:
Recommended allocation: Safe Truffle Fund (50%), Balanced Brittle Fund (40%), Cash ISA (10%).
Rationale: Prioritise capital preservation. Avoid equity-heavy funds.
Expected return: 3–5% p.a. over a 5-year horizon. Max drawdown historically: -6%.
    `.trim(),
  },

  {
    topic: ['moderate', 'balanced', 'medium risk'],
    content: `
For moderate-risk investors at Candyland Bank:
Recommended allocation: Balanced Brittle Fund (50%), Candy Growth Fund (30%), Safe Truffle Fund (20%).
Expected return: 5–8% p.a. over a 7-year horizon. Max drawdown historically: -18%.
Rebalance annually. Consider Stocks & Shares ISA wrapper for tax efficiency.
    `.trim(),
  },

  {
    topic: ['aggressive', 'high risk', 'growth', 'maximise returns'],
    content: `
For aggressive investors at Candyland Bank:
Recommended allocation: Candy Growth Fund (60%), ESG Rainbow Fund (25%), Dividend Drop Fund (15%).
Expected return: 8–12% p.a. over a 10+ year horizon. Max drawdown historically: -38%.
Only suitable if you can leave money invested for 10+ years and stomach short-term losses.
    `.trim(),
  },

  {
    topic: ['esg', 'ethical', 'sustainable', 'green', 'values'],
    content: `
Candyland Bank ESG options:
- ESG Rainbow Fund: Excludes fossil fuels, tobacco, weapons, gambling. Includes renewable energy, social housing REITs.
- All funds are assessed annually for ESG scoring. Reports published every April.
- Candyland Bank is a certified B Corp and offsets 100% of operational carbon.
    `.trim(),
  },

  // ── Fees and charges ─────────────────────────────────────────────────────────
  {
    topic: ['fee', 'charge', 'cost', 'pricing', 'platform fee'],
    content: `
Candyland Bank fee schedule (2025):
- Platform fee: 0.15% p.a. on investments over £100,000; free below.
- Fund ongoing charges: 0.18%–0.42% depending on fund (see fund details).
- No dealing fees on Candyland funds. £9.95 per trade for external shares.
- No exit fees. Transfers out are free.
- ISA and SIPP wrappers: no additional wrapper fee.
    `.trim(),
  },

  // ── Regulatory / compliance ──────────────────────────────────────────────────
  {
    topic: ['regulated', 'fca', 'fscs', 'protected', 'safety', 'secure'],
    content: `
Candyland Bank regulatory status:
- Authorised and regulated by the Financial Conduct Authority (FCA). FRN: 987654.
- Deposits protected up to £85,000 per person by the FSCS.
- Investments are not FSCS protected but are held in nominee accounts ring-fenced from company assets.
- Candyland Bank is subject to UK GDPR. Data is never sold to third parties.
    `.trim(),
  },
];

/**
 * retrieve(query) — simple keyword-based retrieval.
 * Returns the most relevant KB chunks (up to `topN`) as a single string
 * ready to be injected into a system prompt.
 *
 * For production, swap this with a proper vector similarity search
 * (e.g. pgvector, Chroma, or the watsonx Discovery API).
 */
export function retrieve(query, topN = 3) {
  const q = query.toLowerCase();

  const scored = KNOWLEDGE_BASE.map((chunk) => {
    const hits = chunk.topic.filter((kw) => q.includes(kw)).length;
    return { chunk, hits };
  });

  return scored
    .filter(({ hits }) => hits > 0)
    .sort((a, b) => b.hits - a.hits)
    .slice(0, topN)
    .map(({ chunk }) => chunk.content)
    .join('\n\n---\n\n');
}
