// ─────────────────────────────────────────────────────────────────────────────
// Agents SDK runtime — Phase 1 of the migration.
//
// Two surfaces:
//   - handleAgentsSpike: keeps /v1/agents/test alive as a canary. Touch it
//     after every deploy to confirm the SDK still runs on Workers.
//   - handleAgentChat:   production chat handler. Wired behind a feature
//     flag in worker.js (body.useAgentsSdk === true). Replaces the
//     hand-rolled tool-call loop one tool at a time across Commits A-F.
//
// Output stream is wrapped in OpenAI Chat-Completions-shaped SSE events
// (`data: {choices:[{delta:{content:'...'}}]}`) so the existing frontend
// stream parser works unchanged. A final `delta.metadata` event preserves
// our inline-card side-channel (brand_matches, pulse_ideas).
// ─────────────────────────────────────────────────────────────────────────────

import { Agent, run, tool, hostedMcpTool } from '@openai/agents';
import { setOpenAIAPI } from '@openai/agents-openai';
import { z } from 'zod';

// Google Workspace MCP server (Gmail + Calendar). Self-hosted on Fly.io;
// see google_workspace_mcp/. Bearer token comes from the user's stored
// Google OAuth access token (refreshed by the Worker's getGoogleAccessToken
// helper).
//
// We use hostedMcpTool (OpenAI handles the MCP client server-side via the
// Responses API) rather than MCPServerStreamableHttp (which would run the
// MCP client locally). The local client uses Ajv schema validation, and
// Ajv compiles validators at runtime via `new Function()` — blocked on
// Cloudflare Workers ("Code generation from strings disallowed"). Hosted
// MCP does the round-trip between OpenAI and Fly directly, so we never
// run into the eval restriction.
const GOOGLE_MCP_URL = 'https://creatorclaw-google-mcp.fly.dev/mcp';

// One-time switch the SDK to Responses API. hostedMcpTool requires it.
let _responsesApiActive = false;
function ensureResponsesApi() {
  if (_responsesApiActive) return;
  setOpenAIAPI('responses');
  _responsesApiActive = true;
}

// Allowlist of MCP tools we expose to the agent. Sourced from
// taylorwilsdon/google_workspace_mcp gmail/gmail_tools.py +
// gcalendar/calendar_tools.py. Excludes draft_gmail_message (needs
// gmail.compose scope, which we don't request — would 403). Excludes
// out-of-office, focus-time, attachments, and the batch variants for
// now since the LLM doesn't need them yet.
const GOOGLE_MCP_ALLOWED_TOOLS = [
  // Gmail
  'search_gmail_messages',
  'get_gmail_message_content',
  'get_gmail_thread_content',
  'send_gmail_message',
  // Calendar — manage_event is the create/update/delete tool
  'list_calendars',
  'get_events',
  'manage_event',
  'query_freebusy',
];

function buildGoogleMcpTool(accessToken) {
  if (!accessToken) return null;
  return hostedMcpTool({
    serverLabel: 'google_workspace',
    serverUrl: GOOGLE_MCP_URL,
    headers: { Authorization: 'Bearer ' + accessToken },
    allowedTools: GOOGLE_MCP_ALLOWED_TOOLS,
    requireApproval: 'never',  // creator pre-authorized via the Connect Google flow
  });
}

// ── Env shim ────────────────────────────────────────────────────────────────
// SDK reads OPENAI_API_KEY from process.env. Workers don't have process by
// default; under nodejs_compat we get a stub but env vars don't bleed
// through, so we copy our Worker secret in once per request.
function setupOpenAIEnv(env) {
  if (typeof globalThis.process === 'undefined') globalThis.process = { env: {} };
  if (!globalThis.process.env) globalThis.process.env = {};
  if (env?.API_KEY) globalThis.process.env.OPENAI_API_KEY = env.API_KEY;
}

// ── Spike (canary) ──────────────────────────────────────────────────────────
const echoTool = tool({
  name: 'echo',
  description: 'Echoes the input string back, prefixed with [echo].',
  parameters: z.object({ text: z.string().describe('Text to echo.') }),
  async execute({ text }) { return `[echo] ${text}`; },
});

let _spikeAgent = null;
function getSpikeAgent() {
  if (_spikeAgent) return _spikeAgent;
  _spikeAgent = new Agent({
    name: 'SpikeAgent',
    model: 'gpt-4o-mini',
    instructions:
      'You are a test agent for SDK validation. When the user sends anything, call the echo tool exactly once with their message, then say "spike OK" and stop.',
    tools: [echoTool],
  });
  return _spikeAgent;
}

