/**
 * functions/api/stock.js — Cloudflare Pages Function
 *
 * GET /api/stock?type=quote&ticker=AAPL
 * GET /api/stock?type=candle&ticker=AAPL&range=1M
 * GET /api/stock?type=profile&ticker=AAPL
 * GET /api/stock?type=search&query=apple
 *
 * Env bindings required (Cloudflare Pages → Settings → Environment variables):
 *   FINNHUB_API_KEY — Finnhub API key
 */

const BASE = 'https://finnhub.io/api/v1';

// Convert range label to Finnhub resolution + from-timestamp
function rangeParams(range) {
  const now   = Math.floor(Date.now() / 1000);
  const day   = 86400;
  const days  = range === '1W' ? 7 : range === '1M' ? 30 : 90;
  // Use daily candles ('D') for all ranges
  return { resolution: 'D', from: now - days * day, to: now };
}

export async function onRequestGet({ request, env }) {
  if (!env.FINNHUB_API_KEY) {
    return Response.json({ error: 'FINNHUB_API_KEY not configured.' }, { status: 503 });
  }

  const url    = new URL(request.url);
  const type   = url.searchParams.get('type') || 'quote';
  const ticker = (url.searchParams.get('ticker') || '').toUpperCase();
  const query  = url.searchParams.get('query') || '';
  const range  = url.searchParams.get('range') || '1M';
  const key    = env.FINNHUB_API_KEY;

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
    } else {
      return Response.json({ error: 'Unknown type.' }, { status: 400 });
    }

    const r = await fetch(endpoint, { headers: { 'X-Finnhub-Token': key } });
    if (!r.ok) return Response.json({ error: `Finnhub error ${r.status}` }, { status: 502 });
    const data = await r.json();
    // Finnhub returns { s: 'no_data' } for candles with no results
    if (data.s === 'no_data') return Response.json({ error: 'No data available.' }, { status: 404 });
    return Response.json(data);
  } catch (err) {
    return Response.json({ error: 'Stock data fetch failed.' }, { status: 500 });
  }
}
