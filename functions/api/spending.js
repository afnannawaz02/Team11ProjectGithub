/**
 * functions/api/spending.js — Cloudflare Pages Function
 * GET /api/spending?type=transactions
 * GET /api/spending?type=analysis
 * GET /api/spending?type=subscriptions
 *
 * Aggregates Plaid transaction history into spending intelligence:
 * category breakdown, subscriptions, savings rate, income vs expenses.
 *
 * Currently returns realistic demo data — swap Plaid section for live API
 * calls (using stored access token from DB) without changing UI contract.
 */

function seedRand(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (Math.imul(31, h) + str.charCodeAt(i)) | 0;
  return function() { h = (Math.imul(31, h) + 0x6d2b79f5) | 0; return ((h >>> 0) / 0xffffffff); };
}

// Category colour map
const CAT_COLORS = {
  'Food & Dining':     '#f472a0',
  'Shopping':          '#c0356a',
  'Transportation':    '#9d2256',
  'Utilities':         '#6b2040',
  'Entertainment':     '#f9a8b8',
  'Health':            '#24a148',
  'Education':         '#3b82d4',
  'Travel':            '#7c5cd8',
  'Subscriptions':     '#e67e22',
  'Income':            '#2ecc71',
  'Other':             '#aaaaaa',
};

