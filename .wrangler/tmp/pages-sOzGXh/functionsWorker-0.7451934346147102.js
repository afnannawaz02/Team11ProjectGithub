var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// api/finance.js
var FH_BASE = "https://finnhub.io/api/v1";
function seedRand(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = Math.imul(31, h) + str.charCodeAt(i) | 0;
  return function() {
    h = Math.imul(31, h) + 1831565813 | 0;
    return (h >>> 0) / 4294967295;
  };
}
__name(seedRand, "seedRand");
function demoPlaidAccounts(userId) {
  const r = seedRand(`plaid-${userId}`);
  return [
    { id: "checking-1", name: "Chase Checking", type: "checking", balance: Math.round((2e3 + r() * 8e3) * 100) / 100 },
    { id: "savings-1", name: "Chase Savings", type: "savings", balance: Math.round((5e3 + r() * 25e3) * 100) / 100 },
    { id: "credit-1", name: "Chase Sapphire", type: "credit", balance: -Math.round((500 + r() * 3500) * 100) / 100 },
    { id: "invest-1", name: "Fidelity Brokerage", type: "investment", balance: Math.round((8e3 + r() * 42e3) * 100) / 100 }
  ];
}
__name(demoPlaidAccounts, "demoPlaidAccounts");
function demoCoinbaseHoldings(userId) {
  const r = seedRand(`coinbase-${userId}`);
  const prices = { BTC: 67450, ETH: 3820, SOL: 185, USDC: 1 };
  return [
    { symbol: "BTC", name: "Bitcoin", qty: parseFloat((0.05 + r() * 0.35).toFixed(6)), price: prices.BTC },
    { symbol: "ETH", name: "Ethereum", qty: parseFloat((0.5 + r() * 3.5).toFixed(4)), price: prices.ETH },
    { symbol: "SOL", name: "Solana", qty: parseFloat((5 + r() * 45).toFixed(2)), price: prices.SOL },
    { symbol: "USDC", name: "USD Coin", qty: parseFloat((100 + r() * 900).toFixed(2)), price: prices.USDC }
  ].map((h) => ({ ...h, value: parseFloat((h.qty * h.price).toFixed(2)) }));
}
__name(demoCoinbaseHoldings, "demoCoinbaseHoldings");
function demoStockHoldings(userId) {
  const r = seedRand(`stocks-${userId}`);
  const prices = { AAPL: 191.85, MSFT: 422.06, GOOGL: 177.34, NVDA: 875.4, VTI: 241.55, BND: 74.2 };
  return Object.entries(prices).map(([sym, price]) => ({
    symbol: sym,
    shares: parseFloat((1 + r() * 20).toFixed(2)),
    price,
    value: 0
    // filled after
  })).map((h) => ({ ...h, value: parseFloat((h.shares * h.price).toFixed(2)) }));
}
__name(demoStockHoldings, "demoStockHoldings");
async function liveQuote(ticker, apiKey) {
  try {
    const r = await fetch(`${FH_BASE}/quote?symbol=${ticker}&token=${apiKey}`, {
      headers: { "X-Finnhub-Token": apiKey }
    });
    if (!r.ok) return null;
    const d = await r.json();
    return d.c || null;
  } catch {
    return null;
  }
}
__name(liveQuote, "liveQuote");
async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  const type = url.searchParams.get("type") || "portfolio";
  const userId = url.searchParams.get("userId") || "demo";
  if (type === "portfolio") {
    const livePlaid = await tryLivePlaid(userId, env);
    const liveCrypto = await tryLiveCoinbase(userId, env);
    const plaid = livePlaid || demoPlaidAccounts(userId);
    const crypto2 = liveCrypto || demoCoinbaseHoldings(userId);
    let stocks = demoStockHoldings(userId);
    if (env.FINNHUB_API_KEY) {
      const top3 = stocks.slice(0, 3);
      await Promise.allSettled(top3.map(async (h) => {
        const price = await liveQuote(h.symbol, env.FINNHUB_API_KEY);
        if (price) {
          h.price = price;
          h.value = parseFloat((h.shares * price).toFixed(2));
        }
      }));
    }
    const bankCash = plaid.filter((a) => a.type === "checking" || a.type === "savings").reduce((s, a) => s + a.balance, 0);
    const bankInvest = plaid.filter((a) => a.type === "investment").reduce((s, a) => s + a.balance, 0);
    const bankDebt = Math.abs(plaid.filter((a) => a.type === "credit").reduce((s, a) => s + a.balance, 0));
    const cryptoTotal = crypto2.reduce((s, h) => s + h.value, 0);
    const stockTotal = stocks.reduce((s, h) => s + h.value, 0);
    const totalAssets = bankCash + bankInvest + cryptoTotal + stockTotal;
    const netWorth = totalAssets - bankDebt;
    const allocation = [
      { label: "US Equities", value: stockTotal, pct: 0, color: "#f472a0" },
      { label: "Bank / Savings", value: bankCash, pct: 0, color: "#c0356a" },
      { label: "Brokerage Acct", value: bankInvest, pct: 0, color: "#9d2256" },
      { label: "Cryptocurrency", value: cryptoTotal, pct: 0, color: "#6b2040" }
    ].map((a) => ({ ...a, pct: totalAssets > 0 ? parseFloat((a.value / totalAssets * 100).toFixed(1)) : 0 }));
    const sectorMap = { AAPL: "Technology", MSFT: "Technology", GOOGL: "Technology", NVDA: "Technology", VTI: "Diversified ETF", BND: "Fixed Income" };
    const sectorAgg = {};
    for (const h of stocks) {
      const sec = sectorMap[h.symbol] || "Other";
      sectorAgg[sec] = (sectorAgg[sec] || 0) + h.value;
    }
    const sectors = Object.entries(sectorAgg).map(([label, value]) => ({ label, value: parseFloat(value.toFixed(2)), pct: parseFloat((value / stockTotal * 100).toFixed(1)) })).sort((a, b) => b.value - a.value);
    const allPositions = [
      ...stocks.map((h) => ({ label: h.symbol, value: h.value })),
      ...crypto2.map((h) => ({ label: h.symbol, value: h.value }))
    ].sort((a, b) => b.value - a.value);
    const topConcentration = allPositions[0] ? parseFloat((allPositions[0].value / totalAssets * 100).toFixed(1)) : 0;
    const cryptoPct = cryptoTotal / totalAssets * 100;
    const diversScore = Math.max(0, Math.min(100, Math.round(100 - topConcentration * 0.6 - Math.max(0, cryptoPct - 20) * 0.5)));
    const healthScore = Math.round(Math.min(100, diversScore * 0.4 + (netWorth > 5e4 ? 30 : netWorth / 5e4 * 30) + (bankCash > 1e4 ? 30 : bankCash / 1e4 * 30)));
    return Response.json({
      totalAssets: parseFloat(totalAssets.toFixed(2)),
      totalDebt: parseFloat(bankDebt.toFixed(2)),
      netWorth: parseFloat(netWorth.toFixed(2)),
      allocation,
      sectors,
      stocks,
      crypto: crypto2,
      plaidAccounts: plaid,
      topConcentration,
      diversScore,
      healthScore,
      cryptoPct: parseFloat(cryptoPct.toFixed(1))
    });
  }
  if (type === "networth") {
    const r = seedRand(`nw-${userId}`);
    const base = 45e3 + r() * 8e4;
    const months = Array.from({ length: 12 }, (_, i) => {
      const d = /* @__PURE__ */ new Date();
      d.setMonth(d.getMonth() - (11 - i));
      return {
        label: d.toLocaleString("en-US", { month: "short", year: "2-digit" }),
        // Weekly data points within each month (4 weeks × 12 months = 48 points for 3M range)
        value: parseFloat((base * (0.85 + i * 0.013 + (r() - 0.5) * 0.04)).toFixed(2))
      };
    });
    const daily90 = Array.from({ length: 90 }, (_, i) => {
      const d = /* @__PURE__ */ new Date();
      d.setDate(d.getDate() - (89 - i));
      return {
        label: d.toISOString().slice(0, 10),
        value: parseFloat((base * (0.9 + (89 - i) * -5e-4 + (r() - 0.5) * 0.02)).toFixed(2))
      };
    });
    return Response.json({ history: months, daily90 });
  }
  if (type === "rebalance") {
    const livePlaid = await tryLivePlaid(userId, env);
    const liveCrypto = await tryLiveCoinbase(userId, env);
    const plaid = livePlaid || demoPlaidAccounts(userId);
    const crypto2 = liveCrypto || demoCoinbaseHoldings(userId);
    const stocks = demoStockHoldings(userId);
    const bankCash = plaid.filter((a) => a.type === "checking" || a.type === "savings").reduce((s, a) => s + a.balance, 0);
    const bankInvest = plaid.filter((a) => a.type === "investment").reduce((s, a) => s + a.balance, 0);
    const bankDebt = Math.abs(plaid.filter((a) => a.type === "credit").reduce((s, a) => s + a.balance, 0));
    const cryptoTotal = crypto2.reduce((s, h) => s + h.value, 0);
    const stockTotal = stocks.reduce((s, h) => s + h.value, 0);
    const totalAssets = bankCash + bankInvest + cryptoTotal + stockTotal;
    let risk = "moderate";
    if (user && env.DB) {
      const profile = await env.DB.prepare(
        `SELECT risk FROM profiles WHERE user_id=? LIMIT 1`
      ).bind(user.id).first().catch(() => null);
      if (profile?.risk) risk = profile.risk;
    }
    const target = targetAllocation(risk);
    const actual = {
      equities: totalAssets > 0 ? stockTotal / totalAssets * 100 : 0,
      bonds: totalAssets > 0 ? bankInvest / totalAssets * 100 : 0,
      cash: totalAssets > 0 ? bankCash / totalAssets * 100 : 0,
      crypto: totalAssets > 0 ? cryptoTotal / totalAssets * 100 : 0
    };
    const drift = Object.fromEntries(
      Object.keys(target).map((k) => [k, parseFloat((actual[k] - target[k]).toFixed(1))])
    );
    const maxDrift = Math.max(...Object.values(drift).map(Math.abs));
    const suggestions = Object.entries(drift).filter(([, d]) => Math.abs(d) >= 2).sort(([, a], [, b]) => Math.abs(b) - Math.abs(a)).map(([cls, d]) => {
      const delta = Math.abs(d / 100 * totalAssets);
      return {
        asset_class: cls,
        action: d > 0 ? "sell" : "buy",
        amount: parseFloat(delta.toFixed(2)),
        drift_pct: d,
        target_pct: target[cls],
        actual_pct: parseFloat(actual[cls].toFixed(1))
      };
    });
    const healthScore = Math.max(0, Math.min(100, Math.round(100 - maxDrift * 1.5)));
    return Response.json({
      ok: true,
      risk,
      target,
      actual: Object.fromEntries(Object.keys(actual).map((k) => [k, parseFloat(actual[k].toFixed(1))])),
      drift,
      suggestions,
      healthScore,
      totalAssets: parseFloat(totalAssets.toFixed(2)),
      maxDrift: parseFloat(maxDrift.toFixed(1))
    });
  }
  return Response.json({ error: "Unknown type." }, { status: 400 });
}
__name(onRequestGet, "onRequestGet");