export async function handleAgentsSpike(req, env, cors) {
  setupOpenAIEnv(env);
  let body = {};
  try { body = await req.json(); } catch {}
  const input = String(body?.message || 'hello from the spike').slice(0, 500);
  try {
    const result = await run(getSpikeAgent(), input, { stream: true });
    return new Response(result.toTextStream(), {
      status: 200,
      headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-cache', ...cors },
    });
  } catch (err) {
    return errorJSON('agents_spike_failed', err, cors);
  }
}

// ── Production chat handler ─────────────────────────────────────────────────
// Tool definitions delegate to the existing hand-rolled executor in worker.js
// via runContext.context.executeToolByName. Avoids duplicating the rate
// math, peer-aggregate fetching, and sub-LLM JSON generation — the SDK is
// just the orchestration layer. Gmail/Calendar are served by the
// google_workspace_mcp server attached at runtime.

const rateEstimateTool = tool({
  name: 'get_rate_estimate',
  description: "Compute the industry benchmark rate range for a specific deliverable on a platform, adjusted for the creator's followers, engagement, and niche. Call this whenever the user asks about rates, pricing, what to charge, quote ranges, or pitches that involve a specific deliverable.",
  parameters: z.object({
    platform: z.enum(['instagram', 'tiktok', 'youtube']),
    deliverable: z.string().describe("e.g. 'reel', 'static', 'carousel', 'story-series', 'video', 'ugc', 'youtube-short', 'youtube-integration', 'full-bundle', 'crosspost-ig-tt'"),
    rights_months: z.number().int().nullable().optional().describe('Months of paid-ad usage rights the brand wants. 0 if none.'),
    exclusivity_days: z.number().int().nullable().optional().describe('Days of category exclusivity. 0 if none.'),
    whitelisting: z.boolean().nullable().optional().describe('True if brand wants to whitelist (run ads under creator handle).'),
    rush: z.boolean().nullable().optional().describe('True if <7 day turnaround.'),
  }),
  async execute(args, runContext) {
    return runContext.context.executeToolByName('get_rate_estimate', args);
  },
});

const compareOfferTool = tool({
  name: 'compare_offer',
  description: "A brand offered a specific dollar amount. Compute the benchmark range and tell whether the offer is below, within, or above benchmark. Call this whenever the user mentions a specific offer amount.",
  parameters: z.object({
    platform: z.enum(['instagram', 'tiktok', 'youtube']),
    deliverable: z.string(),
    amount_offered: z.number().describe('The $ the brand offered.'),
    rights_months: z.number().int().nullable().optional(),
    exclusivity_days: z.number().int().nullable().optional(),
    whitelisting: z.boolean().nullable().optional(),
  }),
  async execute(args, runContext) {
    return runContext.context.executeToolByName('compare_offer', args);
  },
});

const generateContentIdeasTool = tool({
  name: 'generate_content_ideas',
  description: "Generate a fresh batch of content ideas tailored to the creator's persona, pillars, and engagement profile. Call this whenever the user asks for ideas, brainstorming, what to post, refining a previous batch, or explores a content theme. The UI renders the result as mini cards inline in the chat with Schedule and Draft Script actions.",
  parameters: z.object({
    theme: z.string().nullable().optional().describe('Optional topic or angle to focus the batch on, e.g. "western fashion" or "morning routines".'),
    count: z.number().int().nullable().optional().describe('Number of ideas to return. Default 4. Max 6.'),
  }),
  async execute(args, runContext) {
    return runContext.context.executeToolByName('generate_content_ideas', args);
  },
});

const findBrandMatchesTool = tool({
  name: 'find_brand_matches',
  description: "Generate fresh brand match recommendations tailored to the creator's persona and niche. Call when the user asks for brand matches, who to pitch, brand recommendations, or refines a previous list (e.g. 'show me 4 more', 'try a different angle'). The UI renders the result as inline brand cards in the chat with Draft Pitch action.",
  parameters: z.object({
    theme: z.string().nullable().optional().describe('Optional category/angle filter, e.g. "luxury beauty" or "sustainable fashion".'),
    count: z.number().int().nullable().optional().describe('Number of brand matches. Default 4. Max 6.'),
    exclude: z.array(z.string()).nullable().optional().describe('Brand names to exclude (already shown). Pass when the user wants more matches different from a prior list.'),
  }),
  async execute(args, runContext) {
    return runContext.context.executeToolByName('find_brand_matches', args);
  },
});

