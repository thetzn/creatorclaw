/**
 * CreatorClaw — Cloudflare Worker
 * - Regular mode: Chat Completions API with gpt-4o-mini
 * - Web search mode: Responses API with gpt-4o + web_search_preview
 * - IG scrape mode: Apify Instagram Profile Scraper → OpenAI interpretation
 */

const CHAT_URL = 'https://api.openai.com/v1/chat/completions';
const RESPONSES_URL = 'https://api.openai.com/v1/responses';
const APIFY_IG_URL = 'https://api.apify.com/v2/acts/apify~instagram-profile-scraper/run-sync-get-dataset-items';
const MODEL = 'gpt-4o-mini';
const MODEL_SEARCH = 'gpt-4o';

const ALLOWED_ORIGINS = [
  'https://creatorclaw.co',
  'https://www.creatorclaw.co',
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

    // ── IG scrape via Apify ─────────────────────────────────────────────
    if (body.igScrape) {
      return runIGScrape(body.handle, env, origin, allowed);
    }

    const isWebSearch = body.webSearch;
    delete body.webSearch;

    const headers = {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + env.API_KEY,
    };

    let res;

    if (isWebSearch) {
      // Legacy path — kept as fallback
      const input = (body.messages || []).map(m => ({
        role: m.role === 'system' ? 'developer' : m.role,
        content: m.content,
      }));
      res = await fetch(RESPONSES_URL, {
        method: 'POST',
        headers,
        body: JSON.stringify({ model: MODEL_SEARCH, tools: [{ type: 'web_search_preview' }], input }),
      });
      const data = await res.json();
      if (!res.ok) {
        return new Response(JSON.stringify(data), { status: res.status, headers: { 'Content-Type': 'application/json', ...cors(origin, allowed) } });
      }
      const textOutput = (data.output || []).find(o => o.type === 'message');
      const text = textOutput?.content?.find(c => c.type === 'output_text')?.text || '';
      return new Response(JSON.stringify({ choices: [{ message: { role: 'assistant', content: text } }] }), {
        headers: { 'Content-Type': 'application/json', ...cors(origin, allowed) },
      });
    }

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
  },
};