// api/spending.js
function seedRand2(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = Math.imul(31, h) + str.charCodeAt(i) | 0;
  return function() {
    h = Math.imul(31, h) + 1831565813 | 0;
    return (h >>> 0) / 4294967295;
  };
}
__name(seedRand2, "seedRand");
var CAT_COLORS = {
  "Food & Dining": "#f472a0",
  "Shopping": "#c0356a",
  "Transportation": "#9d2256",
  "Utilities": "#6b2040",
  "Entertainment": "#f9a8b8",
  "Health": "#24a148",
  "Education": "#3b82d4",
  "Travel": "#7c5cd8",
  "Subscriptions": "#e67e22",
  "Income": "#2ecc71",
  "Other": "#aaaaaa"
};
function demoTransactions(userId) {
  const r = seedRand2(`txn-${userId}`);
  const now = Date.now();
  const raw = [
    // Income
    { desc: "Salary Deposit", cat: "Income", amount: 4850, daysAgo: 1 },
    { desc: "Salary Deposit", cat: "Income", amount: 4850, daysAgo: 32 },
    { desc: "Salary Deposit", cat: "Income", amount: 4850, daysAgo: 63 },
    { desc: "Freelance Payment", cat: "Income", amount: 650, daysAgo: 10 },
    // Food
    { desc: "Whole Foods Market", cat: "Food & Dining", amount: -Math.round((60 + r() * 60) * 100) / 100, daysAgo: 2 },
    { desc: "Chipotle", cat: "Food & Dining", amount: -Math.round((12 + r() * 8) * 100) / 100, daysAgo: 4 },
    { desc: "Starbucks", cat: "Food & Dining", amount: -Math.round((5 + r() * 5) * 100) / 100, daysAgo: 5 },
    { desc: "Trader Joes", cat: "Food & Dining", amount: -Math.round((55 + r() * 40) * 100) / 100, daysAgo: 9 },
    { desc: "Uber Eats", cat: "Food & Dining", amount: -Math.round((25 + r() * 30) * 100) / 100, daysAgo: 11 },
    { desc: "Whole Foods Market", cat: "Food & Dining", amount: -Math.round((70 + r() * 50) * 100) / 100, daysAgo: 16 },
    { desc: "Panera Bread", cat: "Food & Dining", amount: -Math.round((14 + r() * 10) * 100) / 100, daysAgo: 19 },
    // Shopping
    { desc: "Amazon", cat: "Shopping", amount: -Math.round((35 + r() * 80) * 100) / 100, daysAgo: 3 },
    { desc: "Target", cat: "Shopping", amount: -Math.round((45 + r() * 60) * 100) / 100, daysAgo: 14 },
    { desc: "Best Buy", cat: "Shopping", amount: -Math.round((80 + r() * 120) * 100) / 100, daysAgo: 22 },
    { desc: "Zara", cat: "Shopping", amount: -Math.round((60 + r() * 90) * 100) / 100, daysAgo: 28 },
    // Transport
    { desc: "Uber", cat: "Transportation", amount: -Math.round((12 + r() * 20) * 100) / 100, daysAgo: 2 },
    { desc: "Shell Gas Station", cat: "Transportation", amount: -Math.round((55 + r() * 30) * 100) / 100, daysAgo: 7 },
    { desc: "Metro Card Reload", cat: "Transportation", amount: -33, daysAgo: 15 },
    { desc: "Lyft", cat: "Transportation", amount: -Math.round((14 + r() * 18) * 100) / 100, daysAgo: 21 },
    // Utilities
    { desc: "ConEd Electric", cat: "Utilities", amount: -Math.round((95 + r() * 55) * 100) / 100, daysAgo: 8 },
    { desc: "Verizon Wireless", cat: "Utilities", amount: -85, daysAgo: 10 },
    { desc: "Internet Service", cat: "Utilities", amount: -69.99, daysAgo: 12 },
    // Entertainment
    { desc: "AMC Theatres", cat: "Entertainment", amount: -Math.round((25 + r() * 20) * 100) / 100, daysAgo: 6 },
    { desc: "Steam Games", cat: "Entertainment", amount: -Math.round((20 + r() * 40) * 100) / 100, daysAgo: 18 },
    // Subscriptions — recurring
    { desc: "Netflix", cat: "Subscriptions", amount: -22.99, daysAgo: 3, recurring: true },
    { desc: "Spotify", cat: "Subscriptions", amount: -10.99, daysAgo: 3, recurring: true },
    { desc: "Adobe Creative Cloud", cat: "Subscriptions", amount: -54.99, daysAgo: 5, recurring: true },
    { desc: "Gym Membership", cat: "Subscriptions", amount: -45, daysAgo: 6, recurring: true },
    { desc: "Hulu", cat: "Subscriptions", amount: -17.99, daysAgo: 8, recurring: true },
    { desc: "iCloud Storage", cat: "Subscriptions", amount: -2.99, daysAgo: 9, recurring: true },
    { desc: "ChatGPT Plus", cat: "Subscriptions", amount: -20, daysAgo: 10, recurring: true },
    { desc: "Amazon Prime", cat: "Subscriptions", amount: -14.99, daysAgo: 12, recurring: true },
    // Health
    { desc: "CVS Pharmacy", cat: "Health", amount: -Math.round((18 + r() * 30) * 100) / 100, daysAgo: 13 },
    { desc: "Doctor Co-Pay", cat: "Health", amount: -40, daysAgo: 25 },
    // Travel
    { desc: "Delta Airlines", cat: "Travel", amount: -Math.round((220 + r() * 400) * 100) / 100, daysAgo: 20 },
    { desc: "Airbnb", cat: "Travel", amount: -Math.round((150 + r() * 300) * 100) / 100, daysAgo: 21 },
    // 2nd month repeats
    { desc: "Netflix", cat: "Subscriptions", amount: -22.99, daysAgo: 33, recurring: true },
    { desc: "Spotify", cat: "Subscriptions", amount: -10.99, daysAgo: 33, recurring: true },
    { desc: "Adobe Creative Cloud", cat: "Subscriptions", amount: -54.99, daysAgo: 35, recurring: true },
    { desc: "Gym Membership", cat: "Subscriptions", amount: -45, daysAgo: 36, recurring: true },
    { desc: "Whole Foods Market", cat: "Food & Dining", amount: -Math.round((65 + r() * 50) * 100) / 100, daysAgo: 37 },
    { desc: "Amazon", cat: "Shopping", amount: -Math.round((40 + r() * 70) * 100) / 100, daysAgo: 40 },
    { desc: "ConEd Electric", cat: "Utilities", amount: -Math.round((88 + r() * 45) * 100) / 100, daysAgo: 38 },
    { desc: "Uber", cat: "Transportation", amount: -Math.round((10 + r() * 15) * 100) / 100, daysAgo: 42 }
  ];
  return raw.map((t, i) => {
    const d = new Date(now - t.daysAgo * 864e5);
    return {
      id: `txn-${i}`,
      date: d.toISOString().slice(0, 10),
      desc: t.desc,
      category: t.cat,
      amount: typeof t.amount === "number" ? Math.round(t.amount * 100) / 100 : t.amount,
      recurring: t.recurring ?? false
    };
  }).sort((a, b) => b.date.localeCompare(a.date));
}
__name(demoTransactions, "demoTransactions");
function analyzeSpending(txns) {
  const thirtyDaysAgo = new Date(Date.now() - 30 * 864e5).toISOString().slice(0, 10);
  const sixtyDaysAgo = new Date(Date.now() - 60 * 864e5).toISOString().slice(0, 10);
  const nowStr = (/* @__PURE__ */ new Date()).toISOString().slice(0, 10);
  const current = txns.filter((t) => t.date >= thirtyDaysAgo && t.date <= nowStr);
  const prior = txns.filter((t) => t.date >= sixtyDaysAgo && t.date < thirtyDaysAgo);
  const income = current.filter((t) => t.amount > 0).reduce((s, t) => s + t.amount, 0);
  const expense = Math.abs(current.filter((t) => t.amount < 0 && t.category !== "Income").reduce((s, t) => s + t.amount, 0));
  const savings = income - expense;
  const savingsRate = income > 0 ? parseFloat((savings / income * 100).toFixed(1)) : 0;
  const priorExpense = Math.abs(prior.filter((t) => t.amount < 0 && t.category !== "Income").reduce((s, t) => s + t.amount, 0));
  const expenseChange = priorExpense > 0 ? parseFloat(((expense - priorExpense) / priorExpense * 100).toFixed(1)) : 0;
  const catAgg = {};
  for (const t of current.filter((t2) => t2.amount < 0)) {
    catAgg[t.category] = (catAgg[t.category] || 0) + Math.abs(t.amount);
  }
  const categories = Object.entries(catAgg).map(([cat, total]) => ({
    category: cat,
    total: parseFloat(total.toFixed(2)),
    pct: expense > 0 ? parseFloat((total / expense * 100).toFixed(1)) : 0,
    color: CAT_COLORS[cat] || "#aaaaaa"
  })).sort((a, b) => b.total - a.total);
  const monthlyTrends = Array.from({ length: 3 }, (_, i) => {
    const start = new Date(Date.now() - (i + 1) * 30 * 864e5).toISOString().slice(0, 10);
    const end = new Date(Date.now() - i * 30 * 864e5).toISOString().slice(0, 10);
    const slice = txns.filter((t) => t.date >= start && t.date < end);
    const inc = slice.filter((t) => t.amount > 0).reduce((s, t) => s + t.amount, 0);
    const exp = Math.abs(slice.filter((t) => t.amount < 0).reduce((s, t) => s + t.amount, 0));
    const d = new Date(Date.now() - (i + 0.5) * 30 * 864e5);
    return { month: d.toLocaleString("en-US", { month: "short" }), income: parseFloat(inc.toFixed(2)), expenses: parseFloat(exp.toFixed(2)) };
  }).reverse();
  const catAvg = {};
  for (const [cat, total] of Object.entries(catAgg)) {
    const catTxns = current.filter((t) => t.category === cat && t.amount < 0);
    catAvg[cat] = catTxns.length > 0 ? total / catTxns.length : 0;
  }
  const unusual = current.filter((t) => t.amount < 0 && Math.abs(t.amount) > catAvg[t.category] * 2 && Math.abs(t.amount) > 50).map((t) => ({ ...t, flagReason: `${Math.round(Math.abs(t.amount) / catAvg[t.category])}x above your typical ${t.category} spend` }));
  return { income, expense, savings, savingsRate, expenseChange, categories, monthlyTrends, unusual };
}
__name(analyzeSpending, "analyzeSpending");
function detectSubscriptions(txns) {
  const subs = txns.filter((t) => t.recurring);
  const seen = /* @__PURE__ */ new Map();
  for (const t of subs) {
    if (!seen.has(t.desc) || t.date > seen.get(t.desc).date) seen.set(t.desc, t);
  }
  return Array.from(seen.values()).map((t) => ({ ...t, monthlyEstimate: Math.abs(t.amount) })).sort((a, b) => b.monthlyEstimate - a.monthlyEstimate);
}
__name(detectSubscriptions, "detectSubscriptions");
async function onRequestGet2({ request }) {
  const url = new URL(request.url);
  const type = url.searchParams.get("type") || "transactions";
  const userId = url.searchParams.get("userId") || "demo";
  const txns = demoTransactions(userId);
  if (type === "transactions") {
    return Response.json({ transactions: txns.slice(0, 30) });
  }
  if (type === "analysis") {
    const analysis = analyzeSpending(txns);
    return Response.json(analysis);
  }
  if (type === "subscriptions") {
    const subs = detectSubscriptions(txns);
    const total = subs.reduce((s, t) => s + t.monthlyEstimate, 0);
    return Response.json({ subscriptions: subs, totalMonthly: parseFloat(total.toFixed(2)) });
  }
  return Response.json({ error: "Unknown type." }, { status: 400 });
}
__name(onRequestGet2, "onRequestGet");