// ── Pipeline tools ──────────────────────────────────────────────────────────
// Writes to Supabase creator_deals with the user's session JWT (passed via
// runContext.context.accessToken) so RLS validates auth.uid() = the creator.
// No service-role key needed.
const SUPABASE_REST_URL = 'https://ctohycrbzennyzgffodo.supabase.co/rest/v1';
const SUPABASE_ANON_KEY_PUB = 'sb_publishable_MsXw1OuEe9ZTBnSU8LSHwA_X19dr90J';

async function createOutreachDealRemote(args, ctx) {
  const accessToken = ctx?.accessToken;
  const userId = ctx?.userId;
  if (!accessToken || !userId) {
    return { error: 'not_signed_in', message: 'Creator must sign in before deals can be tracked.' };
  }
  const row = {
    user_id: userId,
    brand_name: String(args.brand_name || '').trim(),
    brand_domain: args.brand_domain ? String(args.brand_domain).replace(/^https?:\/\//, '').replace(/\/$/, '') : null,
    status: 'outreach',
    platform: args.platform || null,
    deliverable: args.deliverable || null,
    amount_usd: Number(args.amount_usd) || 0,
    notes: args.notes || null,
  };
  if (!row.brand_name) return { error: 'invalid', message: 'brand_name is required.' };

  const r = await fetch(`${SUPABASE_REST_URL}/creator_deals`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: SUPABASE_ANON_KEY_PUB,
      Authorization: `Bearer ${accessToken}`,
      Prefer: 'return=representation',
    },
    body: JSON.stringify(row),
  });
  if (!r.ok) {
    const errText = await r.text().catch(() => r.statusText);
    return { error: 'insert_failed', status: r.status, details: errText.slice(0, 300) };
  }
  const data = await r.json().catch(() => null);
  const created = Array.isArray(data) ? data[0] : data;
  return {
    status: 'created',
    deal_id: created?.id || null,
    brand_name: row.brand_name,
    stage: 'outreach',
    message: `Added ${row.brand_name} to your pipeline as an Outreach deal.`,
  };
}

const createOutreachDealTool = tool({
  name: 'create_outreach_deal',
  description: "Add a brand to the creator's pipeline as an Outreach deal. Call this when the creator wants to track a brand they've decided to pitch — e.g. after seeing brand matches, after drafting/sending a pitch, or when they say 'add X to my pipeline'. Don't ask permission; the creator is in their own pipeline tool.",
  parameters: z.object({
    brand_name: z.string().describe('Brand name (required).'),
    brand_domain: z.string().nullable().optional().describe('Brand website domain like "gymshark.com" — no protocol.'),
    platform: z.enum(['Instagram', 'TikTok', 'YouTube', 'Other']).nullable().optional(),
    deliverable: z.string().nullable().optional().describe("e.g. 'Reel', 'Static', 'Carousel', 'Story set', 'TikTok video', 'Full bundle'"),
    amount_usd: z.number().nullable().optional().describe('Expected deal value in USD if known.'),
    notes: z.string().nullable().optional(),
  }),
  async execute(args, runContext) {
    return createOutreachDealRemote(args, runContext.context);
  },
});

const TOOL_REGISTRY = {
  get_rate_estimate:       { tool: rateEstimateTool,         agents: ['main', 'create', 'pitch', 'pipeline'] },
  compare_offer:           { tool: compareOfferTool,         agents: ['main', 'create', 'pitch', 'pipeline'] },
  generate_content_ideas:  { tool: generateContentIdeasTool, agents: ['main', 'create'] },
  find_brand_matches:      { tool: findBrandMatchesTool,     agents: ['main', 'pitch'] },
  create_outreach_deal:    { tool: createOutreachDealTool,   agents: ['pipeline'] },
};

// ── Specialist delegation (agents-as-tools) ─────────────────────────────────
// Replaces the SDK's handoff primitive. Specialists are exposed as
// `delegate_<name>` tools the calling agent invokes inline; the specialist
// runs non-streaming inside the calling agent's turn and its final text +
// any card-bearing tool outputs come back as the tool result. The outer
// SSE wrapper detects `delegate_*` events and emits `agent_step` events to
// the frontend so users see a "Pitch agent · working…" thinking row instead
// of being yanked into a separate thread.
const DELEGATE_LABELS = {
  pitch:    'Pitch agent · working with creator voice',
  create:   'Create agent · brainstorming',
  pipeline: 'Pipeline agent · saving to your deals',
};

