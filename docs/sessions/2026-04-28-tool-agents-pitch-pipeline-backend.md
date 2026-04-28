# Session 2026-04-28 — Chat-first tool agents (Create + Pitch) + Pipeline backend

## Starting state

Coming off the 2026-04-23 enrichment session. Tool tabs (Create, Pitch,
Pipeline) existed as grid-view-first surfaces. Chat existed but had no
per-tool agent context; conversations weren't scoped per tool. Pipeline
was localStorage-only.

User decisions made up-front:
1. **Replace** the grid view in Create + Pitch with a chat-first agent surface.
2. **Single agent personality** for now; eventually migrate to OpenAI Agents SDK.
3. **Save conversations** with a `tool` field so they're scoped per-agent.
4. **Suggestion chips** as the entry point (vs. blank chat).
5. Phase 1 + 2 first (Create), then duplicate to Pitch (Phase 3).
6. **Defer handoffs** to the eventual Agents SDK migration.

## Commits shipped

| Hash | What |
|---|---|
| `9e9d1b6` | Phase 1: tool-aware chat shell. `chatState.activeTool`, `TOOL_CONFIG` map, `setActiveTool`, `renderToolGreeting`, `useToolChip`, `openTool` routing, conversation tool-filter, `buildSystemPrompt` `promptExt` addition. Per-tool conversations require Supabase migration: `ALTER TABLE conversations ADD COLUMN tool TEXT NOT NULL DEFAULT 'main' CHECK (tool IN ('main','create','pitch'))`. |
| `867acbd` | Phase 2: Create agent — `generate_content_ideas` tool in worker.js (sub-LLM call returning JSON ideas). `sseWrapContent` extended with optional `metadata` parameter to emit a `delta.metadata` SSE event after content chunks. Frontend `renderToolMetadata` dispatches `pulse_ideas` → `renderInlineIdeasIntoBody` (inline pulse-card grid in the assistant bubble). |
| `541017f` | Phase 3: Pitch agent — `find_brand_matches` tool. Captures `result.brands` as `metadata.cards={type:'brand_matches',items}`. `renderInlineBrandsIntoBody` builds `.brand-card` grid inline, persists into `state.brands`, kicks `enrichBrandsWithAgent` for top-4 program-URL discovery. Plus: `renderMarkdown()` (escape-first inline parser for bold/italic/code/links/fenced-blocks) wired into all three streaming sites + `appendMessage` history rendering. Plus: tool-chip CSS polish (gradient mask border, animated arrow, hover lift, gold-tinted shadow). |
| `837d3bf` | Stop tools echoing card data in prose; tighten chip sizing. System-prompt instructions: when `find_brand_matches`/`generate_content_ideas` runs, frontend renders cards inline → reply with one sentence, no list. Tool-chip CSS shrunk to 5/11 padding, 11.5px font, 6/10 gap/margin. |
| `e650cc8` | Inline Draft Pitch in chat. Brand cards rendered inside chat now route Draft Pitch through normal chat stream instead of opening modal. New `draftPitchInline(i)`: sets input to "Draft a pitch for X", calls `sendChatMessage`. Pitch agent prompt: when asked to draft, output exactly `Subject: ...\n\n<body>` so existing `maybeAttachGmailCta` auto-attaches Open-in-Gmail + Copy. Grid-view brand cards keep the modal flow. |
| `b3df2d0` | Tighter inline brand cards + force-drop LLM prose. Scoped CSS `.chat-msg-body .inline-brand-grid .brand-card` (14px padding, 32–42px logo/match-meter, smaller fonts/margins). Worker-side guarantee against duplication: when `renderMetadata.cards.type === 'brand_matches'` (or `pulse_ideas`), `finalContent` is overridden with a deterministic one-liner. The system-prompt instruction wasn't reliable; this guarantees no duplication. |
| `ffae9db` | "Show 4 more / different angle" chips below brand cards. Two `.tool-chip` actions appended after every `find_brand_matches` result. Both build a follow-up message including the seen-brand list, submit through normal stream. Worker `find_brand_matches` gains an `exclude` array param; the inner JSON-generation prompt explicitly tells the LLM "Already shown (DO NOT repeat): X, Y, Z". |
| `96a22e7` | Send button overlap fix + mobile brand-card swipe. Send button was anchored to `.chat-composer-inner` which also contained the disclaimer hint, so `bottom:8px` resolved to bottom of disclaimer (pushing button below textarea). Wrapped textarea+button in `.chat-input-wrap` with own `position:relative`. Brand cards on mobile (≤560px) now horizontal flex + `scroll-snap-type:x mandatory` + 82% card width. |
| `eab1b3b` | Smooth scroll on chip tap; sticky-bottom only when user wants it. Tapping a mid-conversation chip used to instant-jump to bottom on mobile. Now: new user bubble smooth-scrolls to ~16px from top via `revealBubble`. `chatState.followBottom` flag drives streaming auto-scroll: true on submit, flips false if user scrolls >120px up, re-engages near bottom. Streaming loops honor the flag. |
| `2c87185` | Pipeline: persist deals to Supabase. Migration `20260428_creator_deals.sql`: `creator_deals` table (uuid id, user_id fk, brand_name, brand_domain, status CHECK constraint, platform, deliverable, amount_usd, notes, due_date, created_at, updated_at), BEFORE UPDATE trigger for updated_at, RLS policies (own-only). Frontend: `loadDeals` async (Supabase when authed, localStorage fallback), `maybeMigrateLocalDeals` one-time push on first login (`cc_deals_migrated_v1` marker), `upsertDealRemote`/`updateDealStatusRemote`/`deleteDealRemote`, async `submitDealModal`/`moveDeal`/`deleteDeal` with optimistic UI + rollback on failure. `onAuthStateChange` reloads deals on `SIGNED_IN`, clears `state.deals` on `SIGNED_OUT`. |
| `14e19b9` | Pipeline: add 'Awaiting Payment' stage between Producing and Closed. `PIPELINE_STAGES` now 7 entries; `.pipeline-board` grid `repeat(6) → repeat(7)`. Awaiting Payment counts as Pipeline Value (only `closed` is earned). Migrations: `20260428_creator_deals.sql` CHECK updated for fresh installs; new `20260428_creator_deals_awaiting_payment.sql` ALTER for the live DB. |