// api/stock.js
var BASE = "https://finnhub.io/api/v1";
function rangeParams(range) {
  const day = 86400;
  const to = Math.floor(Date.now() / 1e3);
  const days = range === "1D" ? 2 : range === "1W" ? 14 : range === "1M" ? 45 : range === "3M" ? 92 : 120;
  const resolution = range === "1D" ? "60" : "D";
  return { resolution, from: to - days * day, to };
}
__name(rangeParams, "rangeParams");
async function onRequestGet3({ request, env }) {
  if (!env.FINNHUB_API_KEY) {
    return Response.json({ error: "FINNHUB_API_KEY not configured." }, { status: 503 });
  }
  const url = new URL(request.url);
  const type = url.searchParams.get("type") || "quote";
  const ticker = (url.searchParams.get("ticker") || "").toUpperCase();
  const query = url.searchParams.get("query") || "";
  const range = url.searchParams.get("range") || "1M";
  const category = url.searchParams.get("category") || "general";
  const key = env.FINNHUB_API_KEY;
  try {
    let endpoint;
    if (type === "quote") {
      endpoint = `${BASE}/quote?symbol=${ticker}&token=${key}`;
    } else if (type === "candle") {
      const { resolution, from, to } = rangeParams(range);
      endpoint = `${BASE}/stock/candle?symbol=${ticker}&resolution=${resolution}&from=${from}&to=${to}&token=${key}`;
    } else if (type === "profile") {
      endpoint = `${BASE}/stock/profile2?symbol=${ticker}&token=${key}`;
    } else if (type === "search") {
      endpoint = `${BASE}/search?q=${encodeURIComponent(query)}&token=${key}`;
    } else if (type === "recommend") {
      endpoint = `${BASE}/stock/recommendation?symbol=${ticker}&token=${key}`;
    } else if (type === "news") {
      if (ticker) {
        const toTs = Math.floor(Date.now() / 1e3);
        const fromTs = toTs - 7 * 86400;
        const from = new Date(fromTs * 1e3).toISOString().slice(0, 10);
        const to = new Date(toTs * 1e3).toISOString().slice(0, 10);
        endpoint = `${BASE}/company-news?symbol=${ticker}&from=${from}&to=${to}&token=${key}`;
      } else {
        endpoint = `${BASE}/news?category=${category}&minId=0&token=${key}`;
      }
    } else if (type === "earnings") {
      endpoint = `${BASE}/stock/earnings?symbol=${ticker}&limit=4&token=${key}`;
    } else if (type === "sentiment") {
      endpoint = `${BASE}/stock/social-sentiment?symbol=${ticker}&token=${key}`;
    } else if (type === "peers") {
      endpoint = `${BASE}/stock/peers?symbol=${ticker}&token=${key}`;
    } else if (type === "metrics") {
      endpoint = `${BASE}/stock/metric?symbol=${ticker}&metric=all&token=${key}`;
    } else {
      return Response.json({ error: "Unknown type." }, { status: 400 });
    }
    const r = await fetch(endpoint, { headers: { "X-Finnhub-Token": key } });
    if (!r.ok) return Response.json({ error: `Finnhub error ${r.status}` }, { status: 502 });
    const data = await r.json();
    if (data.s === "no_data") return Response.json({ error: "No data available." }, { status: 404 });
    return Response.json(data);
  } catch (err) {
    console.error("[stock]", err.message);
    return Response.json({ error: "Stock data fetch failed." }, { status: 500 });
  }
}
__name(onRequestGet3, "onRequestGet");

// api/alerts.js
var FH_BASE2 = "https://finnhub.io/api/v1";
async function requireUser(request, env) {
  const cookie = request.headers.get("Cookie") || "";
  const token = cookie.match(/cb_session=([^;]+)/)?.[1];
  if (!token) return null;
  return await env.DB.prepare(
    `SELECT u.id, u.username FROM sessions s
     JOIN users u ON u.id = s.user_id
     WHERE s.token = ? AND s.expires_at > datetime('now') LIMIT 1`
  ).bind(token).first();
}
__name(requireUser, "requireUser");
async function getPrice(ticker, apiKey) {
  try {
    const r = await fetch(`${FH_BASE2}/quote?symbol=${ticker}&token=${apiKey}`);
    if (!r.ok) return null;
    const d = await r.json();
    return d.c || null;
  } catch {
    return null;
  }
}
__name(getPrice, "getPrice");
async function onScheduled({ scheduledTime, env, ctx }) {
  if (!env.FINNHUB_API_KEY) return;
  const rows = await env.DB.prepare(
    `SELECT a.*, u.id as uid FROM stock_alerts a
     JOIN users u ON u.id = a.user_id
     WHERE a.triggered = 0`
  ).all();
  const alerts = rows.results || [];
  if (!alerts.length) return;
  const tickers = [...new Set(alerts.map((a) => a.ticker))];
  const prices = {};
  await Promise.allSettled(tickers.map(async (t) => {
    const p = await getPrice(t, env.FINNHUB_API_KEY);
    if (p) prices[t] = p;
  }));
  const batch = [];
  for (const alert of alerts) {
    const price = prices[alert.ticker];
    if (!price) continue;
    const triggered = alert.direction === "above" && price >= alert.threshold || alert.direction === "below" && price <= alert.threshold;
    if (!triggered) continue;
    batch.push(
      env.DB.prepare(`UPDATE stock_alerts SET triggered=1, triggered_at=datetime('now') WHERE id=?`).bind(alert.id),
      env.DB.prepare(
        `INSERT INTO notifications (id, user_id, kind, title, body)
         VALUES (?, ?, 'alert_triggered', ?, ?)`
      ).bind(
        crypto.randomUUID(),
        alert.user_id,
        `${alert.ticker} price alert triggered`,
        `${alert.ticker} is now $${price.toFixed(2)} \u2014 ${alert.direction === "above" ? "above" : "below"} your $${alert.threshold} threshold.`
      )
    );
  }
  if (batch.length) await env.DB.batch(batch);
}
__name(onScheduled, "onScheduled");
async function onRequest({ request, env }) {
  if (env.FEATURE_ALERTS === "false") {
    return Response.json({ ok: true, alerts: [] });
  }
  const user2 = await requireUser(request, env);
  if (!user2) return Response.json({ error: "Unauthorised." }, { status: 401 });
  const url = new URL(request.url);
  const method = request.method;
  const alertId = url.searchParams.get("id");
  const action = url.searchParams.get("action");
  if (method === "GET") {
    const rows = await env.DB.prepare(
      `SELECT * FROM stock_alerts WHERE user_id=? ORDER BY created_at DESC`
    ).bind(user2.id).all();
    return Response.json({ ok: true, alerts: rows.results || [] });
  }
  if (method === "POST" && !action) {
    const body = await request.json().catch(() => ({}));
    const { ticker, direction, threshold } = body;
    if (!ticker?.trim() || !["above", "below"].includes(direction) || !threshold) {
      return Response.json({ error: "ticker, direction (above|below), and threshold required." }, { status: 400 });
    }
    const id = crypto.randomUUID();
    await env.DB.prepare(
      `INSERT INTO stock_alerts (id, user_id, ticker, direction, threshold)
       VALUES (?, ?, ?, ?, ?)`
    ).bind(id, user2.id, ticker.toUpperCase().trim(), direction, threshold).run();
    const row = await env.DB.prepare(`SELECT * FROM stock_alerts WHERE id=?`).bind(id).first();
    return Response.json({ ok: true, alert: row }, { status: 201 });
  }
  if (method === "POST" && action === "cron") {
    await onScheduled({ scheduledTime: Date.now(), env, ctx: {} });
    return Response.json({ ok: true, message: "Alert check complete." });
  }
  if (method === "DELETE" && alertId) {
    await env.DB.prepare(
      `DELETE FROM stock_alerts WHERE id=? AND user_id=?`
    ).bind(alertId, user2.id).run();
    return Response.json({ ok: true });
  }
  return Response.json({ error: "Method not allowed." }, { status: 405 });
}
__name(onRequest, "onRequest");