function makeDelegateTool(agentName, agents) {
  return tool({
    name: `delegate_${agentName}`,
    description: AGENT_HANDOFF_DESCRIPTIONS[agentName],
    parameters: z.object({
      brief: z.string().describe(`What the ${agentName} specialist should do — quote the user's request verbatim plus any context already gathered (brand names, deliverables, prior pitch drafts, etc).`),
    }),
    async execute({ brief }, runContext) {
      const specialist = agents[agentName];
      if (!specialist) return { response: `(${agentName} specialist unavailable)` };
      try {
        const subResult = await run(
          specialist,
          [{ role: 'user', content: brief }],
          { stream: false, maxTurns: 3, context: runContext.context }
        );
        // Aggregate any card-producing outputs from the sub-run so the
        // parent SSE wrapper can render brand/idea cards inline. Without
        // this, specialists lose their card UI when called as tools.
        let brands = [], ideas = [];
        for (const item of (subResult.newItems || [])) {
          const out = item?.output ?? item?.rawItem?.output;
          let parsed = out;
          if (typeof parsed === 'string') {
            try { parsed = JSON.parse(parsed); } catch {}
          }
          if (parsed && typeof parsed === 'object') {
            if (Array.isArray(parsed.brands) && parsed.brands.length) brands = parsed.brands;
            if (Array.isArray(parsed.ideas) && parsed.ideas.length) ideas = parsed.ideas;
          }
        }
        const text = String(subResult.finalOutput || '').trim();
        return { response: text, brands, ideas };
      } catch (err) {
        console.error(`[agents] delegate_${agentName} failed`, err);
        return { response: `(${agentName} specialist hit an error: ${String(err && err.message || err)})` };
      }
    },
  });
}

// Specialist instruction blocks. Used in two paths:
//   1. As fallback when an agent runs as the active tool but the frontend
//      didn't send a tool-specific instructions string.
//   2. Always when an agent is invoked via delegate_<name> from another
//      agent — concatenated with sharedAgentContext (creator facts +
//      identity) so the specialist isn't a bare LLM with a tool list.
//
// Each block is written to be self-contained at the role level — voice,
// tool routing rules, output format — but assumes a `--- What you know
// about this creator ---` block precedes it (provided by sharedAgentContext).
const PITCH_AGENT_INSTRUCTIONS = `You are the Pitch specialist. You handle brand discovery, pitch-email drafting, rate analysis, and outreach strategy. Ground every recommendation in the creator facts above — cite real follower counts, engagement, and niche.

When invoked:

BRAND DISCOVERY: If asked for brand matches or "more brands like X", call find_brand_matches with theme + count + exclude. After it returns, reply with ONE short sentence — the frontend renders cards inline. Do not list brand names in prose.

PITCH DRAFTING: When asked to draft a pitch for a specific brand, write a complete cold-outreach email in the creator's authentic voice, formatted EXACTLY:

Subject: <one short, specific line>

<3-5 short plaintext paragraphs, no markdown. Line 1: creator + niche + one metric. Line 2: brand's aesthetic/program if known. Line 3: a concrete concept idea. Line 4: the ask. Sign off with the creator's first name.>

No preamble, no "Here's the pitch:" lead-in, no markdown bolding. Start directly with "Subject:" — the frontend detects this format to attach a one-click Gmail send button.

RATES & OFFERS: For pricing questions, call get_rate_estimate. For specific dollar offers, call compare_offer. Report the range plus peer median if present, and frame as a benchmark, not "your rate." Never quote a number you didn't get from a tool.

GMAIL: When the creator says "send it" / "fire it off", call send_gmail_message immediately with the most recent subject/body/recipient — never draft, never re-ask for confirmation. Available MCP tools: search_gmail_messages, get_gmail_message_content, get_gmail_thread_content, send_gmail_message. NEVER call draft_gmail_message (403s on insufficient scope). Writing "I sent the email" without firing the tool is LYING.`;

const CREATE_AGENT_INSTRUCTIONS = `You are the Create specialist. You handle content ideation, format experimentation, and pillar-aligned brainstorming. Ground every suggestion in the creator's pillars, vibes, and recent themes above.

When invoked:

IDEATION: If asked for ideas / brainstorming / what to post, call generate_content_ideas with theme + count. Reply with ONE short sentence — the frontend renders cards inline. Do not list ideas in prose.

REFINEMENT: If asked to riff on a previous batch ("more like #2", "different angle"), call generate_content_ideas again with a refined theme. Build on the prior batch, don't restart from scratch.

QUICK QUESTIONS: For single-shot questions ("what hook should I open with?"), answer directly without tools, grounded in their pillars and recent themes.

Specifics over generics — concrete formats the creator can ship today, not abstract advice. Match their voice (vibes + bio).`;

