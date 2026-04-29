// ─────────────────────────────────────────────────────────────────────────────
// Agents SDK migration spike.
//
// Purpose: prove `@openai/agents` runs on Cloudflare Workers (with
// `nodejs_compat`) end-to-end. Nothing user-facing — only reachable via
// `/v1/agents/test` on the deployed Worker. Once green, Phase 1 of the
// migration replaces the hand-rolled tool-call loop in worker.js with
// SDK-driven agents.
//
// Reference: https://openai.github.io/openai-agents-js/
// ─────────────────────────────────────────────────────────────────────────────

import { Agent, run, tool } from '@openai/agents';
import { z } from 'zod';

// One toy tool to exercise the tool-call path. Uses zod for schema (required
// by the SDK) and an async execute body that returns a string.
const echoTool = tool({
  name: 'echo',
  description: 'Echoes the input string back, prefixed with [echo].',
  parameters: z.object({
    text: z.string().describe('Text to echo.'),
  }),
  async execute({ text }) {
    return `[echo] ${text}`;
  },
});

// Single hello-world agent. gpt-4o-mini matches our existing model so
// usage/cost shape stays familiar.
let _agent = null;
function getAgent() {
  if (_agent) return _agent;
  _agent = new Agent({
    name: 'SpikeAgent',
    model: 'gpt-4o-mini',
    instructions:
      'You are a test agent for SDK validation. When the user sends anything, call the echo tool exactly once with their message, then say "spike OK" and stop.',
    tools: [echoTool],
  });
  return _agent;
}

// Spike handler. Streams text back through a Web ReadableStream — the same
// shape we eventually want to wrap in our existing SSE envelope.
export async function handleAgentsSpike(req, env, cors) {
  // Make the SDK pick up our existing API key. Library reads OPENAI_API_KEY
  // from the env-like `process.env`; wrangler under nodejs_compat exposes
  // it via globalThis.process.env.
  if (typeof globalThis.process === 'undefined') globalThis.process = { env: {} };
  if (!globalThis.process.env) globalThis.process.env = {};
  globalThis.process.env.OPENAI_API_KEY = env.API_KEY;

  let body = {};
  try { body = await req.json(); } catch {}
  const input = String(body?.message || 'hello from the spike').slice(0, 500);

  try {
    const agent = getAgent();
    const result = await run(agent, input, { stream: true });
    return new Response(result.toTextStream(), {
      status: 200,
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Cache-Control': 'no-cache',
        ...cors,
      },
    });
  } catch (err) {
    return new Response(
      JSON.stringify({
        error: 'agents_spike_failed',
        message: String((err && err.message) || err),
        stack: String((err && err.stack) || '').slice(0, 2000),
      }, null, 2),
      { status: 500, headers: { 'Content-Type': 'application/json', ...cors } }
    );
  }
}