function demoTransactions(userId) {
  const r = seedRand(`txn-${userId}`);
  const now = Date.now();
  const raw = [
    // Income
    { desc: 'Salary Deposit',      cat: 'Income',          amount:  4850, daysAgo: 1  },
    { desc: 'Salary Deposit',      cat: 'Income',          amount:  4850, daysAgo: 32 },
    { desc: 'Salary Deposit',      cat: 'Income',          amount:  4850, daysAgo: 63 },
    { desc: 'Freelance Payment',   cat: 'Income',          amount:   650, daysAgo: 10 },
    // Food
    { desc: 'Whole Foods Market',  cat: 'Food & Dining',   amount: -Math.round((60 + r() * 60) * 100) / 100,  daysAgo: 2  },
    { desc: 'Chipotle',            cat: 'Food & Dining',   amount: -Math.round((12 + r() * 8)  * 100) / 100,  daysAgo: 4  },
    { desc: 'Starbucks',           cat: 'Food & Dining',   amount: -Math.round((5  + r() * 5)  * 100) / 100,  daysAgo: 5  },
    { desc: 'Trader Joes',         cat: 'Food & Dining',   amount: -Math.round((55 + r() * 40) * 100) / 100,  daysAgo: 9  },
    { desc: 'Uber Eats',           cat: 'Food & Dining',   amount: -Math.round((25 + r() * 30) * 100) / 100,  daysAgo: 11 },
    { desc: 'Whole Foods Market',  cat: 'Food & Dining',   amount: -Math.round((70 + r() * 50) * 100) / 100,  daysAgo: 16 },
    { desc: 'Panera Bread',        cat: 'Food & Dining',   amount: -Math.round((14 + r() * 10) * 100) / 100,  daysAgo: 19 },
    // Shopping
    { desc: 'Amazon',              cat: 'Shopping',        amount: -Math.round((35 + r() * 80) * 100) / 100,  daysAgo: 3  },
    { desc: 'Target',              cat: 'Shopping',        amount: -Math.round((45 + r() * 60) * 100) / 100,  daysAgo: 14 },
    { desc: 'Best Buy',            cat: 'Shopping',        amount: -Math.round((80 + r() * 120)*100) / 100,   daysAgo: 22 },
    { desc: 'Zara',                cat: 'Shopping',        amount: -Math.round((60 + r() * 90) * 100) / 100,  daysAgo: 28 },
    // Transport
    { desc: 'Uber',                cat: 'Transportation',  amount: -Math.round((12 + r() * 20) * 100) / 100,  daysAgo: 2  },
    { desc: 'Shell Gas Station',   cat: 'Transportation',  amount: -Math.round((55 + r() * 30) * 100) / 100,  daysAgo: 7  },
    { desc: 'Metro Card Reload',   cat: 'Transportation',  amount: -33,  daysAgo: 15 },
    { desc: 'Lyft',                cat: 'Transportation',  amount: -Math.round((14 + r() * 18) * 100) / 100,  daysAgo: 21 },
    // Utilities
    { desc: 'ConEd Electric',      cat: 'Utilities',       amount: -Math.round((95 + r() * 55) * 100) / 100,  daysAgo: 8  },
    { desc: 'Verizon Wireless',    cat: 'Utilities',       amount: -85,  daysAgo: 10 },
    { desc: 'Internet Service',    cat: 'Utilities',       amount: -69.99, daysAgo: 12 },
    // Entertainment
    { desc: 'AMC Theatres',        cat: 'Entertainment',   amount: -Math.round((25 + r() * 20) * 100) / 100,  daysAgo: 6  },
    { desc: 'Steam Games',         cat: 'Entertainment',   amount: -Math.round((20 + r() * 40) * 100) / 100,  daysAgo: 18 },
    // Subscriptions — recurring
    { desc: 'Netflix',             cat: 'Subscriptions',   amount: -22.99, daysAgo: 3,  recurring: true },
    { desc: 'Spotify',             cat: 'Subscriptions',   amount: -10.99, daysAgo: 3,  recurring: true },
    { desc: 'Adobe Creative Cloud',cat: 'Subscriptions',   amount: -54.99, daysAgo: 5,  recurring: true },
    { desc: 'Gym Membership',      cat: 'Subscriptions',   amount: -45.00, daysAgo: 6,  recurring: true },
    { desc: 'Hulu',                cat: 'Subscriptions',   amount: -17.99, daysAgo: 8,  recurring: true },
    { desc: 'iCloud Storage',      cat: 'Subscriptions',   amount: -2.99,  daysAgo: 9,  recurring: true },
    { desc: 'ChatGPT Plus',        cat: 'Subscriptions',   amount: -20.00, daysAgo: 10, recurring: true },
    { desc: 'Amazon Prime',        cat: 'Subscriptions',   amount: -14.99, daysAgo: 12, recurring: true },
    // Health
    { desc: 'CVS Pharmacy',        cat: 'Health',          amount: -Math.round((18 + r() * 30) * 100) / 100,  daysAgo: 13 },
    { desc: 'Doctor Co-Pay',       cat: 'Health',          amount: -40,  daysAgo: 25 },
    // Travel
    { desc: 'Delta Airlines',      cat: 'Travel',          amount: -Math.round((220 + r() * 400)*100) / 100,  daysAgo: 20 },
    { desc: 'Airbnb',              cat: 'Travel',          amount: -Math.round((150 + r() * 300)*100) / 100,  daysAgo: 21 },
    // 2nd month repeats
    { desc: 'Netflix',             cat: 'Subscriptions',   amount: -22.99, daysAgo: 33, recurring: true },
    { desc: 'Spotify',             cat: 'Subscriptions',   amount: -10.99, daysAgo: 33, recurring: true },
    { desc: 'Adobe Creative Cloud',cat: 'Subscriptions',   amount: -54.99, daysAgo: 35, recurring: true },
    { desc: 'Gym Membership',      cat: 'Subscriptions',   amount: -45.00, daysAgo: 36, recurring: true },
    { desc: 'Whole Foods Market',  cat: 'Food & Dining',   amount: -Math.round((65 + r() * 50) * 100) / 100,  daysAgo: 37 },
    { desc: 'Amazon',              cat: 'Shopping',        amount: -Math.round((40 + r() * 70) * 100) / 100,  daysAgo: 40 },
    { desc: 'ConEd Electric',      cat: 'Utilities',       amount: -Math.round((88 + r() * 45) * 100) / 100,  daysAgo: 38 },
    { desc: 'Uber',                cat: 'Transportation',  amount: -Math.round((10 + r() * 15) * 100) / 100,  daysAgo: 42 },
  ];

  return raw.map((t, i) => {
    const d = new Date(now - t.daysAgo * 86400000);
    return {
      id:        `txn-${i}`,
      date:      d.toISOString().slice(0, 10),
      desc:      t.desc,
      category:  t.cat,
      amount:    typeof t.amount === 'number' ? Math.round(t.amount * 100) / 100 : t.amount,
      recurring: t.recurring ?? false,
    };
  }).sort((a, b) => b.date.localeCompare(a.date));
}

