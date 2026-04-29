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
// Phase 1 starting point: main agent has no tools yet. Subsequent commits
// add rate tools, generate_content_ideas, find_brand_matches, send_pitch_email.
const TOOL_REGISTRY = {
  // Filled in by Commits B-E. Each entry: tool name → { tool, agents: ['main'|'create'|'pitch'] }
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

export async function handleAgentChat(request, env, body, cors) {
  setupOpenAIEnv(env);
  const activeTool = (body.tool && ['main', 'create', 'pitch'].includes(body.tool)) ? body.tool : 'main';
  console.log('[agents]', activeTool, 'turn');

  const { instructions, convo } = shapeMessages(body.messages);
  if (!convo.length) {
    return errorJSON('no_input', new Error('messages must include at least one user/assistant message'), cors, 400);
  }

  const agent = buildAgent(activeTool, instructions);

  try {
    const result = await run(agent, convo, { stream: true, maxTurns: 4 });
    return sseWrapAgentRun(result, cors);
  } catch (err) {
    console.error('[agents] run failed', err);
    return errorJSON('agent_run_failed', err, cors);
  }
}

// Wrap a streaming agent run as OpenAI-shaped SSE so the existing frontend
// parser (`data: {choices:[{delta:{content:'...'}}]}`) just works.
function sseWrapAgentRun(result, corsHeaders) {
  const encoder = new TextEncoder();
  const { readable, writable } = new TransformStream();
  const writer = writable.getWriter();

  (async () => {
    let renderMetadata = null;
    try {
      for await (const event of result) {
        // Text deltas from the model
        if (event.type === 'raw_model_stream_event') {
          const d = event.data;
          if (d && d.type === 'output_text_delta' && d.delta) {
            const ev = `data: ${JSON.stringify({ choices: [{ delta: { content: d.delta } }] })}\n\n`;
            await writer.write(encoder.encode(ev));
          }
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
      if (renderMetadata) {
        const metaEv = `data: ${JSON.stringify({ choices: [{ delta: { metadata: renderMetadata } }] })}\n\n`;
        await writer.write(encoder.encode(metaEv));
      }
      await writer.write(encoder.encode('data: [DONE]\n\n'));
    } catch (err) {
      console.error('[agents] stream error', err);
      try {
        const errEv = `data: ${JSON.stringify({ error: { message: String((err && err.message) || err) } })}\n\n`;
        await writer.write(encoder.encode(errEv));
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