const PIPELINE_AGENT_INSTRUCTIONS = `You are the Pipeline specialist. You manage the creator's deal flow (creator_deals table). You're invoked as a tool by other agents — typically when the creator wants to track a brand they're pitching.

When called:
1. Look at the most recent brand context in the conversation (cards rendered, brand mentioned, pitch drafted).
2. Call create_outreach_deal with brand_name and any other fields you can infer.
3. Reply in ONE short sentence confirming what you did (e.g. "Added Faherty to your Outreach column.").

Do not ask clarifying questions if the brand is obvious from context. Do not list the deal details — the kanban view shows them.`;

const MAIN_AGENT_INSTRUCTIONS = `You are the main CreatorClaw assistant. You answer general creator-OS questions and route specialized work to the Pitch, Create, and Pipeline specialists via delegate_* tools.

Delegate when:
- delegate_pitch — creator wants to draft an outreach email, find brand matches, send a pitch via Gmail, or analyze a rate/offer.
- delegate_create — creator wants content ideas, brainstorming, or pillar-grounded ideation.
- delegate_pipeline — creator wants to add a brand to their pipeline / deal tracker.

Specialists run inline in this thread — never tell the user to switch tools or "head over" anywhere. When delegate_pitch returns a response that begins with "Subject:", output the entire response verbatim with NO preamble.`;

const AGENT_INSTRUCTION_FALLBACKS = {
  main: MAIN_AGENT_INSTRUCTIONS,
  create: CREATE_AGENT_INSTRUCTIONS,
  pitch: PITCH_AGENT_INSTRUCTIONS,
  pipeline: PIPELINE_AGENT_INSTRUCTIONS,
};

// Tool descriptions shown to a calling agent when it considers invoking a
// specialist via delegate_<name>. Keep these directive — the calling agent
// uses these to decide *when* to delegate.
const AGENT_HANDOFF_DESCRIPTIONS = {
  pipeline: "Add a brand to the creator's pipeline / deal-tracker. Use when the creator wants to start tracking a brand or save a pitch as a deal.",
  pitch: "Find brand matches, draft cold-outreach emails, or send pitches via Gmail. Use when the creator wants to discover new brands or write/send a pitch. Returns a `response` field — if it begins with 'Subject:', output the entire response verbatim to the user with no preamble.",
  create: "Generate fresh content ideas and ideation. Use when the creator wants ideas, brainstorming, or content planning.",
  main: "General CreatorClaw assistant for anything else.",
};

// Build all four agents and wire handoffs between them. Cheap (no LLM calls);
// done per request so the active agent's instructions can come from the
// frontend's tool-specific system prompt.
//
// Args:
//   activeName: which agent the user is currently chatting with — gets the
//     full frontend system prompt (identity + creator facts + tool-specific
//     rules + style).
//   frontendInstructions: the active agent's full system prompt from the
//     browser. Already includes sharedAgentContext.
//   googleMcp: optional hostedMcpTool. Added to main/pitch/pipeline when
//     the creator has connected Google Workspace. Create stays ideation-only.
//   sharedAgentContext: identity + creator facts + style block, sent
//     separately by the frontend so non-active specialists can be grounded
//     in the same creator data when invoked via delegate_*. Without this,
//     a delegated specialist would run with only its bare role-specific
//     instructions and hallucinate metrics.
function buildAgentSet(activeName, frontendInstructions, googleMcp, sharedAgentContext) {
  // Cost optimization: gpt-4o-mini is reliable enough for our function
  // tools (rate, brands, ideas, deal-creation), but it hallucinated tool
  // calls under hostedMcpTool (claimed "email sent" without firing the
  // tool). Upgrade to gpt-4o only for agents that actually have the
  // hosted MCP attached. Disconnected users + Create-only flows stay on
  // mini (~10x cheaper).
  const make = (name, attachGoogleMcp, extraTools) => {
    const tools = Object.values(TOOL_REGISTRY)
      .filter(reg => reg.agents.includes(name))
      .map(reg => reg.tool);
    const willAttachMcp = attachGoogleMcp && !!googleMcp;
    if (willAttachMcp) tools.push(googleMcp);
    if (Array.isArray(extraTools)) for (const t of extraTools) if (t) tools.push(t);
    let instructions;
    if (name === activeName && frontendInstructions) {
      instructions = frontendInstructions;
    } else {
      const persona = AGENT_INSTRUCTION_FALLBACKS[name];
      instructions = sharedAgentContext
        ? `${sharedAgentContext}\n\n--- Your role on this turn ---\n${persona}`
        : persona;
    }
    return new Agent({
      name: name === 'main' ? 'CreatorClaw' : `CreatorClaw-${name}`,
      model: willAttachMcp ? 'gpt-4o' : 'gpt-4o-mini',
      instructions,
      handoffDescription: AGENT_HANDOFF_DESCRIPTIONS[name],
      tools,
    });
  };
  // Specialist delegations are wired as tools rather than SDK handoffs so the
  // calling agent stays in the conversation thread. The delegate tools close
  // over the `agents` map and resolve the specialist at call time, so we can
  // declare them before the specialists themselves are constructed.
  const agents = {};
  const delegatePitch    = makeDelegateTool('pitch',    agents);
  const delegateCreate   = makeDelegateTool('create',   agents);
  const delegatePipeline = makeDelegateTool('pipeline', agents);

  agents.main     = make('main',     true,  [delegatePitch, delegateCreate, delegatePipeline]);
  agents.create   = make('create',   false, [delegatePitch, delegatePipeline]);
  agents.pitch    = make('pitch',    true,  [delegateCreate, delegatePipeline]);
  agents.pipeline = make('pipeline', true);  // leaf — no further delegations
  return agents;
}