## Migrations run by the user

1. **Phase 1 conversations**: `ALTER TABLE conversations ADD COLUMN tool TEXT NOT NULL DEFAULT 'main' CHECK (tool IN ('main','create','pitch'))`
2. **Pipeline schema**: `supabase/migrations/20260428_creator_deals.sql`
3. **Awaiting Payment**: `supabase/migrations/20260428_creator_deals_awaiting_payment.sql`

## Worker deploys

Multiple `wrangler deploy` runs through the session. Final live worker has:
- `generate_content_ideas` tool
- `find_brand_matches` tool with `exclude` param
- `send_pitch_email` (Arcade Gmail) — pre-existing
- `sseWrapContent(text, origin, allowed, metadata)` signature
- Worker-side prose-override when card metadata is produced
- Per-tool system-prompt extension routing via `body.tool` field

Note: a couple of false starts where the user pulled `main` and ran
`wrangler deploy` before the branch was actually merged. Resolved by
fetching, fast-forwarding `claude/cleanup-mobile-whitespace-lcP16` →
`main`, pushing main, then redeploying. Final live worker version:
`e713bc49-23cd-49ab-9d95-8bd61c8d9317` (after Phase 3 land), with
later updates after `b3df2d0`/`ffae9db`.

## Branch oddity

All this session's work was committed on `claude/cleanup-mobile-whitespace-lcP16`
(per the SDK harness's branch pin) despite content being unrelated to
mobile-whitespace cleanup. The branch was rebased on top of `main` before
the first commit, so each merge to `main` was a clean fast-forward.

## Architectural notes

### Chat shell pattern

`chatState.activeTool` (`'main' | 'create' | 'pitch'`) drives:
- System prompt addendum (`TOOL_CONFIG[tool].promptExt`)
- Greeting + suggestion chips on empty state
- Conversation scope (filtered by `tool` column)
- The Worker reads `body.tool` and routes/logs accordingly

### Inline-card side-channel

Worker emits one extra SSE event after content chunks:
```
data: { choices: [{ delta: { metadata: { cards: { type, items } } } }] }
```
Frontend's stream parser checks `deltaObj?.metadata` and dispatches via
`renderToolMetadata`. Item types: `pulse_ideas` (Create) and
`brand_matches` (Pitch). Frontend renderer persists items into state
(`state.pulseIdeas`, `state.brands`) so existing handlers like
`openSchedule`, `draftScript`, `draftPitchInline` work by index/title.

### Pipeline persistence model

- **Logged in**: Supabase `creator_deals` with RLS. UUIDs server-side. Optimistic UI + rollback on failure.
- **Logged out**: localStorage. Try-first flow keeps working without auth.
- **First login**: `maybeMigrateLocalDeals` lifts local rows up once (idempotent via `cc_deals_migrated_v1` marker), clears local cache.
- **ID detection** in `upsertDealRemote`: regex matches UUID format → UPDATE; otherwise (legacy `d_*` ids or no id) → INSERT.

### Sticky-scroll behavior

`chatState.followBottom` is the source of truth:
- Set `true` on every `sendChatMessage` submit
- A scroll listener on `#chat-messages` flips it `false` if user is >120px from bottom during streaming, `true` again if they return within 20px
- Streaming auto-scrolls only when flag is `true`
- New user message uses smooth-scroll (`revealBubble(body, 16)`) to top, not instant scroll-to-bottom — fixes the mid-conversation chip-tap jump

## Deferred / parked roadmap items

Captured for a future session:

- **"Add to Pipeline" button on chat brand cards** — turn a brand match into an `outreach` deal in one tap. ~30 min.
- **Auto-create Outreach deal on Open-in-Gmail** — every pitch you actually send becomes a tracked deal automatically. ~20 min.
- **Chat agent updates deal status** — new worker tool: `update_deal_status({brand, status})`. ~45 min. Needs to read `creator_deals` for matching.
- **"Move past pitch in pipeline" entry on chat brand cards** — show current stage on the card if matched.
- **Drag-and-drop reorder** in pipeline kanban (currently button-driven).
- **Migration to OpenAI Agents SDK** — single-personality agent with tool registry, then handoffs.

## Key files touched

- `index.html` (and synced `CreatorClaw.html`)
- `worker.js`
- `supabase/migrations/20260428_creator_deals.sql`
- `supabase/migrations/20260428_creator_deals_awaiting_payment.sql`

## Lessons / debugging notes

- **Worker doesn't auto-pick-up frontend prompt changes**, but it does need redeploy when worker.js itself changes (tool definitions, sseWrapContent signature, prose-override logic).
- **Cloudflare Pages auto-deploys from `main`** — pushing to a feature branch ships nothing user-visible. Two false starts where the user ran `wrangler deploy` from main before the branch was merged in caused minutes of "why isn't this live" confusion.
- **`git fetch` before `git merge --ff-only origin/<branch>`** — without the fetch, the local origin ref is stale and merge is a silent no-op.
- **System-prompt instructions to "not enumerate results" are unreliable** with gpt-4o-mini even when phrased forcefully. Forcing the override on the worker side is the only deterministic fix.
- **iOS Safari aggressive HTML caching** — verified-deployed-but-not-visible bugs are usually browser cache; `curl https://creatorclaw.co/ | grep -c <new-symbol>` is the fast way to confirm.
- **`bottom:8px` is anchored to `position:relative` ancestor** — the original chat-composer-inner contained the disclaimer too, which broke the send-button positioning. Always check what defines the positioning context.
