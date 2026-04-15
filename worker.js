/**
 * CreatorClaw — Cloudflare Worker
 * - Regular mode: proxies requests straight to Kimi API
 * - Web search mode: handles Kimi's multi-turn $web_search tool loop
 *   server-side so the browser just gets the final answer in one call.
 */

const KIMI_URL = 'https://api.kimi.com/coding/v1/chat/completions';
const KIMI_MODEL = 'kimi-for-coding';

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

    // Force correct model name
    body.model = KIMI_MODEL;

    // Web search mode — run the tool loop here, return the final answer
    if (body.webSearch) {
      return runWebSearch(body.messages, env, origin, allowed);
    }

    // Regular proxy
    const res = await fetch(KIMI_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + env.KIMI_API_KEY },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    return new Response(JSON.stringify(data), {
      status: res.status,
      headers: { 'Content-Type': 'application/json', ...cors(origin, allowed) },
    });
  },
};

// Runs Kimi's $web_search tool loop to completion and returns the final response.
async function runWebSearch(messages, env, origin, allowed) {
  const tools = [{ type: 'builtin_function', function: { name: '$web_search' } }];
  let msgs = [...messages];

  for (let round = 0; round < 8; round++) {
    const res = await fetch(KIMI_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + env.KIMI_API_KEY },
      body: JSON.stringify({
        model: KIMI_MODEL,
        temperature: 0.3,
        messages: msgs,
        tools,
      }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      return new Response(JSON.stringify(err), {
        status: res.status,
        headers: { 'Content-Type': 'application/json', ...cors(origin, allowed) },
      });
    }

    const data = await res.json();
    const choice = data.choices[0];
    msgs.push(choice.message);

    if (choice.finish_reason === 'tool_calls') {
      // Acknowledge each tool call — Kimi executes $web_search server-side
      for (const tc of choice.message.tool_calls) {
        msgs.push({
          role: 'tool',
          tool_call_id: tc.id,
          name: tc.function.name,
          content: '',
        });
      }
    } else {
      // Done — return the final answer
      return new Response(JSON.stringify({
        choices: [{ message: { role: 'assistant', content: choice.message.content } }],
      }), {
        headers: { 'Content-Type': 'application/json', ...cors(origin, allowed) },
      });
    }
  }

  return new Response(JSON.stringify({ error: { message: 'Web search timed out after too many rounds' } }), {
    status: 500,
    headers: { 'Content-Type': 'application/json', ...cors(origin, allowed) },
  });
}

function cors(origin, allowed) {
  return {
    'Access-Control-Allow-Origin': allowed ? origin : 'null',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };
}