// api/auth.js
var SESSION_TTL = 60 * 60 * 24 * 7;
async function sha256hex(text) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}
__name(sha256hex, "sha256hex");
function randomToken() {
  const arr = new Uint8Array(32);
  crypto.getRandomValues(arr);
  return Array.from(arr).map((b) => b.toString(16).padStart(2, "0")).join("");
}
__name(randomToken, "randomToken");
function sessionCookie(token, clear = false) {
  const val = clear ? "" : token;
  const maxAge = clear ? 0 : SESSION_TTL;
  return `cb_session=${val}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${maxAge}`;
}
__name(sessionCookie, "sessionCookie");
function getSessionToken(request) {
  const cookie = request.headers.get("cookie") || "";
  const match2 = cookie.match(/cb_session=([a-f0-9]{64})/);
  return match2 ? match2[1] : null;
}
__name(getSessionToken, "getSessionToken");
function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", ...headers }
  });
}
__name(json, "json");
async function onRequest2({ request, env }) {
  const url = new URL(request.url);
  const action = url.searchParams.get("action");
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204 });
  }
  try {
    if (action === "register" && request.method === "POST") return register(request, env);
    if (action === "login" && request.method === "POST") return loginHandler(request, env);
    if (action === "me" && request.method === "GET") return me(request, env);
    if (action === "logout" && request.method === "POST") return logoutHandler(request, env);
    if (action === "profile" && request.method === "POST") return saveProfile(request, env);
    return json({ error: "Not found" }, 404);
  } catch (err) {
    console.error("auth error", err);
    return json({ error: "Internal server error" }, 500);
  }
}
__name(onRequest2, "onRequest");
async function register(request, env) {
  const { username, password, email, profile } = await request.json();
  if (!username || username.length < 3) return json({ error: "Username must be at least 3 characters." }, 400);
  if (!password || password.length < 6) return json({ error: "Password must be at least 6 characters." }, 400);
  if (!email || !email.endsWith("@ibm.com")) return json({ error: "A verified @ibm.com email is required." }, 400);
  const normalEmail = email.trim().toLowerCase();
  const existing = await env.DB.prepare(
    "SELECT id FROM users WHERE LOWER(username) = ?"
  ).bind(username.toLowerCase()).first();
  if (existing) return json({ error: "That username is already taken." }, 409);
  const passwordHash = await sha256hex(password);
  const result = await env.DB.prepare(
    "INSERT INTO users (username, password_hash, email) VALUES (?, ?, ?) RETURNING id"
  ).bind(username.trim(), passwordHash, normalEmail).first();
  const userId = result.id;
  if (profile) {
    await env.DB.prepare(`
      INSERT INTO profiles (user_id, goals, risk, horizon, annual_income, monthly_savings,
        emergency_fund, current_investments, dob, marital_status, employment_status,
        credit_score, us_state, city, veteran_status, preferences)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      userId,
      JSON.stringify(profile.goals ?? []),
      profile.risk ?? "",
      profile.horizon ?? "",
      profile.annualIncome ?? "",
      profile.monthlySavings ?? "",
      profile.emergencyFund ?? "",
      JSON.stringify(profile.currentInvestments ?? []),
      profile.dob ?? "",
      profile.maritalStatus ?? "",
      profile.employmentStatus ?? "",
      profile.creditScore ?? "",
      profile.usState ?? "",
      profile.city ?? "",
      profile.veteranStatus ?? "",
      JSON.stringify(profile.preferences ?? [])
    ).run();
  }
  const token = randomToken();
  await env.DB.prepare(
    'INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, datetime("now", "+7 days"))'
  ).bind(token, userId).run();
  return json({ ok: true, username: username.trim() }, 201, {
    "Set-Cookie": sessionCookie(token)
  });
}
__name(register, "register");
async function loginHandler(request, env) {
  const { username, password } = await request.json();
  if (!username || !password) return json({ error: "Username and password required." }, 400);
  const user2 = await env.DB.prepare(
    "SELECT id, username, password_hash FROM users WHERE LOWER(username) = ?"
  ).bind(username.toLowerCase()).first();
  if (!user2) return json({ error: "No account found with that username." }, 401);
  const hash = await sha256hex(password);
  if (hash !== user2.password_hash) return json({ error: "Incorrect password." }, 401);
  const profileRow = await env.DB.prepare(
    "SELECT * FROM profiles WHERE user_id = ?"
  ).bind(user2.id).first();
  const profile = profileRow ? {
    goals: JSON.parse(profileRow.goals || "[]"),
    risk: profileRow.risk,
    horizon: profileRow.horizon,
    annualIncome: profileRow.annual_income,
    monthlySavings: profileRow.monthly_savings,
    emergencyFund: profileRow.emergency_fund,
    currentInvestments: JSON.parse(profileRow.current_investments || "[]"),
    dob: profileRow.dob,
    maritalStatus: profileRow.marital_status,
    employmentStatus: profileRow.employment_status,
    creditScore: profileRow.credit_score,
    usState: profileRow.us_state,
    city: profileRow.city,
    veteranStatus: profileRow.veteran_status,
    preferences: JSON.parse(profileRow.preferences || "[]")
  } : null;
  const token = randomToken();
  await env.DB.prepare(
    'INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, datetime("now", "+7 days"))'
  ).bind(token, user2.id).run();
  return json({ ok: true, username: user2.username, profile }, 200, {
    "Set-Cookie": sessionCookie(token)
  });
}
__name(loginHandler, "loginHandler");
async function me(request, env) {
  const token = getSessionToken(request);
  if (!token) return json({ ok: false }, 401);
  const session = await env.DB.prepare(`
    SELECT users.id, users.username
    FROM sessions
    JOIN users ON users.id = sessions.user_id
    WHERE sessions.token = ? AND sessions.expires_at > datetime('now')
  `).bind(token).first();
  if (!session) return json({ ok: false }, 401);
  const profileRow = await env.DB.prepare(
    "SELECT * FROM profiles WHERE user_id = ?"
  ).bind(session.id).first();
  const profile = profileRow ? {
    goals: JSON.parse(profileRow.goals || "[]"),
    risk: profileRow.risk,
    horizon: profileRow.horizon,
    annualIncome: profileRow.annual_income,
    monthlySavings: profileRow.monthly_savings,
    emergencyFund: profileRow.emergency_fund,
    currentInvestments: JSON.parse(profileRow.current_investments || "[]"),
    dob: profileRow.dob,
    maritalStatus: profileRow.marital_status,
    employmentStatus: profileRow.employment_status,
    creditScore: profileRow.credit_score,
    usState: profileRow.us_state,
    city: profileRow.city,
    veteranStatus: profileRow.veteran_status,
    preferences: JSON.parse(profileRow.preferences || "[]")
  } : null;
  return json({ ok: true, username: session.username, profile });
}
__name(me, "me");
async function logoutHandler(request, env) {
  const token = getSessionToken(request);
  if (token) {
    await env.DB.prepare("DELETE FROM sessions WHERE token = ?").bind(token).run();
  }
  return json({ ok: true }, 200, { "Set-Cookie": sessionCookie("", true) });
}
__name(logoutHandler, "logoutHandler");
async function saveProfile(request, env) {
  const token = getSessionToken(request);
  if (!token) return json({ error: "Unauthorised" }, 401);
  const session = await env.DB.prepare(`
    SELECT users.id FROM sessions
    JOIN users ON users.id = sessions.user_id
    WHERE sessions.token = ? AND sessions.expires_at > datetime('now')
  `).bind(token).first();
  if (!session) return json({ error: "Session expired" }, 401);
  const p = await request.json();
  await env.DB.prepare(`
    INSERT INTO profiles (user_id, goals, risk, horizon, annual_income, monthly_savings,
      emergency_fund, current_investments, dob, marital_status, employment_status,
      credit_score, us_state, city, veteran_status, preferences, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
    ON CONFLICT(user_id) DO UPDATE SET
      goals=excluded.goals, risk=excluded.risk, horizon=excluded.horizon,
      annual_income=excluded.annual_income, monthly_savings=excluded.monthly_savings,
      emergency_fund=excluded.emergency_fund, current_investments=excluded.current_investments,
      dob=excluded.dob, marital_status=excluded.marital_status,
      employment_status=excluded.employment_status, credit_score=excluded.credit_score,
      us_state=excluded.us_state, city=excluded.city,
      veteran_status=excluded.veteran_status, preferences=excluded.preferences,
      updated_at=datetime('now')
  `).bind(
    session.id,
    JSON.stringify(p.goals ?? []),
    p.risk ?? "",
    p.horizon ?? "",
    p.annualIncome ?? "",
    p.monthlySavings ?? "",
    p.emergencyFund ?? "",
    JSON.stringify(p.currentInvestments ?? []),
    p.dob ?? "",
    p.maritalStatus ?? "",
    p.employmentStatus ?? "",
    p.creditScore ?? "",
    p.usState ?? "",
    p.city ?? "",
    p.veteranStatus ?? "",
    JSON.stringify(p.preferences ?? [])
  ).run();
  return json({ ok: true });
}
__name(saveProfile, "saveProfile");

// api/budget.js
async function requireUser2(request, env) {
  const cookie = request.headers.get("Cookie") || "";
  const token = cookie.match(/cb_session=([^;]+)/)?.[1];
  if (!token) return null;
  return await env.DB.prepare(
    `SELECT u.id, u.username FROM sessions s
     JOIN users u ON u.id = s.user_id
     WHERE s.token = ? AND s.expires_at > datetime('now') LIMIT 1`
  ).bind(token).first();
}
__name(requireUser2, "requireUser");
async function onRequest3({ request, env }) {
  const user2 = await requireUser2(request, env);
  if (!user2) return Response.json({ error: "Unauthorised." }, { status: 401 });
  const url = new URL(request.url);
  const method = request.method;
  if (method === "GET") {
    const month = url.searchParams.get("month") || (/* @__PURE__ */ new Date()).toISOString().slice(0, 7);
    const planRows = await env.DB.prepare(
      `SELECT category, planned FROM budget_plans WHERE user_id=? AND month=?`
    ).bind(user2.id, month).all();
    const plans = {};
    for (const row of planRows.results || []) {
      plans[row.category] = row.planned;
    }
    return Response.json({ ok: true, month, plans });
  }
  if (method === "POST") {
    const body = await request.json().catch(() => ({}));
    const { category, planned, month } = body;
    if (!category?.trim() || planned == null || !month?.match(/^\d{4}-\d{2}$/)) {
      return Response.json({ error: "category, planned, and month (YYYY-MM) required." }, { status: 400 });
    }
    await env.DB.prepare(
      `INSERT INTO budget_plans (user_id, category, planned, month)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(user_id, category, month) DO UPDATE SET planned=excluded.planned`
    ).bind(user2.id, category.trim(), planned, month).run();
    return Response.json({ ok: true });
  }
  if (method === "DELETE") {
    const category = url.searchParams.get("category");
    const month = url.searchParams.get("month");
    if (!category || !month) return Response.json({ error: "category and month required." }, { status: 400 });
    await env.DB.prepare(
      `DELETE FROM budget_plans WHERE user_id=? AND category=? AND month=?`
    ).bind(user2.id, category, month).run();
    return Response.json({ ok: true });
  }
  return Response.json({ error: "Method not allowed." }, { status: 405 });
}
__name(onRequest3, "onRequest");

// api/chats.js
function json2(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" }
  });
}
__name(json2, "json");
function getSessionToken2(request) {
  const cookie = request.headers.get("cookie") || "";
  const match2 = cookie.match(/cb_session=([a-f0-9]{64})/);
  return match2 ? match2[1] : null;
}
__name(getSessionToken2, "getSessionToken");
async function getUser(request, env) {
  const token = getSessionToken2(request);
  if (!token) return null;
  return env.DB.prepare(`
    SELECT users.id, users.username
    FROM sessions
    JOIN users ON users.id = sessions.user_id
    WHERE sessions.token = ? AND sessions.expires_at > datetime('now')
  `).bind(token).first();
}
__name(getUser, "getUser");
async function onRequest4({ request, env }) {
  if (request.method === "OPTIONS") return new Response(null, { status: 204 });
  const url = new URL(request.url);
  const action = url.searchParams.get("action");
  try {
    const user2 = await getUser(request, env);
    if (!user2) return json2({ error: "Unauthorised" }, 401);
    if (action === "list" && request.method === "GET") {
      const { results } = await env.DB.prepare(`
        SELECT id, title, pinned, created_at
        FROM chat_sessions
        WHERE user_id = ?
        ORDER BY pinned DESC, created_at DESC
        LIMIT 100
      `).bind(user2.id).all();
      return json2({ ok: true, sessions: results ?? [] });
    }
    if (action === "messages" && request.method === "GET") {
      const sessionId = url.searchParams.get("session_id");
      if (!sessionId) return json2({ error: "session_id required" }, 400);
      const sess = await env.DB.prepare(
        "SELECT id FROM chat_sessions WHERE id = ? AND user_id = ?"
      ).bind(sessionId, user2.id).first();
      if (!sess) return json2({ error: "Not found" }, 404);
      const { results } = await env.DB.prepare(`
        SELECT sender, content, created_at
        FROM chat_messages
        WHERE session_id = ?
        ORDER BY created_at ASC, id ASC
      `).bind(sessionId).all();
      return json2({ ok: true, messages: results ?? [] });
    }
    if (action === "upsert_session" && request.method === "POST") {
      const { id, title, pinned } = await request.json();
      if (!id) return json2({ error: "id required" }, 400);
      await env.DB.prepare(`
        INSERT INTO chat_sessions (id, user_id, title, pinned)
        VALUES (?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          title  = CASE WHEN excluded.user_id = user_id THEN excluded.title  ELSE title  END,
          pinned = CASE WHEN excluded.user_id = user_id THEN excluded.pinned ELSE pinned END
      `).bind(id, user2.id, title ?? "New chat", pinned ? 1 : 0).run();
      return json2({ ok: true });
    }
    if (action === "save_message" && request.method === "POST") {
      const { session_id, sender, content } = await request.json();
      if (!session_id || !sender || content === void 0) {
        return json2({ error: "session_id, sender and content required" }, 400);
      }
      await env.DB.prepare(`
        INSERT INTO chat_sessions (id, user_id, title, pinned)
        VALUES (?, ?, 'New chat', 0)
        ON CONFLICT(id) DO NOTHING
      `).bind(session_id, user2.id).run();
      await env.DB.prepare(
        "INSERT INTO chat_messages (session_id, sender, content) VALUES (?, ?, ?)"
      ).bind(session_id, sender, content).run();
      return json2({ ok: true });
    }
    if (action === "delete_session" && request.method === "POST") {
      const { session_id } = await request.json();
      if (!session_id) return json2({ error: "session_id required" }, 400);
      await env.DB.prepare(
        "DELETE FROM chat_sessions WHERE id = ? AND user_id = ?"
      ).bind(session_id, user2.id).run();
      return json2({ ok: true });
    }
    return json2({ error: "Not found" }, 404);
  } catch (err) {
    console.error("chats error", err);
    return json2({ error: "Internal server error" }, 500);
  }
}
__name(onRequest4, "onRequest");

// api/coinbase.js
var CB_API = "https://api.coinbase.com/v2";
var CB_AUTH = "https://login.coinbase.com/oauth2/auth";
var CB_TOKEN = "https://login.coinbase.com/oauth2/token";
var CB_SCOPES = "wallet:accounts:read,wallet:transactions:read";
async function requireUser3(request, env) {
  const cookie = request.headers.get("Cookie") || "";
  const token = cookie.match(/cb_session=([^;]+)/)?.[1];
  if (!token) return null;
  const row = await env.DB.prepare(
    `SELECT u.id, u.username FROM sessions s
     JOIN users u ON u.id = s.user_id
     WHERE s.token = ? AND s.expires_at > datetime('now') LIMIT 1`
  ).bind(token).first();
  return row || null;
}
__name(requireUser3, "requireUser");
function redirectUrl(request) {
  const u = new URL(request.url);
  return `${u.origin}/api/coinbase?action=callback`;
}
__name(redirectUrl, "redirectUrl");
async function onRequest5({ request, env }) {
  if (!env.COINBASE_CLIENT_ID || !env.COINBASE_CLIENT_SECRET) {
    return Response.json({ error: "Coinbase not configured." }, { status: 503 });
  }
  const url = new URL(request.url);
  const action = url.searchParams.get("action");
  if (action === "connect") {
    const user3 = await requireUser3(request, env);
    if (!user3) return Response.json({ error: "Unauthorised." }, { status: 401 });
    const state = crypto.randomUUID();
    const encoded = btoa(JSON.stringify({ userId: user3.id, state }));
    const params = new URLSearchParams({
      response_type: "code",
      client_id: env.COINBASE_CLIENT_ID,
      redirect_uri: redirectUrl(request),
      scope: CB_SCOPES,
      state: encoded
    });
    return Response.redirect(`${CB_AUTH}?${params}`, 302);
  }
  if (action === "callback") {
    const code = url.searchParams.get("code");
    const state = url.searchParams.get("state");
    let userId;
    try {
      userId = JSON.parse(atob(state)).userId;
    } catch {
      return Response.redirect("/?coinbase=error", 302);
    }
    const tokenRes = await fetch(CB_TOKEN, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code,
        client_id: env.COINBASE_CLIENT_ID,
        client_secret: env.COINBASE_CLIENT_SECRET,
        redirect_uri: redirectUrl(request)
      })
    });
    const tokens = await tokenRes.json().catch(() => ({}));
    if (!tokenRes.ok || !tokens.access_token) {
      return Response.redirect("/?coinbase=error", 302);
    }
    const expiresAt = new Date(Date.now() + tokens.expires_in * 1e3).toISOString();
    await env.DB.prepare(
      `INSERT INTO coinbase_tokens (user_id, access_token, refresh_token, expires_at, connected_at)
       VALUES (?, ?, ?, ?, datetime('now'))
       ON CONFLICT(user_id) DO UPDATE SET
         access_token=excluded.access_token,
         refresh_token=excluded.refresh_token,
         expires_at=excluded.expires_at,
         connected_at=excluded.connected_at`
    ).bind(userId, tokens.access_token, tokens.refresh_token || "", expiresAt).run();
    return Response.redirect("/?coinbase=connected", 302);
  }
  const user2 = await requireUser3(request, env);
  if (!user2) return Response.json({ error: "Unauthorised." }, { status: 401 });
  if (action === "status") {
    const row = await env.DB.prepare(
      "SELECT connected_at FROM coinbase_tokens WHERE user_id = ? LIMIT 1"
    ).bind(user2.id).first();
    return Response.json({ ok: true, connected: !!row, connected_at: row?.connected_at || null });
  }
  if (action === "disconnect" && request.method === "POST") {
    const row = await env.DB.prepare(
      "SELECT access_token FROM coinbase_tokens WHERE user_id = ? LIMIT 1"
    ).bind(user2.id).first();
    if (row) {
      await fetch(`${CB_API}/auth/revoke`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ token: row.access_token })
      }).catch(() => {
      });
      await env.DB.prepare("DELETE FROM coinbase_tokens WHERE user_id = ?").bind(user2.id).run();
    }
    return Response.json({ ok: true });
  }
  return Response.json({ error: "Unknown action." }, { status: 400 });
}
__name(onRequest5, "onRequest");

// api/goals.js
async function requireUser4(request, env) {
  const cookie = request.headers.get("Cookie") || "";
  const token = cookie.match(/cb_session=([^;]+)/)?.[1];
  if (!token) return null;
  return await env.DB.prepare(
    `SELECT u.id, u.username FROM sessions s
     JOIN users u ON u.id = s.user_id
     WHERE s.token = ? AND s.expires_at > datetime('now') LIMIT 1`
  ).bind(token).first();
}
__name(requireUser4, "requireUser");
function computeGoal(goal) {
  const remaining = goal.target_amount - goal.current_amount;
  const pct = goal.target_amount > 0 ? Math.min(100, Math.round(goal.current_amount / goal.target_amount * 100)) : 0;
  let estimated_months = null;
  let estimated_date = null;
  if (goal.monthly_contribution > 0 && remaining > 0) {
    estimated_months = Math.ceil(remaining / goal.monthly_contribution);
    const d = /* @__PURE__ */ new Date();
    d.setMonth(d.getMonth() + estimated_months);
    estimated_date = d.toISOString().slice(0, 7);
  } else if (remaining <= 0) {
    estimated_date = "Completed";
  }
  return {
    ...goal,
    pct,
    remaining: Math.max(0, remaining),
    estimated_months,
    estimated_date
  };
}
__name(computeGoal, "computeGoal");
async function onRequest6({ request, env }) {
  const user2 = await requireUser4(request, env);
  if (!user2) return Response.json({ error: "Unauthorised." }, { status: 401 });
  const url = new URL(request.url);
  const method = request.method;
  const goalId = url.searchParams.get("id");
  if (method === "GET") {
    const rows = await env.DB.prepare(
      `SELECT * FROM goals WHERE user_id = ? ORDER BY created_at ASC`
    ).bind(user2.id).all();
    const goals = (rows.results || []).map(computeGoal);
    return Response.json({ ok: true, goals });
  }
  if (method === "POST") {
    const body = await request.json().catch(() => ({}));
    const { name, target_amount, current_amount = 0, monthly_contribution = 0, target_date = null, category = "general" } = body;
    if (!name?.trim() || !target_amount || target_amount <= 0) {
      return Response.json({ error: "name and target_amount are required." }, { status: 400 });
    }
    const id = crypto.randomUUID();
    await env.DB.prepare(
      `INSERT INTO goals (id, user_id, name, target_amount, current_amount, monthly_contribution, target_date, category)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(id, user2.id, name.trim(), target_amount, current_amount, monthly_contribution, target_date, category).run();
    await env.DB.batch([
      env.DB.prepare(`INSERT INTO goal_milestones (goal_id, pct) VALUES (?, 25)`).bind(id),
      env.DB.prepare(`INSERT INTO goal_milestones (goal_id, pct) VALUES (?, 50)`).bind(id),
      env.DB.prepare(`INSERT INTO goal_milestones (goal_id, pct) VALUES (?, 75)`).bind(id),
      env.DB.prepare(`INSERT INTO goal_milestones (goal_id, pct) VALUES (?, 100)`).bind(id)
    ]);
    const row = await env.DB.prepare(`SELECT * FROM goals WHERE id = ?`).bind(id).first();
    return Response.json({ ok: true, goal: computeGoal(row) }, { status: 201 });
  }
  if (method === "PUT" && goalId) {
    const body = await request.json().catch(() => ({}));
    const { name, target_amount, current_amount, monthly_contribution, target_date, category } = body;
    const existing = await env.DB.prepare(
      `SELECT * FROM goals WHERE id = ? AND user_id = ?`
    ).bind(goalId, user2.id).first();
    if (!existing) return Response.json({ error: "Goal not found." }, { status: 404 });
    const updated = {
      name: name ?? existing.name,
      target_amount: target_amount ?? existing.target_amount,
      current_amount: current_amount ?? existing.current_amount,
      monthly_contribution: monthly_contribution ?? existing.monthly_contribution,
      target_date: target_date !== void 0 ? target_date : existing.target_date,
      category: category ?? existing.category
    };
    await env.DB.prepare(
      `UPDATE goals SET name=?, target_amount=?, current_amount=?, monthly_contribution=?,
       target_date=?, category=?, updated_at=datetime('now') WHERE id=? AND user_id=?`
    ).bind(
      updated.name,
      updated.target_amount,
      updated.current_amount,
      updated.monthly_contribution,
      updated.target_date,
      updated.category,
      goalId,
      user2.id
    ).run();
    const prevPct = existing.target_amount > 0 ? Math.round(existing.current_amount / existing.target_amount * 100) : 0;
    const newPct = updated.target_amount > 0 ? Math.round(updated.current_amount / updated.target_amount * 100) : 0;
    if (newPct > prevPct) {
      const milestones = await env.DB.prepare(
        `SELECT * FROM goal_milestones WHERE goal_id = ? AND reached_at IS NULL AND pct <= ?`
      ).bind(goalId, newPct).all();
      for (const m of milestones.results || []) {
        await env.DB.prepare(
          `UPDATE goal_milestones SET reached_at=datetime('now') WHERE id=?`
        ).bind(m.id).run();
        await env.DB.prepare(
          `INSERT INTO notifications (id, user_id, kind, title, body)
           VALUES (?, ?, 'goal_milestone', ?, ?)`
        ).bind(
          crypto.randomUUID(),
          user2.id,
          `Goal milestone reached!`,
          `"${updated.name}" is ${m.pct}% funded \u2014 great progress!`
        ).run();
      }
    }
    const row = await env.DB.prepare(`SELECT * FROM goals WHERE id = ?`).bind(goalId).first();
    return Response.json({ ok: true, goal: computeGoal(row) });
  }
  if (method === "DELETE" && goalId) {
    const result = await env.DB.prepare(
      `DELETE FROM goals WHERE id = ? AND user_id = ?`
    ).bind(goalId, user2.id).run();
    if (!result.meta?.changes) return Response.json({ error: "Goal not found." }, { status: 404 });
    return Response.json({ ok: true });
  }
  return Response.json({ error: "Method not allowed." }, { status: 405 });
}
__name(onRequest6, "onRequest");

// api/notifications.js
async function requireUser5(request, env) {
  const cookie = request.headers.get("Cookie") || "";
  const token = cookie.match(/cb_session=([^;]+)/)?.[1];
  if (!token) return null;
  return await env.DB.prepare(
    `SELECT u.id, u.username FROM sessions s
     JOIN users u ON u.id = s.user_id
     WHERE s.token = ? AND s.expires_at > datetime('now') LIMIT 1`
  ).bind(token).first();
}
__name(requireUser5, "requireUser");
async function insertNotification(env, userId, kind, title, body) {
  await env.DB.prepare(
    `INSERT OR IGNORE INTO notifications (id, user_id, kind, title, body)
     VALUES (?, ?, ?, ?, ?)`
  ).bind(crypto.randomUUID(), userId, kind, title, body).run();
}
__name(insertNotification, "insertNotification");
async function onRequest7({ request, env }) {
  if (env.FEATURE_NOTIFICATIONS === "false") {
    return Response.json({ ok: true, notifications: [], unread: 0 });
  }
  const user2 = await requireUser5(request, env);
  if (!user2) return Response.json({ error: "Unauthorised." }, { status: 401 });
  const url = new URL(request.url);
  const method = request.method;
  const action = url.searchParams.get("action");
  const notifId = url.searchParams.get("id");
  if (method === "GET") {
    const rows = await env.DB.prepare(
      `SELECT * FROM notifications WHERE user_id=? ORDER BY read ASC, created_at DESC LIMIT 50`
    ).bind(user2.id).all();
    const notifications = rows.results || [];
    const unread = notifications.filter((n) => !n.read).length;
    return Response.json({ ok: true, notifications, unread });
  }
  if (method === "POST" && action === "read") {
    const body = await request.json().catch(() => ({}));
    const ids = body.ids || [];
    if (ids.length > 0) {
      const placeholders = ids.map(() => "?").join(",");
      await env.DB.prepare(
        `UPDATE notifications SET read=1 WHERE user_id=? AND id IN (${placeholders})`
      ).bind(user2.id, ...ids).run();
    } else {
      await env.DB.prepare(
        `UPDATE notifications SET read=1 WHERE user_id=?`
      ).bind(user2.id).run();
    }
    return Response.json({ ok: true });
  }
  if (method === "POST" && action === "check") {
    const body = await request.json().catch(() => ({}));
    if (typeof body.cryptoPct === "number" && body.cryptoPct > 15) {
      const existing = await env.DB.prepare(
        `SELECT id FROM notifications WHERE user_id=? AND kind='crypto_exposure'
         AND created_at > datetime('now','-1 day') LIMIT 1`
      ).bind(user2.id).first();
      if (!existing) {
        await insertNotification(
          env,
          user2.id,
          "crypto_exposure",
          "High crypto exposure",
          `Your crypto holdings are ${body.cryptoPct.toFixed(1)}% of your portfolio \u2014 above the 15% threshold. Consider rebalancing.`
        );
      }
    }
    if (Array.isArray(body.unusualTransactions) && body.unusualTransactions.length > 0) {
      const existing = await env.DB.prepare(
        `SELECT id FROM notifications WHERE user_id=? AND kind='unusual_spend'
         AND created_at > datetime('now','-6 hours') LIMIT 1`
      ).bind(user2.id).first();
      if (!existing) {
        const tx = body.unusualTransactions[0];
        await insertNotification(
          env,
          user2.id,
          "unusual_spend",
          "Unusual transaction detected",
          `"${tx.desc}" (${tx.flagReason}) \u2014 $${Math.abs(tx.amount).toFixed(2)}`
        );
      }
    }
    if (typeof body.healthScore === "number" && body.healthScore < 40) {
      const existing = await env.DB.prepare(
        `SELECT id FROM notifications WHERE user_id=? AND kind='portfolio_drift'
         AND created_at > datetime('now','-7 days') LIMIT 1`
      ).bind(user2.id).first();
      if (!existing) {
        await insertNotification(
          env,
          user2.id,
          "portfolio_drift",
          "Portfolio needs attention",
          `Your portfolio health score is ${body.healthScore}/100. Review your allocation in the Portfolio tab.`
        );
      }
    }
    const rows = await env.DB.prepare(
      `SELECT * FROM notifications WHERE user_id=? ORDER BY read ASC, created_at DESC LIMIT 50`
    ).bind(user2.id).all();
    const notifications = rows.results || [];
    const unread = notifications.filter((n) => !n.read).length;
    return Response.json({ ok: true, notifications, unread });
  }
  if (method === "DELETE" && notifId) {
    await env.DB.prepare(
      `DELETE FROM notifications WHERE id=? AND user_id=?`
    ).bind(notifId, user2.id).run();
    return Response.json({ ok: true });
  }
  return Response.json({ error: "Method not allowed." }, { status: 405 });
}
__name(onRequest7, "onRequest");

// api/plaid.js
var PLAID_BASE = /* @__PURE__ */ __name((env) => `https://${env.PLAID_ENV || "sandbox"}.plaid.com`, "PLAID_BASE");
async function plaidPost(env, path, body) {
  const res = await fetch(`${PLAID_BASE(env)}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: env.PLAID_CLIENT_ID,
      secret: env.PLAID_SECRET,
      ...body
    })
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error_message || `Plaid ${path} failed`);
  return data;
}
__name(plaidPost, "plaidPost");
async function requireUser6(request, env) {
  const cookie = request.headers.get("Cookie") || "";
  const token = cookie.match(/cb_session=([^;]+)/)?.[1];
  if (!token) return null;
  const row = await env.DB.prepare(
    `SELECT u.id, u.username FROM sessions s
     JOIN users u ON u.id = s.user_id
     WHERE s.token = ? AND s.expires_at > datetime('now') LIMIT 1`
  ).bind(token).first();
  return row || null;
}
__name(requireUser6, "requireUser");
async function onRequest8({ request, env }) {
  if (!env.PLAID_CLIENT_ID || !env.PLAID_SECRET) {
    return Response.json({ error: "Plaid not configured." }, { status: 503 });
  }
  const user2 = await requireUser6(request, env);
  if (!user2) {
    return Response.json({ error: "Unauthorised." }, { status: 401 });
  }
  const url = new URL(request.url);
  const action = url.searchParams.get("action");
  if (action === "link_token" && request.method === "POST") {
    const data = await plaidPost(env, "/link/token/create", {
      user: { client_user_id: String(user2.id) },
      client_name: "Candyland Bank",
      products: ["transactions"],
      country_codes: ["US"],
      language: "en"
    }).catch((e) => ({ error: e.message }));
    if (data.error) return Response.json({ error: data.error }, { status: 502 });
    return Response.json({ ok: true, link_token: data.link_token });
  }
  if (action === "exchange" && request.method === "POST") {
    const { public_token } = await request.json().catch(() => ({}));
    if (!public_token) return Response.json({ error: "public_token required." }, { status: 400 });
    const data = await plaidPost(env, "/item/public_token/exchange", { public_token }).catch((e) => ({ error: e.message }));
    if (data.error) return Response.json({ error: data.error }, { status: 502 });
    let institution = "";
    try {
      const item = await plaidPost(env, "/item/get", { access_token: data.access_token });
      const inst = await plaidPost(env, "/institutions/get_by_id", {
        institution_id: item.item.institution_id,
        country_codes: ["US"]
      });
      institution = inst.institution?.name || "";
    } catch {
    }
    await env.DB.prepare(
      `INSERT INTO plaid_tokens (user_id, access_token, item_id, institution, connected_at)
       VALUES (?, ?, ?, ?, datetime('now'))
       ON CONFLICT(user_id) DO UPDATE SET
         access_token=excluded.access_token,
         item_id=excluded.item_id,
         institution=excluded.institution,
         connected_at=excluded.connected_at`
    ).bind(user2.id, data.access_token, data.item_id, institution).run();
    return Response.json({ ok: true, institution });
  }
  if (action === "status" && request.method === "GET") {
    const row = await env.DB.prepare(
      "SELECT institution, connected_at FROM plaid_tokens WHERE user_id = ? LIMIT 1"
    ).bind(user2.id).first();
    return Response.json({ ok: true, connected: !!row, institution: row?.institution || "", connected_at: row?.connected_at || null });
  }
  if (action === "disconnect" && request.method === "POST") {
    const row = await env.DB.prepare(
      "SELECT access_token FROM plaid_tokens WHERE user_id = ? LIMIT 1"
    ).bind(user2.id).first();
    if (row) {
      await plaidPost(env, "/item/remove", { access_token: row.access_token }).catch(() => {
      });
      await env.DB.prepare("DELETE FROM plaid_tokens WHERE user_id = ?").bind(user2.id).run();
    }
    return Response.json({ ok: true });
  }
  return Response.json({ error: "Unknown action." }, { status: 400 });
}
__name(onRequest8, "onRequest");

// api/txncategory.js
async function requireUser7(request, env) {
  const cookie = request.headers.get("Cookie") || "";
  const token = cookie.match(/cb_session=([^;]+)/)?.[1];
  if (!token) return null;
  return await env.DB.prepare(
    `SELECT u.id, u.username FROM sessions s
     JOIN users u ON u.id = s.user_id
     WHERE s.token = ? AND s.expires_at > datetime('now') LIMIT 1`
  ).bind(token).first();
}
__name(requireUser7, "requireUser");
async function onRequest9({ request, env }) {
  const user2 = await requireUser7(request, env);
  if (!user2) return Response.json({ error: "Unauthorised." }, { status: 401 });
  const url = new URL(request.url);
  const method = request.method;
  if (method === "GET") {
    const rows = await env.DB.prepare(
      `SELECT txn_id, category, recurring FROM txn_category_overrides WHERE user_id=?`
    ).bind(user2.id).all();
    const overrides = {};
    for (const r of rows.results || []) {
      overrides[r.txn_id] = { category: r.category, recurring: !!r.recurring };
    }
    return Response.json({ ok: true, overrides });
  }
  if (method === "POST") {
    const body = await request.json().catch(() => ({}));
    const { txn_id, category, recurring = false } = body;
    if (!txn_id?.trim() || !category?.trim()) {
      return Response.json({ error: "txn_id and category required." }, { status: 400 });
    }
    await env.DB.prepare(
      `INSERT INTO txn_category_overrides (user_id, txn_id, category, recurring)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(user_id, txn_id) DO UPDATE SET category=excluded.category, recurring=excluded.recurring, updated_at=datetime('now')`
    ).bind(user2.id, txn_id.trim(), category.trim(), recurring ? 1 : 0).run();
    return Response.json({ ok: true });
  }
  if (method === "DELETE") {
    const txnId = url.searchParams.get("txn_id");
    if (!txnId) return Response.json({ error: "txn_id required." }, { status: 400 });
    await env.DB.prepare(
      `DELETE FROM txn_category_overrides WHERE user_id=? AND txn_id=?`
    ).bind(user2.id, txnId).run();
    return Response.json({ ok: true });
  }
  return Response.json({ error: "Method not allowed." }, { status: 405 });
}
__name(onRequest9, "onRequest");

// chat.js
var WXO_INSTANCE_URL = "https://api.dl.watson-orchestrate.ibm.com/instances/20260716-1822-4087-90fe-3b3ba1d4cc84";
var WXO_AGENT_ID = "a9e0ab50-e784-458e-b631-0946779be803";
var MCSP_TOKEN_URL = "https://iam.platform.saas.ibm.com/siusermgr/api/1.0/apikeys/token";
var COMPLETIONS_URL = `${WXO_INSTANCE_URL}/v1/orchestrate/${WXO_AGENT_ID}/chat/completions`;
async function getMCSPToken(apiKey) {
  const res = await fetch(MCSP_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ apikey: apiKey })
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`MCSP token exchange failed (${res.status}): ${text.slice(0, 200)}`);
  }
  const data = await res.json();
  const token = data.token ?? data.access_token;
  if (!token) throw new Error("MCSP token response contained no token field");
  return token;
}
__name(getMCSPToken, "getMCSPToken");
function buildProfileContext(profile) {
  if (!profile || Object.keys(profile).length === 0) return null;
  const goalMap = {
    retirement: "Retirement planning",
    home: "Home purchase",
    education: "Education funding",
    wealth: "Wealth growth",
    short_term: "Short-term savings",
    long_term: "Long-term investing"
  };
  const goals = (profile.goals ?? []).map((g) => goalMap[g] || g).join(", ") || "Not specified";
  const investments = (profile.currentInvestments ?? []).join(", ") || "None listed";
  return [
    "[User financial profile for context]",
    `Goals: ${goals}`,
    `Risk tolerance: ${profile.risk || "Not specified"}`,
    `Time horizon: ${profile.horizon || "Not specified"}`,
    profile.annualIncome ? `Annual income: $${Number(profile.annualIncome).toLocaleString()}` : null,
    profile.monthlySavings ? `Monthly savings: $${Number(profile.monthlySavings).toLocaleString()}` : null,
    profile.emergencyFund ? `Emergency fund: ${profile.emergencyFund}` : null,
    investments !== "None listed" ? `Current investments: ${investments}` : null,
    profile.employmentStatus ? `Employment: ${profile.employmentStatus}` : null,
    profile.creditScore ? `Credit score band: ${profile.creditScore}` : null
  ].filter(Boolean).join("\n");
}
__name(buildProfileContext, "buildProfileContext");
async function onRequestPost({ request, env }) {
  const apiKey = env.WXO_API_KEY;
  if (!apiKey) {
    return Response.json({
      reply: "Gumdrop is not configured \u2014 missing WXO_API_KEY secret. Add it in Cloudflare Pages \u2192 Settings \u2192 Environment variables."
    });
  }
  const { messages = [], profile = {}, userMessage = "" } = await request.json().catch(() => ({}));
  if (!userMessage.trim()) {
    return Response.json({ reply: "Please send a message." });
  }
  const profileCtx = buildProfileContext(profile);
  const BUDGET_PLAN_PHRASES = [
    "budget plan",
    "spending plan",
    "monthly budget",
    "monthly plan",
    "budget breakdown",
    "budget allocation",
    "create a budget",
    "make a budget",
    "build a budget",
    "give me a budget",
    "suggest a budget"
  ];
  const lowerMsg = userMessage.toLowerCase();
  const isBudgetRequest = BUDGET_PLAN_PHRASES.some((p) => lowerMsg.includes(p));
  const budgetFormatHint = isBudgetRequest ? '\n\n[Chart rendering hint: please include a clearly labelled breakdown section with one "Category: $amount" line per spending category so the pie chart can be generated automatically.]' : "";
  const userContent = profileCtx ? `${profileCtx}

${userMessage}${budgetFormatHint}` : `${userMessage}${budgetFormatHint}`;
  const fullMessages = [
    // Include recent history (skip pending/system, last 10 turns)
    ...messages.filter((m) => m.sender !== "system" && !m.pending).slice(-10).map((m) => ({
      role: m.sender === "user" ? "user" : "assistant",
      content: m.text
    })),
    { role: "user", content: userContent }
  ];
  try {
    const token = await getMCSPToken(apiKey);
    const woRes = await fetch(COMPLETIONS_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token}`
      },
      body: JSON.stringify({ messages: fullMessages, stream: false })
    });
    if (!woRes.ok) {
      const errText = await woRes.text().catch(() => "");
      console.error(`[chat] Orchestrate error ${woRes.status}:`, errText.slice(0, 400));
      if (woRes.status === 401 || woRes.status === 403) {
        return Response.json({
          reply: "Authentication failed \u2014 check that WXO_API_KEY is correct and not expired."
        });
      }
      if (woRes.status === 404) {
        return Response.json({
          reply: `Agent not found (404). Verify agent ID ${WXO_AGENT_ID} is published in your Orchestrate instance.`
        });
      }
      return Response.json({
        reply: `Orchestrate returned an error (${woRes.status}). Check Cloudflare logs.`
      });
    }
    const data = await woRes.json();
    const reply = data.choices?.[0]?.message?.content?.trim() ?? data.reply ?? "I received a response but could not parse it. Please try again.";
    return Response.json({ reply });
  } catch (err) {
    console.error("[chat] error:", err.message);
    return Response.json({
      reply: `Error reaching Orchestrate: ${err.message.slice(0, 120)}`
    });
  }
}
__name(onRequestPost, "onRequestPost");

