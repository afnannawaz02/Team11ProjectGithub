/**
 * functions/api/stock.js — Cloudflare Pages Function
 * GET /api/stock?ticker=AAPL&function=GLOBAL_QUOTE
 * GET /api/stock?ticker=AAPL&function=TIME_SERIES_DAILY
 * GET /api/stock?ticker=AAPL&function=OVERVIEW
 * GET /api/stock?query=apple&function=SYMBOL_SEARCH
 *
 * Env bindings required (Cloudflare Pages → Settings → Environment variables):
 *   ALPHAVANTAGE_API_KEY — Alpha Vantage API key
 */

export async function onRequestGet({ request, env }) {
  if (!env.ALPHAVANTAGE_API_KEY) {
    return Response.json({ error: 'ALPHAVANTAGE_API_KEY not configured.' }, { status: 503 });
  }

  const url    = new URL(request.url);
  const fn     = url.searchParams.get('function') || 'GLOBAL_QUOTE';
  const ticker = url.searchParams.get('ticker');
  const query  = url.searchParams.get('query');

  const params = new URLSearchParams({
    function: fn,
    apikey:   env.ALPHAVANTAGE_API_KEY,
  });
  if (ticker) params.set('symbol', ticker.toUpperCase());
  if (query)  params.set('keywords', query);
  if (fn === 'TIME_SERIES_DAILY') params.set('outputsize', 'compact');

  try {
    const avRes = await fetch(`https://www.alphavantage.co/query?${params}`);
    if (!avRes.ok) {
      return Response.json({ error: 'Alpha Vantage request failed.' }, { status: 502 });
    }

    const data = await avRes.json();

    // Alpha Vantage returns a Note/Information field when rate-limited
    if (data.Note || data.Information) {
      return Response.json({ error: data.Note || data.Information }, { status: 429 });
    }

    return Response.json(data);
  } catch (err) {
    return Response.json({ error: 'Stock data fetch failed.' }, { status: 500 });
  }
}