// Convert OpenAI-shape messages from the frontend into the SDK's input shape.
// First system message becomes `instructions`; user/assistant messages pass
// through. Tool messages (from prior turns) are dropped since the SDK manages
// its own tool history; for now we rely on the conversation summary in the
// surrounding text, not on tool-result replay.
function shapeMessages(messages) {
  const list = Array.isArray(messages) ? messages : [];
  const systemMsg = list.find(m => m && m.role === 'system');
  const convo = list
    .filter(m => m && (m.role === 'user' || m.role === 'assistant'))
    .map(m => {
      const text = String(m.content || '');
      if (!text) return null;
      // Assistant messages MUST use the array-of-content-parts shape.
      // SDK's input validator rejects strings on assistant role and the
      // failure mode is opaque ("item.content.map is not a function") on
      // multi-agent runs where the history gets replayed.
      if (m.role === 'assistant') {
        return { role: 'assistant', status: 'completed', content: [{ type: 'output_text', text }] };
      }
      return { role: 'user', content: text };
    })
    .filter(Boolean);
  return { instructions: systemMsg?.content || null, convo };
}

export async function handleAgentChat(request, env, body, cors, deps) {
  setupOpenAIEnv(env);
  const activeTool = (body.tool && ['main', 'create', 'pitch'].includes(body.tool)) ? body.tool : 'main';
  console.log('[agents]', activeTool, 'turn');

  const { instructions, convo } = shapeMessages(body.messages);
  if (!convo.length) {
    return errorJSON('no_input', new Error('messages must include at least one user/assistant message'), cors, 400);
  }
  if (!deps || typeof deps.executeToolByName !== 'function') {
    return errorJSON('config', new Error('handleAgentChat requires deps.executeToolByName'), cors, 500);
  }

  const cc = body.creatorContext || {};

  // hostedMcpTool requires the Responses API. Switch the SDK once.
  ensureResponsesApi();

  // If the creator has connected Google Workspace, build a hostedMcpTool
  // that pushes the MCP round-trip to OpenAI's servers. No local connection
  // lifecycle to manage — it's just a tool definition.
  const googleMcp = buildGoogleMcpTool(deps.googleAccessToken);

  // Append runtime context the frontend can't easily bake into the prompt:
  // user's IANA timezone (Calendar API rejects events without it, and lands
  // in UTC if the LLM omits the right param) and today's date (so "tomorrow
  // at 9am" can be resolved).
  const tz = cc.timezone || 'UTC';
  const today = new Date().toISOString().slice(0, 10);
  const runtimeCtx =
    `\n\nRUNTIME CONTEXT (current as of this turn):\n` +
    `- Today's date (UTC): ${today}\n` +
    `- User's IANA timezone: ${tz}\n` +
    `\nCALENDAR EVENT TIMEZONE RULES (manage_event with action="create" or "update"):\n` +
    `- Pass timezone as a TOP-LEVEL parameter: timezone="${tz}". Do NOT nest it inside start_time or end_time.\n` +
    `- Pass start_time and end_time as naive ISO strings WITHOUT offset, e.g. start_time="2026-04-30T09:00:00", end_time="2026-04-30T10:00:00".\n` +
    `- DO NOT append "Z" or any "+HH:MM" offset to start_time/end_time when you also pass timezone — that double-encodes and causes UTC drift.\n` +
    `- All three (timezone, start_time, end_time) MUST be supplied for create/update actions or events land in UTC and appear at the wrong wall-clock time.`;

  // sharedAgentContext from the frontend = identity + creator facts + style.
  // Always-on grounding for every specialist (including delegated ones) so
  // they cite the creator's real metrics instead of hallucinating.
  const sharedAgentContext = (body.sharedAgentContext || '') + runtimeCtx;
  const agents = buildAgentSet(activeTool, (instructions || '') + runtimeCtx, googleMcp, sharedAgentContext);
  const startAgent = agents[activeTool] || agents.main;
  const runCtx = {
    creatorContext: cc,
    env,
    executeToolByName: deps.executeToolByName,
    accessToken: cc.accessToken || null,
    userId: cc.userId || null,
  };

  try {
    const result = await run(startAgent, convo, { stream: true, maxTurns: 10, context: runCtx });
    return sseWrapAgentRun(result, cors);
  } catch (err) {
    console.error('[agents] run failed', err);
    return errorJSON('agent_run_failed', err, cors);
  }
}

