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

const TOOL_REGISTRY = {
  get_rate_estimate:       { tool: rateEstimateTool,         agents: ['main', 'create', 'pitch'] },
  compare_offer:           { tool: compareOfferTool,         agents: ['main', 'create', 'pitch'] },
  generate_content_ideas:  { tool: generateContentIdeasTool, agents: ['main', 'create'] },
  find_brand_matches:      { tool: findBrandMatchesTool,     agents: ['main', 'pitch'] },
  send_pitch_email:        { tool: sendPitchEmailTool,       agents: ['main', 'pitch'] },
};

function buildAgent(toolName, instructions) {
  // Pick tools whose registry entry says they belong to this agent.
  const agentTools = Object.values(TOOL_REGISTRY)
    .filter(reg => reg.agents.includes(toolName))
    .map(reg => reg.tool);
  return new Agent({
    name: toolName === 'main' ? 'CreatorClaw' : `CreatorClaw-${toolName}`,
    model: 'gpt-4o-mini',
    instructions: instructions || 'You are CreatorClaw, a helpful creator-OS assistant.',
    tools: agentTools,
  });
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
    .map(m => ({ role: m.role, content: String(m.content || '') }))
    .filter(m => m.content);
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

  const agent = buildAgent(activeTool, instructions);
  const runCtx = {
    creatorContext: body.creatorContext || {},
    env,
    executeToolByName: deps.executeToolByName,
  };

  try {
    const result = await run(agent, convo, { stream: true, maxTurns: 4, context: runCtx });
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
    let bufferingPostTool = false;     // flipped on by tool_called
    let postToolBuffer = '';           // text deltas after a tool call (held back, not dropped)
    try {
      for await (const event of result) {
        // Text deltas from the model
        if (event.type === 'raw_model_stream_event') {
          const d = event.data;
          if (d && d.type === 'output_text_delta' && d.delta) {
            if (bufferingPostTool) {
              postToolBuffer += d.delta;  // hold — flush or replace at end
            } else {
              await writeContent(d.delta);
            }
          }
        }
        // Tool was invoked — start buffering subsequent text. We can't know
        // yet whether the tool will produce cards (and thus whether to drop
        // the post-tool prose) until the tool_output arrives, so we buffer
        // and decide at the end of the run.
        else if (event.type === 'run_item_stream_event' && event.name === 'tool_called') {
          bufferingPostTool = true;
        }
        // Tool outputs — capture card-shaped results for the metadata channel
        else if (event.type === 'run_item_stream_event' && event.name === 'tool_output' && event.item) {
          const output = event.item?.output ?? event.item?.rawItem?.output;
          let parsed = output;
          if (typeof parsed === 'string') {
            try { parsed = JSON.parse(parsed); } catch {}
          }
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
      }
      await result.completed;

      // Three cases at end of run:
      // 1. Cards rendered → drop the buffered prose, emit deterministic line.
      // 2. Tool fired but no cards (rate estimate, Gmail send, tool error)
      //    → flush the buffer so the user sees the model's reply.
      // 3. No tool fired → buffer is empty, nothing extra to do.
      if (renderMetadata?.cards?.type === 'brand_matches') {
        const n = renderMetadata.cards.items?.length || 0;
        await writeContent(`Here ${n === 1 ? 'is 1 brand' : `are ${n} brands`} that fit your audience — tap **Draft Pitch** on any of them.`);
      } else if (renderMetadata?.cards?.type === 'pulse_ideas') {
        const n = renderMetadata.cards.items?.length || 0;
        await writeContent(`Here ${n === 1 ? 'is 1 idea' : `are ${n} ideas`} tuned to your pillars — tap **Schedule** or **Script** on any card.`);
      } else if (postToolBuffer) {
        await writeContent(postToolBuffer);
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
