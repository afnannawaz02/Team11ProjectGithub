/**
 * functions/api/stock.js — Cloudflare Pages Function
 *
 * GET /api/stock?type=quote&ticker=AAPL
 * GET /api/stock?type=candle&ticker=AAPL&range=1M
 * GET /api/stock?type=profile&ticker=AAPL
 * GET /api/stock?type=search&query=apple
 * GET /api/stock?type=recommend&ticker=AAPL
 * GET /api/stock?type=news&category=general
 * GET /api/stock?type=earnings&ticker=AAPL
 * GET /api/stock?type=sentiment&ticker=AAPL
 * GET /api/stock?type=peers&ticker=AAPL
 *
 * Env bindings required (Cloudflare Pages → Settings → Environment variables):
 *   FINNHUB_API_KEY — Finnhub API key
 */

const BASE = 'https://finnhub.io/api/v1';

function rangeParams(range) {
  const day  = 86400;
  const to   = Math.floor(Date.now() / 1000);
  const days = range === '1W' ? 14 : range === '1M' ? 45 : 120;
  return { resolution: 'D', from: to - days * day, to };
}

export async function onRequestGet({ request, env }) {
  if (!env.FINNHUB_API_KEY) {
    return Response.json({ error: 'FINNHUB_API_KEY not configured.' }, { status: 503 });
  }

  const url      = new URL(request.url);
  const type     = url.searchParams.get('type') || 'quote';
  const ticker   = (url.searchParams.get('ticker') || '').toUpperCase();
  const query    = url.searchParams.get('query') || '';
  const range    = url.searchParams.get('range') || '1M';
  const category = url.searchParams.get('category') || 'general';
  const key      = env.FINNHUB_API_KEY;

  try {
    let endpoint;

    if (type === 'quote') {
      endpoint = `${BASE}/quote?symbol=${ticker}&token=${key}`;
    } else if (type === 'candle') {
      const { resolution, from, to } = rangeParams(range);
      endpoint = `${BASE}/stock/candle?symbol=${ticker}&resolution=${resolution}&from=${from}&to=${to}&token=${key}`;
    } else if (type === 'profile') {
      endpoint = `${BASE}/stock/profile2?symbol=${ticker}&token=${key}`;
    } else if (type === 'search') {
      endpoint = `${BASE}/search?q=${encodeURIComponent(query)}&token=${key}`;
    } else if (type === 'recommend') {
      // Analyst recommendations — returns array of { buy, hold, sell, strongBuy, strongSell, period, symbol }
      endpoint = `${BASE}/stock/recommendation?symbol=${ticker}&token=${key}`;
    } else if (type === 'news') {
      // Market / company news
      if (ticker) {
        const toTs   = Math.floor(Date.now() / 1000);
        const fromTs = toTs - 7 * 86400;
        const from   = new Date(fromTs * 1000).toISOString().slice(0, 10);
        const to     = new Date(toTs   * 1000).toISOString().slice(0, 10);
        endpoint = `${BASE}/company-news?symbol=${ticker}&from=${from}&to=${to}&token=${key}`;
      } else {
        endpoint = `${BASE}/news?category=${category}&minId=0&token=${key}`;
      }
    } else if (type === 'earnings') {
      // Earnings surprises
      endpoint = `${BASE}/stock/earnings?symbol=${ticker}&limit=4&token=${key}`;
    } else if (type === 'sentiment') {
      // Social sentiment
      endpoint = `${BASE}/stock/social-sentiment?symbol=${ticker}&token=${key}`;
    } else if (type === 'peers') {
      // Company peers
      endpoint = `${BASE}/stock/peers?symbol=${ticker}&token=${key}`;
    } else if (type === 'metrics') {
      // Basic financials / metrics
      endpoint = `${BASE}/stock/metric?symbol=${ticker}&metric=all&token=${key}`;
    } else {
      return Response.json({ error: 'Unknown type.' }, { status: 400 });
    }

    const r = await fetch(endpoint, { headers: { 'X-Finnhub-Token': key } });
    if (!r.ok) return Response.json({ error: `Finnhub error ${r.status}` }, { status: 502 });

    const data = await r.json();
    if (data.s === 'no_data') return Response.json({ error: 'No data available.' }, { status: 404 });

    return Response.json(data);
  } catch (err) {
    console.error('[stock]', err.message);
    return Response.json({ error: 'Stock data fetch failed.' }, { status: 500 });
  }
}
