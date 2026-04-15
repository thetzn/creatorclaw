/**
 * CreatorClaw — Cloudflare Worker
 * Proxies requests to the Kimi (Moonshot) API so the API key
 * never touches the browser.
 *
 * Deploy:
 *   1. wrangler secret put KIMI_API_KEY   (paste your key)
 *   2. wrangler deploy
 *
 * Then set PROXY_URL in CreatorClaw.html to your Worker URL.
 */

const KIMI_URL = 'https://api.moonshot.cn/v1/chat/completions';

// Allowed origins — add your GitHub Pages URL here
const ALLOWED_ORIGINS = [
  'https://thetzn.github.io',
  'http://localhost',        // for local testing
  'http://127.0.0.1',
];

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin') || '';
    const allowed = ALLOWED_ORIGINS.some(o => origin.startsWith(o));

    // Handle CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: corsHeaders(origin, allowed),
      });
    }

    if (request.method !== 'POST') {
      return new Response('Method not allowed', { status: 405 });
    }

    if (!allowed) {
      return new Response('Forbidden', { status: 403 });
    }

    let body;
    try {
      body = await request.json();
    } catch {
      return new Response('Invalid JSON', { status: 400 });
    }

    const kimiRes = await fetch(KIMI_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + env.KIMI_API_KEY,
      },
      body: JSON.stringify(body),
    });

    const data = await kimiRes.json();

    return new Response(JSON.stringify(data), {
      status: kimiRes.status,
      headers: {
        'Content-Type': 'application/json',
        ...corsHeaders(origin, allowed),
      },
    });
  },
};

function corsHeaders(origin, allowed) {
  return {
    'Access-Control-Allow-Origin': allowed ? origin : 'null',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };
}
