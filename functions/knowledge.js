/**
 * functions/knowledge.js — Cloudflare Pages Function
 * POST /knowledge
 *
 * watsonx.ai Custom Service knowledge source endpoint.
 * watsonx sends: { "query": "string", "top_k": number }
 * Returns:       { "results": [{ "content": "string", "score": number, "id": "string" }] }
 *
 * This turns the static KB into a live retrieval service that watsonx
 * can connect to as a knowledge source.
 */

import { KNOWLEDGE_BASE } from '../server/kb.js';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

export async function onRequest({ request }) {
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  // GET /knowledge — return schema so watsonx can validate the connection
  if (request.method === 'GET') {
    return Response.json({
      name: 'Candyland Bank Knowledge Base',
      description: 'Financial products, investment guidance, fees, and regulatory information for Candyland Bank.',
      version: '1.0.0',
    }, { headers: CORS_HEADERS });
  }

  if (request.method !== 'POST') {
    return Response.json({ error: 'Use POST' }, { status: 405, headers: CORS_HEADERS });
  }

  const body = await request.json().catch(() => ({}));

  // watsonx sends { query: string, top_k: number }
  // Also support { input: string } and { userMessage: string } for flexibility
  const query  = (body.query || body.input || body.userMessage || '').toLowerCase().trim();
  const topK   = Math.min(body.top_k || body.topK || 5, 10);

  if (!query) {
    return Response.json({ results: [] }, { headers: CORS_HEADERS });
  }

  // Score each KB chunk by keyword overlap with the query
  const scored = KNOWLEDGE_BASE.map((chunk) => {
    // Count how many topic keywords appear in the query
    const topicHits = chunk.topic.filter((kw) => query.includes(kw)).length;

    // Also count how many query words appear in the content (reverse match)
    const queryWords = query.split(/\s+/).filter((w) => w.length > 3);
    const contentHits = queryWords.filter((w) => chunk.content.toLowerCase().includes(w)).length;

    const score = (topicHits * 2 + contentHits) / (chunk.topic.length + queryWords.length + 1);

    return { chunk, score };
  });

  const results = scored
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, topK)
    .map(({ chunk, score }, i) => ({
      id:      `kb-${i}`,
      content: chunk.content,
      score:   Math.min(score, 1),
      metadata: {
        topics: chunk.topic,
      },
    }));

  // If nothing matched, return the most general chunks
  if (results.length === 0) {
    const fallback = KNOWLEDGE_BASE.slice(0, 3).map((chunk, i) => ({
      id:      `kb-fallback-${i}`,
      content: chunk.content,
      score:   0.1,
      metadata: { topics: chunk.topic },
    }));
    return Response.json({ results: fallback }, { headers: CORS_HEADERS });
  }

  return Response.json({ results }, { headers: CORS_HEADERS });
}