// debug.js
async function onRequestGet4({ env }) {
  return Response.json({
    RESEND_API_KEY: !!env.RESEND_API_KEY,
    RESEND_FROM: env.RESEND_FROM || "(not set)",
    ALLOWED_EMAIL_DOMAIN: env.ALLOWED_EMAIL_DOMAIN || "(not set)",
    OTP_STORE_bound: !!env.OTP_STORE,
    DB_bound: !!env.DB,
    WO_USERNAME: !!env.WO_USERNAME,
    WO_PASSWORD: !!env.WO_PASSWORD
  });
}
__name(onRequestGet4, "onRequestGet");

// send-otp.js
function generateOTP() {
  const arr = new Uint32Array(1);
  crypto.getRandomValues(arr);
  return String(1e5 + arr[0] % 9e5);
}
__name(generateOTP, "generateOTP");
async function onRequestPost2({ request, env }) {
  const { email = "" } = await request.json().catch(() => ({}));
  const normalised = email.trim().toLowerCase();
  const domain = env.ALLOWED_EMAIL_DOMAIN || "ibm.com";
  if (domain !== "." && !normalised.endsWith(`@${domain}`)) {
    return Response.json({ error: `Only @${domain} addresses are allowed.` }, { status: 403 });
  }
  if (!env.RESEND_API_KEY) {
    return Response.json({ error: "Email service not configured." }, { status: 503 });
  }
  const code = generateOTP();
  const expiresAt = Date.now() + 10 * 60 * 1e3;
  await env.OTP_STORE.put(normalised, JSON.stringify({ code, expiresAt }), { expirationTtl: 600 });
  const from = env.RESEND_FROM || "noreply@team11.uk";
  const emailRes = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${env.RESEND_API_KEY}`
    },
    body: JSON.stringify({
      from,
      to: [normalised],
      subject: "Your Candyland Bank access code",
      html: `
        <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:2rem;">
          <h2 style="margin:0 0 0.5rem;">Your access code</h2>
          <p style="color:#555;margin:0 0 1.5rem;">Use the code below to access Candyland Bank. It expires in 10 minutes.</p>
          <div style="font-size:2.5rem;font-weight:700;letter-spacing:0.15em;color:#cc0000;margin-bottom:1.5rem;">${code}</div>
          <p style="color:#999;font-size:0.8rem;">If you didn't request this, ignore this email.</p>
        </div>
      `
    })
  });
  const resendBody = await emailRes.text();
  if (!emailRes.ok) {
    console.error("Resend error:", emailRes.status, resendBody);
    let detail = resendBody;
    try {
      detail = JSON.parse(resendBody)?.message || resendBody;
    } catch {
    }
    return Response.json({ error: `Failed to send email: ${detail}` }, { status: 500 });
  }
  return Response.json({ ok: true });
}
__name(onRequestPost2, "onRequestPost");

// verify-otp.js
async function onRequestPost3({ request, env }) {
  const { email = "", code = "" } = await request.json().catch(() => ({}));
  const normalised = email.trim().toLowerCase();
  const raw = await env.OTP_STORE.get(normalised);
  if (!raw) {
    return Response.json({ error: "No code found for this email. Request a new one." }, { status: 400 });
  }
  const entry = JSON.parse(raw);
  if (Date.now() > entry.expiresAt) {
    await env.OTP_STORE.delete(normalised);
    return Response.json({ error: "Code expired. Request a new one." }, { status: 400 });
  }
  if (entry.code !== code.trim()) {
    return Response.json({ error: "Incorrect code. Try again." }, { status: 400 });
  }
  await env.OTP_STORE.delete(normalised);
  return Response.json({ ok: true });
}
__name(onRequestPost3, "onRequestPost");

// ../.wrangler/tmp/pages-sOzGXh/functionsRoutes-0.9840482675881188.mjs
var routes = [
  {
    routePath: "/api/finance",
    mountPath: "/api",
    method: "GET",
    middlewares: [],
    modules: [onRequestGet]
  },
  {
    routePath: "/api/spending",
    mountPath: "/api",
    method: "GET",
    middlewares: [],
    modules: [onRequestGet2]
  },
  {
    routePath: "/api/stock",
    mountPath: "/api",
    method: "GET",
    middlewares: [],
    modules: [onRequestGet3]
  },
  {
    routePath: "/api/alerts",
    mountPath: "/api",
    method: "",
    middlewares: [],
    modules: [onRequest]
  },
  {
    routePath: "/api/auth",
    mountPath: "/api",
    method: "",
    middlewares: [],
    modules: [onRequest2]
  },
  {
    routePath: "/api/budget",
    mountPath: "/api",
    method: "",
    middlewares: [],
    modules: [onRequest3]
  },
  {
    routePath: "/api/chats",
    mountPath: "/api",
    method: "",
    middlewares: [],
    modules: [onRequest4]
  },
  {
    routePath: "/api/coinbase",
    mountPath: "/api",
    method: "",
    middlewares: [],
    modules: [onRequest5]
  },
  {
    routePath: "/api/goals",
    mountPath: "/api",
    method: "",
    middlewares: [],
    modules: [onRequest6]
  },
  {
    routePath: "/api/notifications",
    mountPath: "/api",
    method: "",
    middlewares: [],
    modules: [onRequest7]
  },
  {
    routePath: "/api/plaid",
    mountPath: "/api",
    method: "",
    middlewares: [],
    modules: [onRequest8]
  },
  {
    routePath: "/api/txncategory",
    mountPath: "/api",
    method: "",
    middlewares: [],
    modules: [onRequest9]
  },
  {
    routePath: "/chat",
    mountPath: "/",
    method: "POST",
    middlewares: [],
    modules: [onRequestPost]
  },
  {
    routePath: "/debug",
    mountPath: "/",
    method: "GET",
    middlewares: [],
    modules: [onRequestGet4]
  },
  {
    routePath: "/send-otp",
    mountPath: "/",
    method: "POST",
    middlewares: [],
    modules: [onRequestPost2]
  },
  {
    routePath: "/verify-otp",
    mountPath: "/",
    method: "POST",
    middlewares: [],
    modules: [onRequestPost3]
  }
];

// ../node_modules/.pnpm/path-to-regexp@6.3.0/node_modules/path-to-regexp/dist.es2015/index.js
function lexer(str) {
  var tokens = [];
  var i = 0;
  while (i < str.length) {
    var char = str[i];
    if (char === "*" || char === "+" || char === "?") {
      tokens.push({ type: "MODIFIER", index: i, value: str[i++] });
      continue;
    }
    if (char === "\\") {
      tokens.push({ type: "ESCAPED_CHAR", index: i++, value: str[i++] });
      continue;
    }
    if (char === "{") {
      tokens.push({ type: "OPEN", index: i, value: str[i++] });
      continue;
    }
    if (char === "}") {
      tokens.push({ type: "CLOSE", index: i, value: str[i++] });
      continue;
    }
    if (char === ":") {
      var name = "";
      var j = i + 1;
      while (j < str.length) {
        var code = str.charCodeAt(j);
        if (
          // `0-9`
          code >= 48 && code <= 57 || // `A-Z`
          code >= 65 && code <= 90 || // `a-z`
          code >= 97 && code <= 122 || // `_`
          code === 95
        ) {
          name += str[j++];
          continue;
        }
        break;
      }
      if (!name)
        throw new TypeError("Missing parameter name at ".concat(i));
      tokens.push({ type: "NAME", index: i, value: name });
      i = j;
      continue;
    }
    if (char === "(") {
      var count = 1;
      var pattern = "";
      var j = i + 1;
      if (str[j] === "?") {
        throw new TypeError('Pattern cannot start with "?" at '.concat(j));
      }
      while (j < str.length) {
        if (str[j] === "\\") {
          pattern += str[j++] + str[j++];
          continue;
        }
        if (str[j] === ")") {
          count--;
          if (count === 0) {
            j++;
            break;
          }
        } else if (str[j] === "(") {
          count++;
          if (str[j + 1] !== "?") {
            throw new TypeError("Capturing groups are not allowed at ".concat(j));
          }
        }
        pattern += str[j++];
      }
      if (count)
        throw new TypeError("Unbalanced pattern at ".concat(i));
      if (!pattern)
        throw new TypeError("Missing pattern at ".concat(i));
      tokens.push({ type: "PATTERN", index: i, value: pattern });
      i = j;
      continue;
    }
    tokens.push({ type: "CHAR", index: i, value: str[i++] });
  }
  tokens.push({ type: "END", index: i, value: "" });
  return tokens;
}
__name(lexer, "lexer");
function parse(str, options) {
  if (options === void 0) {
    options = {};
  }
  var tokens = lexer(str);
  var _a = options.prefixes, prefixes = _a === void 0 ? "./" : _a, _b = options.delimiter, delimiter = _b === void 0 ? "/#?" : _b;
  var result = [];
  var key = 0;
  var i = 0;
  var path = "";
  var tryConsume = /* @__PURE__ */ __name(function(type) {
    if (i < tokens.length && tokens[i].type === type)
      return tokens[i++].value;
  }, "tryConsume");
  var mustConsume = /* @__PURE__ */ __name(function(type) {
    var value2 = tryConsume(type);
    if (value2 !== void 0)
      return value2;
    var _a2 = tokens[i], nextType = _a2.type, index = _a2.index;
    throw new TypeError("Unexpected ".concat(nextType, " at ").concat(index, ", expected ").concat(type));
  }, "mustConsume");
  var consumeText = /* @__PURE__ */ __name(function() {
    var result2 = "";
    var value2;
    while (value2 = tryConsume("CHAR") || tryConsume("ESCAPED_CHAR")) {
      result2 += value2;
    }
    return result2;
  }, "consumeText");
  var isSafe = /* @__PURE__ */ __name(function(value2) {
    for (var _i = 0, delimiter_1 = delimiter; _i < delimiter_1.length; _i++) {
      var char2 = delimiter_1[_i];
      if (value2.indexOf(char2) > -1)
        return true;
    }
    return false;
  }, "isSafe");
  var safePattern = /* @__PURE__ */ __name(function(prefix2) {
    var prev = result[result.length - 1];
    var prevText = prefix2 || (prev && typeof prev === "string" ? prev : "");
    if (prev && !prevText) {
      throw new TypeError('Must have text between two parameters, missing text after "'.concat(prev.name, '"'));
    }
    if (!prevText || isSafe(prevText))
      return "[^".concat(escapeString(delimiter), "]+?");
    return "(?:(?!".concat(escapeString(prevText), ")[^").concat(escapeString(delimiter), "])+?");
  }, "safePattern");
  while (i < tokens.length) {
    var char = tryConsume("CHAR");
    var name = tryConsume("NAME");
    var pattern = tryConsume("PATTERN");
    if (name || pattern) {
      var prefix = char || "";
      if (prefixes.indexOf(prefix) === -1) {
        path += prefix;
        prefix = "";
      }
      if (path) {
        result.push(path);
        path = "";
      }
      result.push({
        name: name || key++,
        prefix,
        suffix: "",
        pattern: pattern || safePattern(prefix),
        modifier: tryConsume("MODIFIER") || ""
      });
      continue;
    }
    var value = char || tryConsume("ESCAPED_CHAR");
    if (value) {
      path += value;
      continue;
    }
    if (path) {
      result.push(path);
      path = "";
    }
    var open = tryConsume("OPEN");
    if (open) {
      var prefix = consumeText();
      var name_1 = tryConsume("NAME") || "";
      var pattern_1 = tryConsume("PATTERN") || "";
      var suffix = consumeText();
      mustConsume("CLOSE");
      result.push({
        name: name_1 || (pattern_1 ? key++ : ""),
        pattern: name_1 && !pattern_1 ? safePattern(prefix) : pattern_1,
        prefix,
        suffix,
        modifier: tryConsume("MODIFIER") || ""
      });
      continue;
    }
    mustConsume("END");
  }
  return result;
}
__name(parse, "parse");
function match(str, options) {
  var keys = [];
  var re = pathToRegexp(str, keys, options);
  return regexpToFunction(re, keys, options);
}
__name(match, "match");
function regexpToFunction(re, keys, options) {
  if (options === void 0) {
    options = {};
  }
  var _a = options.decode, decode = _a === void 0 ? function(x) {
    return x;
  } : _a;
  return function(pathname) {
    var m = re.exec(pathname);
    if (!m)
      return false;
    var path = m[0], index = m.index;
    var params = /* @__PURE__ */ Object.create(null);
    var _loop_1 = /* @__PURE__ */ __name(function(i2) {
      if (m[i2] === void 0)
        return "continue";
      var key = keys[i2 - 1];
      if (key.modifier === "*" || key.modifier === "+") {
        params[key.name] = m[i2].split(key.prefix + key.suffix).map(function(value) {
          return decode(value, key);
        });
      } else {
        params[key.name] = decode(m[i2], key);
      }
    }, "_loop_1");
    for (var i = 1; i < m.length; i++) {
      _loop_1(i);
    }
    return { path, index, params };
  };
}
__name(regexpToFunction, "regexpToFunction");
function escapeString(str) {
  return str.replace(/([.+*?=^!:${}()[\]|/\\])/g, "\\$1");
}
__name(escapeString, "escapeString");
function flags(options) {
  return options && options.sensitive ? "" : "i";
}
__name(flags, "flags");
function regexpToRegexp(path, keys) {
  if (!keys)
    return path;
  var groupsRegex = /\((?:\?<(.*?)>)?(?!\?)/g;
  var index = 0;
  var execResult = groupsRegex.exec(path.source);
  while (execResult) {
    keys.push({
      // Use parenthesized substring match if available, index otherwise
      name: execResult[1] || index++,
      prefix: "",
      suffix: "",
      modifier: "",
      pattern: ""
    });
    execResult = groupsRegex.exec(path.source);
  }
  return path;
}
__name(regexpToRegexp, "regexpToRegexp");
function arrayToRegexp(paths, keys, options) {
  var parts = paths.map(function(path) {
    return pathToRegexp(path, keys, options).source;
  });
  return new RegExp("(?:".concat(parts.join("|"), ")"), flags(options));
}
__name(arrayToRegexp, "arrayToRegexp");
function stringToRegexp(path, keys, options) {
  return tokensToRegexp(parse(path, options), keys, options);
}
__name(stringToRegexp, "stringToRegexp");
function tokensToRegexp(tokens, keys, options) {
  if (options === void 0) {
    options = {};
  }
  var _a = options.strict, strict = _a === void 0 ? false : _a, _b = options.start, start = _b === void 0 ? true : _b, _c = options.end, end = _c === void 0 ? true : _c, _d = options.encode, encode = _d === void 0 ? function(x) {
    return x;
  } : _d, _e = options.delimiter, delimiter = _e === void 0 ? "/#?" : _e, _f = options.endsWith, endsWith = _f === void 0 ? "" : _f;
  var endsWithRe = "[".concat(escapeString(endsWith), "]|$");
  var delimiterRe = "[".concat(escapeString(delimiter), "]");
  var route = start ? "^" : "";
  for (var _i = 0, tokens_1 = tokens; _i < tokens_1.length; _i++) {
    var token = tokens_1[_i];
    if (typeof token === "string") {
      route += escapeString(encode(token));
    } else {
      var prefix = escapeString(encode(token.prefix));
      var suffix = escapeString(encode(token.suffix));
      if (token.pattern) {
        if (keys)
          keys.push(token);
        if (prefix || suffix) {
          if (token.modifier === "+" || token.modifier === "*") {
            var mod = token.modifier === "*" ? "?" : "";
            route += "(?:".concat(prefix, "((?:").concat(token.pattern, ")(?:").concat(suffix).concat(prefix, "(?:").concat(token.pattern, "))*)").concat(suffix, ")").concat(mod);
          } else {
            route += "(?:".concat(prefix, "(").concat(token.pattern, ")").concat(suffix, ")").concat(token.modifier);
          }
        } else {
          if (token.modifier === "+" || token.modifier === "*") {
            throw new TypeError('Can not repeat "'.concat(token.name, '" without a prefix and suffix'));
          }
          route += "(".concat(token.pattern, ")").concat(token.modifier);
        }
      } else {
        route += "(?:".concat(prefix).concat(suffix, ")").concat(token.modifier);
      }
    }
  }
  if (end) {
    if (!strict)
      route += "".concat(delimiterRe, "?");
    route += !options.endsWith ? "$" : "(?=".concat(endsWithRe, ")");
  } else {
    var endToken = tokens[tokens.length - 1];
    var isEndDelimited = typeof endToken === "string" ? delimiterRe.indexOf(endToken[endToken.length - 1]) > -1 : endToken === void 0;
    if (!strict) {
      route += "(?:".concat(delimiterRe, "(?=").concat(endsWithRe, "))?");
    }
    if (!isEndDelimited) {
      route += "(?=".concat(delimiterRe, "|").concat(endsWithRe, ")");
    }
  }
  return new RegExp(route, flags(options));
}
__name(tokensToRegexp, "tokensToRegexp");
function pathToRegexp(path, keys, options) {
  if (path instanceof RegExp)
    return regexpToRegexp(path, keys);
  if (Array.isArray(path))
    return arrayToRegexp(path, keys, options);
  return stringToRegexp(path, keys, options);
}
__name(pathToRegexp, "pathToRegexp");

// ../node_modules/.pnpm/wrangler@4.110.0/node_modules/wrangler/templates/pages-template-worker.ts
var escapeRegex = /[.+?^${}()|[\]\\]/g;
function* executeRequest(request) {
  const requestPath = new URL(request.url).pathname;
  for (const route of [...routes].reverse()) {
    if (route.method && route.method !== request.method) {
      continue;
    }
    const routeMatcher = match(route.routePath.replace(escapeRegex, "\\$&"), {
      end: false
    });
    const mountMatcher = match(route.mountPath.replace(escapeRegex, "\\$&"), {
      end: false
    });
    const matchResult = routeMatcher(requestPath);
    const mountMatchResult = mountMatcher(requestPath);
    if (matchResult && mountMatchResult) {
      for (const handler of route.middlewares.flat()) {
        yield {
          handler,
          params: matchResult.params,
          path: mountMatchResult.path
        };
      }
    }
  }
  for (const route of routes) {
    if (route.method && route.method !== request.method) {
      continue;
    }
    const routeMatcher = match(route.routePath.replace(escapeRegex, "\\$&"), {
      end: true
    });
    const mountMatcher = match(route.mountPath.replace(escapeRegex, "\\$&"), {
      end: false
    });
    const matchResult = routeMatcher(requestPath);
    const mountMatchResult = mountMatcher(requestPath);
    if (matchResult && mountMatchResult && route.modules.length) {
      for (const handler of route.modules.flat()) {
        yield {
          handler,
          params: matchResult.params,
          path: matchResult.path
        };
      }
      break;
    }
  }
}
__name(executeRequest, "executeRequest");
var pages_template_worker_default = {
  async fetch(originalRequest, env, workerContext) {
    let request = originalRequest;
    const handlerIterator = executeRequest(request);
    let data = {};
    let isFailOpen = false;
    const next = /* @__PURE__ */ __name(async (input, init) => {
      if (input !== void 0) {
        let url = input;
        if (typeof input === "string") {
          url = new URL(input, request.url).toString();
        }
        request = new Request(url, init);
      }
      const result = handlerIterator.next();
      if (result.done === false) {
        const { handler, params, path } = result.value;
        const context = {
          request: new Request(request.clone()),
          functionPath: path,
          next,
          params,
          get data() {
            return data;
          },
          set data(value) {
            if (typeof value !== "object" || value === null) {
              throw new Error("context.data must be an object");
            }
            data = value;
          },
          env,
          waitUntil: workerContext.waitUntil.bind(workerContext),
          passThroughOnException: /* @__PURE__ */ __name(() => {
            isFailOpen = true;
          }, "passThroughOnException")
        };
        const response = await handler(context);
        if (!(response instanceof Response)) {
          throw new Error("Your Pages function should return a Response");
        }
        return cloneResponse(response);
      } else if ("ASSETS") {
        const response = await env["ASSETS"].fetch(request);
        return cloneResponse(response);
      } else {
        const response = await fetch(request);
        return cloneResponse(response);
      }
    }, "next");
    try {
      return await next();
    } catch (error) {
      if (isFailOpen) {
        const response = await env["ASSETS"].fetch(request);
        return cloneResponse(response);
      }
      throw error;
    }
  }
};
var cloneResponse = /* @__PURE__ */ __name((response) => (
  // https://fetch.spec.whatwg.org/#null-body-status
  new Response(
    [101, 204, 205, 304].includes(response.status) ? null : response.body,
    response
  )
), "cloneResponse");
export {
  pages_template_worker_default as default
};
