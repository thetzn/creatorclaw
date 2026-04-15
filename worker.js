/**
 * CreatorClaw — Cloudflare Worker
 * - Regular mode: Chat Completions API with gpt-4o-mini
 * - Web search mode: Responses API with gpt-4o + web_search_preview
 */

const CHAT_URL = 'https://api.openai.com/v1/chat/completions';
const RESPONSES_URL = 'https://api.openai.com/v1/responses';
const MODEL = 'gpt-4o-mini';
const MODEL_SEARCH = 'gpt-4o';

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

    const headers = {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + env.API_KEY,
    };

    let res;

    if (isWebSearch) {
      // Use the Responses API which supports web_search_preview
      // Convert chat messages to Responses API input format
      const input = (body.messages || []).map(m => ({
        role: m.role === 'system' ? 'developer' : m.role,
        content: m.content,
      }));

      res = await fetch(RESPONSES_URL, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          model: MODEL_SEARCH,
          tools: [{ type: 'web_search_preview' }],
          input,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        return new Response(JSON.stringify(data), {
          status: res.status,
          headers: { 'Content-Type': 'application/json', ...cors(origin, allowed) },
        });
      }

      // Extract text content from the Responses API output
      const textOutput = (data.output || []).find(o => o.type === 'message');
      const text = textOutput?.content?.find(c => c.type === 'output_text')?.text || '';

      // Return in the same shape as Chat Completions so the frontend doesn't care
      return new Response(JSON.stringify({
        choices: [{ message: { role: 'assistant', content: text } }],
      }), {
        headers: { 'Content-Type': 'application/json', ...cors(origin, allowed) },
      });

    } else {
      // Regular Chat Completions
      res = await fetch(CHAT_URL, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          model: MODEL,
          temperature: body.temperature || 0.7,
          messages: body.messages || [],
        }),
      });

      const data = await res.json();
      return new Response(JSON.stringify(data), {
        status: res.status,
        headers: { 'Content-Type': 'application/json', ...cors(origin, allowed) },
      });
    }
  },
};

function cors(origin, allowed) {
  return {
    'Access-Control-Allow-Origin': allowed ? origin : 'null',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };
}
