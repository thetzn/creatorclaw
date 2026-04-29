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

import { Agent, run, tool } from '@openai/agents';
import { z } from 'zod';

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
// math, peer-aggregate fetching, sub-LLM JSON generation, and Arcade Gmail
// plumbing — the SDK is just the orchestration layer.

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

const sendPitchEmailTool = tool({
  name: 'send_pitch_email',
  description: "Send an email from the creator's connected Gmail. Requires the creator to have connected Gmail via Arcade. If the account isn't connected, this returns a one-time authorization URL the user must visit. Call this when the user has asked you to send a pitch/outreach/email on their behalf (not just draft — actually send).",
  parameters: z.object({
    to: z.string().describe('Recipient email address.'),
    subject: z.string().describe('Email subject line.'),
    body: z.string().describe('Plain-text email body.'),
  }),
  async execute(args, runContext) {
    return runContext.context.executeToolByName('send_pitch_email', args);
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
  send_pitch_email:        { tool: sendPitchEmailTool,       agents: ['main', 'pitch'] },
  create_outreach_deal:    { tool: createOutreachDealTool,   agents: ['pipeline'] },
};

// Static instructions for the pipeline specialist. Used when handed off from
// another agent. The instructions tell it to act fast — one tool call, one
// short confirmation — so handoffs don't drag the conversation off-topic.
const PIPELINE_AGENT_INSTRUCTIONS = `You are CreatorClaw's Pipeline specialist. You manage the creator's deal flow (creator_deals table). You are invoked via handoff from other agents — typically when the creator wants to track a brand they're pitching.

When called:
1. Look at the most recent brand context in the conversation (cards rendered, brand mentioned, pitch drafted).
2. Call create_outreach_deal with the brand_name and any other fields you can infer.
3. Reply in ONE short sentence confirming what you did (e.g. "Added Faherty to your Outreach column.").

Do not ask clarifying questions if the brand is obvious from context. Do not list the deal details — the kanban view shows them.`;

const AGENT_INSTRUCTION_FALLBACKS = {
  main: 'You are CreatorClaw, a helpful creator-OS assistant.',
  create: 'You are CreatorClaw\'s Create agent. Focus on content ideation.',
  pitch: 'You are CreatorClaw\'s Pitch agent. Focus on brand discovery and outreach.',
  pipeline: PIPELINE_AGENT_INSTRUCTIONS,
};

const AGENT_HANDOFF_DESCRIPTIONS = {
  pipeline: 'Adds a brand to the creator\'s pipeline / deal-tracker. Hand off when the creator wants to start tracking a brand or save a pitch as a deal.',
  pitch: 'Finds brand matches, drafts cold-outreach emails, sends pitches via Gmail. Hand off when the creator wants to find new brands or write/send pitches.',
  create: 'Generates fresh content ideas and ideation. Hand off when the creator wants ideas, brainstorming, or content planning.',
  main: 'General CreatorClaw assistant for anything else.',
};

// Build all four agents and wire handoffs between them. Cheap (no LLM calls);
// done per request so the active agent's instructions can come from the
// frontend's tool-specific system prompt.
function buildAgentSet(activeName, frontendInstructions) {
  const make = (name) => {
    const tools = Object.values(TOOL_REGISTRY)
      .filter(reg => reg.agents.includes(name))
      .map(reg => reg.tool);
    const instructions = name === activeName && frontendInstructions
      ? frontendInstructions
      : AGENT_INSTRUCTION_FALLBACKS[name];
    return new Agent({
      name: name === 'main' ? 'CreatorClaw' : `CreatorClaw-${name}`,
      model: 'gpt-4o-mini',
      instructions,
      handoffDescription: AGENT_HANDOFF_DESCRIPTIONS[name],
      tools,
    });
  };
  const agents = {
    main: make('main'),
    create: make('create'),
    pitch: make('pitch'),
    pipeline: make('pipeline'),
  };
  // Handoff topology: every agent can reach pipeline; main can route into
  // any specialist; create/pitch can hand back to each other for cross-tool
  // questions. Pipeline doesn't hand off — it's a one-shot specialist.
  agents.main.handoffs    = [agents.create, agents.pitch, agents.pipeline];
  agents.create.handoffs  = [agents.pitch, agents.pipeline];
  agents.pitch.handoffs   = [agents.create, agents.pipeline];
  agents.pipeline.handoffs = [];
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
  const agents = buildAgentSet(activeTool, instructions);
  const startAgent = agents[activeTool] || agents.main;
  const runCtx = {
    creatorContext: cc,
    env,
    executeToolByName: deps.executeToolByName,
    // Surfaced so pipeline tools can hit Supabase REST under RLS.
    accessToken: cc.accessToken || null,
    userId: cc.userId || null,
  };

  try {
    const result = await run(startAgent, convo, { stream: true, maxTurns: 6, context: runCtx });
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
    try {
      for await (const event of result) {
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
        // Last-ditch fallback — pull a useful message from the tool output if available.
        const msg = (lastToolOutput && typeof lastToolOutput === 'object' && lastToolOutput.message)
          ? String(lastToolOutput.message)
          : '(action complete)';
        await writeContent(msg);
      }

      if (renderMetadata) {
        await writeEvent({ choices: [{ delta: { metadata: renderMetadata } }] });
      }
      await writer.write(encoder.encode('data: [DONE]\n\n'));
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
