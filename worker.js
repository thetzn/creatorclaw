/**
 * CreatorClaw — Cloudflare Worker
 * Proxies requests to OpenAI API. Handles web search mode by using
 * OpenAI's built-in web_search tool (gpt-4o with tools).
 */

const OPENAI_URL = 'https://api.openai.com/v1/chat/completions';
const MODEL = 'gpt-4o-mini';
const MODEL_SEARCH = 'gpt-4o';  // web search requires gpt-4o

const ALLOWED_ORIGINS = [
  'https://thetzn.github.io',
  'http://localhost',
  'http://127.0.0.1',
];

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin') || '';
    const allowed = ALLOWED_ORIGINS.some(o => origin.startsWith(o));

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: cors(origin, allowed) });
    }
    if (request.method !== 'POST') return new Response('Method not allowed', { status: 405 });
    if (!allowed) return new Response('Forbidden', { status: 403 });

    let body;
    try { body = await request.json(); }
    catch { return new Response('Invalid JSON', { status: 400 }); }

    const isWebSearch = body.webSearch;
    delete body.webSearch;

    // Build the OpenAI request
    const oaiBody = {
      model: MODEL,
      temperature: body.temperature || 0.7,
      messages: body.messages || [],
    };

    // For web search, use gpt-4o with web search tool
    if (isWebSearch) {
      oaiBody.model = MODEL_SEARCH;
      oaiBody.tools = [{ type: 'web_search_preview' }];
    }

    const res = await fetch(OPENAI_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + env.API_KEY,
      },
      body: JSON.stringify(oaiBody),
    });

    const data = await res.json();

    return new Response(JSON.stringify(data), {
      status: res.status,
      headers: { 'Content-Type': 'application/json', ...cors(origin, allowed) },
    });
  },
};

function cors(origin, allowed) {
  return {
    'Access-Control-Allow-Origin': allowed ? origin : 'null',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };
}