// ── IG scrape: Apify scrape + OpenAI interpretation ──────────────────────────
async function runIGScrape(rawHandle, env, origin, allowed) {
  const handle = String(rawHandle || '').replace(/^@/, '').replace(/^(https?:\/\/)?(www\.)?instagram\.com\//, '').replace(/\/$/, '').trim();
  if (!handle) {
    return json({ error: { message: 'No handle provided' } }, 400, origin, allowed);
  }

  // 1. Scrape profile + recent posts via Apify
  const apifyRes = await fetch(`${APIFY_IG_URL}?token=${env.APIFY_TOKEN}&timeout=90`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ usernames: [handle], resultsLimit: 25 }),
  });

  if (!apifyRes.ok) {
    const errText = await apifyRes.text();
    return json({ error: { message: 'Apify scrape failed: ' + errText.slice(0, 200) } }, apifyRes.status, origin, allowed);
  }

  const items = await apifyRes.json();
  const p = Array.isArray(items) ? items[0] : null;
  if (!p) {
    return json({ error: { message: 'Profile not found or is private' } }, 404, origin, allowed);
  }

  // 2. Compute real engagement rate from recent posts
  const posts = (p.latestPosts || p.posts || []).filter(x => typeof x.likesCount === 'number' || typeof x.likes === 'number');
  const likeOf = x => (typeof x.likesCount === 'number' ? x.likesCount : (x.likes || 0));
  const commentOf = x => (typeof x.commentsCount === 'number' ? x.commentsCount : (x.comments || 0));
  const avgLikes = posts.length ? posts.reduce((s, x) => s + likeOf(x), 0) / posts.length : 0;
  const avgComments = posts.length ? posts.reduce((s, x) => s + commentOf(x), 0) / posts.length : 0;
  // Apify may return the count under several names depending on actor version
  const followers = p.followersCount || p.followers_count || p.followers || p.edge_followed_by?.count || 0;
  const following = p.followsCount || p.follows_count || p.following || p.edge_follow?.count || 0;
  const totalPosts = p.postsCount || p.posts_count || p.edge_owner_to_timeline_media?.count || 0;
  const engagementPct = followers > 0 ? ((avgLikes + avgComments) / followers) * 100 : 0;

  // 3. Format follower count nicely
  const formatCount = n => {
    if (!n || n <= 0) return null;
    if (n >= 1_000_000) return (n / 1_000_000).toFixed(n >= 10_000_000 ? 0 : 1).replace(/\.0$/, '') + 'M';
    if (n >= 1_000) return (n / 1_000).toFixed(n >= 10_000 ? 0 : 1).replace(/\.0$/, '') + 'K';
    return String(n);
  };

  // 4. Pull caption text from recent posts for interpretation
  const captions = posts.slice(0, 25).map(x => x.caption || '').filter(Boolean).join('\n---\n').slice(0, 4000);

  // 5. Ask OpenAI to interpret categories / vibes / themes from real captions
  let interpretation = { categories: [], vibes: [], topCategory: null, recentThemes: [] };
  if (captions) {
    const interpRes = await fetch(CHAT_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + env.API_KEY },
      body: JSON.stringify({
        model: MODEL,
        temperature: 0.4,
        messages: [
          { role: 'system', content: 'You analyze Instagram post captions to identify content categories, vibes, and recurring themes. Return ONLY valid JSON, no markdown.' },
          { role: 'user', content: `Here are ${posts.length} recent captions from @${handle}:\n\n${captions}\n\nReturn this JSON:\n{\n  "topCategory": "primary category e.g. Fitness",\n  "categories": [{"name":"Fitness","pct":40},{"name":"Lifestyle","pct":30},{"name":"Beauty","pct":20},{"name":"Wellness","pct":10}],\n  "vibes": ["Aspirational","Warm Tones","Relatable","High Energy","Polished"],\n  "recentThemes": ["morning routines","gym workouts","product reviews","GRWM","day in my life"]\n}\n\nPct values must sum to 100. Give 4-5 categories, 5 vibes, 4-6 recent themes.` }
        ],
      }),
    });
    if (interpRes.ok) {
      const interpData = await interpRes.json();
      try {
        let txt = interpData.choices[0].message.content;
        txt = txt.replace(/```(?:json)?/g, '').replace(/```/g, '').trim();
        const m = txt.match(/\{[\s\S]*\}/);
        if (m) interpretation = { ...interpretation, ...JSON.parse(m[0]) };
      } catch (e) { /* keep empty interpretation */ }
    }
  }

  // 6. Assemble the profile payload matching the frontend schema
  const profile = {
    username: '@' + (p.username || handle),
    displayName: p.fullName || p.full_name || p.username || handle,
    followers: formatCount(followers),
    following: formatCount(following),
    totalPosts: formatCount(totalPosts),
    engagementRate: engagementPct > 0 ? (engagementPct < 1 ? engagementPct.toFixed(2) : engagementPct.toFixed(1)) + '%' : null,
    topCategory: interpretation.topCategory,
    categories: interpretation.categories,
    vibes: interpretation.vibes,
    bio: p.biography || p.bio || null,
    postingFrequency: postsCadence(posts),
    recentThemes: interpretation.recentThemes,
    // raw counts for any downstream math / debugging
    _raw: { followers, following, posts: totalPosts, avgLikes, avgComments, verified: !!p.verified, private: !!p.private, actorFields: Object.keys(p).slice(0, 30) },
  };

  // Return in the same shape the frontend expects from kimiChat
  return json({
    choices: [{ message: { role: 'assistant', content: JSON.stringify(profile) } }],
  }, 200, origin, allowed);
}

function postsCadence(posts) {
  if (!posts || posts.length < 2) return null;
  const times = posts.map(p => new Date(p.timestamp || p.takenAtTimestamp * 1000).getTime()).filter(t => !isNaN(t)).sort((a, b) => b - a);
  if (times.length < 2) return null;
  const dayMs = 86400000;
  const spanDays = (times[0] - times[times.length - 1]) / dayMs;
  const perDay = posts.length / Math.max(spanDays, 1);
  if (perDay >= 0.9) return 'Daily';
  if (perDay >= 0.4) return 'Several times per week';
  if (perDay >= 0.2) return 'Weekly';
  return 'Occasionally';
}

function json(obj, status, origin, allowed) {
  return new Response(JSON.stringify(obj), {
    status,
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