// Wrap a streaming agent run as OpenAI-shaped SSE so the existing frontend
// parser (`data: {choices:[{delta:{content:'...'}}]}`) just works.
//
// Tool-card duplication guard: when the model calls a card-producing tool,
// we suppress further text deltas (so the model can't list the same items
// in prose) and emit a deterministic acknowledgement at the end. Pre-tool
// text streams normally — gives a natural "Looking for brand matches…"
// lead-in before cards render.
function sseWrapAgentRun(result, corsHeaders) {
  const encoder = new TextEncoder();
  const { readable, writable } = new TransformStream();
  const writer = writable.getWriter();

  const writeEvent = (obj) => writer.write(encoder.encode(`data: ${JSON.stringify(obj)}\n\n`));
  const writeContent = (text) => writeEvent({ choices: [{ delta: { content: text } }] });

  (async () => {
    let renderMetadata = null;
    let bufferingPostTool = false;       // flipped on by tool_called
    let postToolBuffer = '';             // text deltas after a tool call
    let liveStreamed = '';               // text we already wrote to the wire (pre-tool)
    let finalMessageText = '';           // assembled from message_output_created events — fallback if deltas don't fire (e.g. post-handoff)
    let toolFired = false;
    let lastToolOutput = null;
    // Specialist delegation tracking. tool_called and tool_output pair up
    // sequentially so we can match started/finished by stashing the active
    // step on the next call and clearing it on the next output.
    let stepCounter = 0;
    let activeDelegateStep = null;
    try {
      for await (const event of result) {
        // Diagnostic: log every event type + name so we can see whether
        // hostedMcpTool calls fire as tool_called events or something else.
        try {
          if (event.type === 'run_item_stream_event') {
            const itemType = event.item?.type || event.item?.constructor?.name || 'unknown';
            const toolName = event.item?.rawItem?.name || event.item?.name || '';
            console.log('[agents-evt]', event.name, itemType, toolName);
          }
        } catch {}
        // Text deltas from the model
        if (event.type === 'raw_model_stream_event') {
          const d = event.data;
          if (d && d.type === 'output_text_delta' && d.delta) {
            if (bufferingPostTool) {
              postToolBuffer += d.delta;
            } else {
              liveStreamed += d.delta;
              await writeContent(d.delta);
            }
          }
        }
        else if (event.type === 'run_item_stream_event' && event.name === 'tool_called') {
          bufferingPostTool = true;
          toolFired = true;
          // Texture for delegate_* tools: emit a started agent_step event
          // so the UI can render an inline "Pitch agent · …" thinking row.
          const toolName = event.item?.rawItem?.name || event.item?.name || '';
          if (toolName.startsWith('delegate_')) {
            const agentName = toolName.replace(/^delegate_/, '');
            const stepId = `step-${++stepCounter}`;
            activeDelegateStep = { stepId, agentName };
            await writeEvent({ choices: [{ delta: { agent_step: {
              type: 'started',
              id: stepId,
              agent: agentName,
              label: DELEGATE_LABELS[agentName] || `${agentName} agent · working`,
            } } }] });
          }
        }
        else if (event.type === 'run_item_stream_event' && event.name === 'tool_output' && event.item) {
          const output = event.item?.output ?? event.item?.rawItem?.output;
          let parsed = output;
          if (typeof parsed === 'string') {
            try { parsed = JSON.parse(parsed); } catch {}
          }
          lastToolOutput = parsed;
          if (parsed && typeof parsed === 'object') {
            if (Array.isArray(parsed.brands) && parsed.brands.length) {
              renderMetadata = renderMetadata || {};
              renderMetadata.cards = { type: 'brand_matches', items: parsed.brands };
            } else if (Array.isArray(parsed.ideas) && parsed.ideas.length) {
              renderMetadata = renderMetadata || {};
              renderMetadata.cards = { type: 'pulse_ideas', items: parsed.ideas };
            }
          }
          // Pair the most recent delegate_* tool_called with this tool_output.
          if (activeDelegateStep) {
            await writeEvent({ choices: [{ delta: { agent_step: {
              type: 'finished',
              id: activeDelegateStep.stepId,
              agent: activeDelegateStep.agentName,
            } } }] });
            activeDelegateStep = null;
          }
        }
        // Final assistant message — captures full text. Used as fallback
        // when post-handoff agents don't fire output_text_delta deltas.
        else if (event.type === 'run_item_stream_event' && event.name === 'message_output_created' && event.item) {
          const content = event.item?.rawItem?.content;
          if (Array.isArray(content)) {
            for (const part of content) {
              if (part?.type === 'output_text' && part.text) {
                finalMessageText += part.text;
              }
            }
          }
        }
      }
      await result.completed;

      // Decide what to emit at the end. Priorities:
      //  1. Cards rendered → deterministic acknowledgement (replaces post-tool prose).
      //  2. Buffered post-tool text → flush it.
      //  3. Nothing live-streamed but message_output_created has text → emit it
      //     (covers the post-handoff case where deltas don't fire).
      //  4. Tool fired but produced no usable text anywhere → minimal ack.
      if (renderMetadata?.cards?.type === 'brand_matches') {
        const n = renderMetadata.cards.items?.length || 0;
        await writeContent(`Here ${n === 1 ? 'is 1 brand' : `are ${n} brands`} that fit your audience — tap **Draft Pitch** on any of them.`);
      } else if (renderMetadata?.cards?.type === 'pulse_ideas') {
        const n = renderMetadata.cards.items?.length || 0;
        await writeContent(`Here ${n === 1 ? 'is 1 idea' : `are ${n} ideas`} tuned to your pillars — tap **Schedule** or **Script** on any card.`);
      } else if (postToolBuffer) {
        await writeContent(postToolBuffer);
      } else if (!liveStreamed && finalMessageText) {
        await writeContent(finalMessageText);
      } else if (!liveStreamed && toolFired) {
        // Last-ditch fallback — pull a useful message from the tool output.
        // delegate_<name> tools return { response, brands, ideas }; surface
        // the response field so specialist output reaches the user even if
        // the calling agent didn't narrate after the tool call.
        let msg = '(action complete)';
        if (lastToolOutput && typeof lastToolOutput === 'object') {
          if (lastToolOutput.response) msg = String(lastToolOutput.response);
          else if (lastToolOutput.message) msg = String(lastToolOutput.message);
        }
        await writeContent(msg);
      }

      if (renderMetadata) {
        await writeEvent({ choices: [{ delta: { metadata: renderMetadata } }] });
      }
      await writer.write(encoder.encode('data: [DONE]\n\n'));
      console.log('[agents] done', JSON.stringify({
        liveStreamedLen: liveStreamed.length,
        bufferLen: postToolBuffer.length,
        finalMsgLen: finalMessageText.length,
        toolFired,
        cards: renderMetadata?.cards?.type || null,
      }));
    } catch (err) {
      console.error('[agents] stream error', err);
      try {
        await writeEvent({ error: { message: String((err && err.message) || err) } });
        await writer.write(encoder.encode('data: [DONE]\n\n'));
      } catch {}
    } finally {
      try { await writer.close(); } catch {}
    }
  })();

  return new Response(readable, {
    status: 200,
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      ...corsHeaders,
    },
  });
}

function errorJSON(code, err, cors, status = 500) {
  return new Response(
    JSON.stringify({
      error: code,
      message: String((err && err.message) || err),
      stack: String((err && err.stack) || '').slice(0, 2000),
    }, null, 2),
    { status, headers: { 'Content-Type': 'application/json', ...cors } }
  );
}