function analyzeSpending(txns) {
  const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
  const sixtyDaysAgo  = new Date(Date.now() - 60 * 86400000).toISOString().slice(0, 10);
  const nowStr        = new Date().toISOString().slice(0, 10);

  // Current month (last 30 days)
  const current = txns.filter((t) => t.date >= thirtyDaysAgo && t.date <= nowStr);
  const prior   = txns.filter((t) => t.date >= sixtyDaysAgo  && t.date <  thirtyDaysAgo);

  const income  = current.filter((t) => t.amount > 0).reduce((s, t) => s + t.amount, 0);
  const expense = Math.abs(current.filter((t) => t.amount < 0 && t.category !== 'Income').reduce((s, t) => s + t.amount, 0));
  const savings = income - expense;
  const savingsRate = income > 0 ? parseFloat(((savings / income) * 100).toFixed(1)) : 0;

  const priorExpense = Math.abs(prior.filter((t) => t.amount < 0 && t.category !== 'Income').reduce((s, t) => s + t.amount, 0));
  const expenseChange = priorExpense > 0 ? parseFloat((((expense - priorExpense) / priorExpense) * 100).toFixed(1)) : 0;

  // Category breakdown for current period
  const catAgg = {};
  for (const t of current.filter((t) => t.amount < 0)) {
    catAgg[t.category] = (catAgg[t.category] || 0) + Math.abs(t.amount);
  }
  const categories = Object.entries(catAgg)
    .map(([cat, total]) => ({
      category: cat,
      total:    parseFloat(total.toFixed(2)),
      pct:      expense > 0 ? parseFloat(((total / expense) * 100).toFixed(1)) : 0,
      color:    CAT_COLORS[cat] || '#aaaaaa',
    }))
    .sort((a, b) => b.total - a.total);

  // Monthly trends — 3 months
  const monthlyTrends = Array.from({ length: 3 }, (_, i) => {
    const start = new Date(Date.now() - (i + 1) * 30 * 86400000).toISOString().slice(0, 10);
    const end   = new Date(Date.now() - i * 30 * 86400000).toISOString().slice(0, 10);
    const slice = txns.filter((t) => t.date >= start && t.date < end);
    const inc   = slice.filter((t) => t.amount > 0).reduce((s, t) => s + t.amount, 0);
    const exp   = Math.abs(slice.filter((t) => t.amount < 0).reduce((s, t) => s + t.amount, 0));
    const d = new Date(Date.now() - (i + 0.5) * 30 * 86400000);
    return { month: d.toLocaleString('en-US', { month: 'short' }), income: parseFloat(inc.toFixed(2)), expenses: parseFloat(exp.toFixed(2)) };
  }).reverse();

  // Unusual transactions (amount significantly above category average)
  const catAvg = {};
  for (const [cat, total] of Object.entries(catAgg)) {
    const catTxns = current.filter((t) => t.category === cat && t.amount < 0);
    catAvg[cat] = catTxns.length > 0 ? total / catTxns.length : 0;
  }
  const unusual = current
    .filter((t) => t.amount < 0 && Math.abs(t.amount) > catAvg[t.category] * 2 && Math.abs(t.amount) > 50)
    .map((t) => ({ ...t, flagReason: `${Math.round(Math.abs(t.amount) / catAvg[t.category])}x above your typical ${t.category} spend` }));

  return { income, expense, savings, savingsRate, expenseChange, categories, monthlyTrends, unusual };
}

function detectSubscriptions(txns) {
  const subs = txns.filter((t) => t.recurring);
  // Deduplicate by description — show latest instance and monthly cost
  const seen = new Map();
  for (const t of subs) {
    if (!seen.has(t.desc) || t.date > seen.get(t.desc).date) seen.set(t.desc, t);
  }
  return Array.from(seen.values())
    .map((t) => ({ ...t, monthlyEstimate: Math.abs(t.amount) }))
    .sort((a, b) => b.monthlyEstimate - a.monthlyEstimate);
}

// ── Handler ───────────────────────────────────────────────────────────────────
export async function onRequestGet({ request }) {
  const url    = new URL(request.url);
  const type   = url.searchParams.get('type') || 'transactions';
  const userId = url.searchParams.get('userId') || 'demo';

  const txns = demoTransactions(userId);

  if (type === 'transactions') {
    return Response.json({ transactions: txns.slice(0, 30) });
  }

  if (type === 'analysis') {
    const analysis = analyzeSpending(txns);
    return Response.json(analysis);
  }

  if (type === 'subscriptions') {
    const subs  = detectSubscriptions(txns);
    const total = subs.reduce((s, t) => s + t.monthlyEstimate, 0);
    return Response.json({ subscriptions: subs, totalMonthly: parseFloat(total.toFixed(2)) });
  }

  return Response.json({ error: 'Unknown type.' }, { status: 400 });
}
