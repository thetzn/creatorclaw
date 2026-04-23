# Session 2026-04-23 — Enrichment re-land + vision pilot

## Starting state

Worker was rolled back to `2257efb` (commit `299ea3a` on the file) after an earlier
all-at-once enrichment landed (commits `9744422`, `ce85b95`) and caused a
"Failed to fetch" regression on `runIGScrape` that we couldn't diagnose in
real time. Frontend stayed at HEAD — handles missing fields gracefully.
Persona card was showing `—` for Top City because the rolled-back Worker
didn't return `topLocations` / `baseLocation`.

GitHub Actions workflow for auto-deploy was also left failing from auth issues;
user chose to keep using manual `wrangler deploy` via their Mac mini.

## Approach this session

Rather than re-ship the failed enrichment wholesale, re-landed it in three
defensive chunks with **local-only verification** (`wrangler dev --remote`
against the real Apify + OpenAI secrets but without replacing the prod
deployment) between each chunk. Each chunk added signals without touching
the LLM prompt until chunk 3, so if things broke we'd know which layer.

## Commits shipped

| Hash | What |
|---|---|
| `05963f8` | Chunk 1: hashtag + mention extraction from posts. Per-post try/catch + outer try/catch. ASCII-only regex (no `\p{L}` — suspected root cause of prior regression). |
| `c97e617` | Chunk 2: locations, IG auto-generated alt-text, post-type mix (reel/carousel/image/video/other), avg video views, top-3 engagement posts, `externalUrl`, `businessCategoryName`. Still same simple LLM prompt. |
| `9e9514c` | Chunk 3: rich structured prompt (bio + link + mix + hashtags + mentions + locations + alt-text + top posts + 10K caption budget, was 4K), new LLM output fields `audienceHints` / `brandAffinities` / `baseLocation`, state-name normalizer collapses "Austin, Texas" + "Austin, TX" into a single bucket. Whole interpretation wrapped in try/catch with logging. |
| `ce3c270` | Frontend: removed ambiguous "Score" stat from inline persona card. |
| `d2bd310` | Frontend: onboarding preview card pacing 1.4s → 5s so users have time to read before next bubble. |
| `d5cda83` | Vision pilot: second gpt-4o-mini call (vision, detail:low) on top 5 post thumbnails runs in parallel with text interpretation. Returns `aestheticProfile` {aesthetic, palette, lighting, setting, style, visible_brands, notes}. |
| `79ce04f` | Vision fix: proxy IG CDN images server-side as base64 data URLs since OpenAI's fetcher gets blocked by IG's referer checks. |

## Local verification (via `wrangler dev --remote`)

Each chunk verified with curl against `@amandanelz`:

- Chunk 1: hashtags (7 items including `#austintexas`), mentions (4 items incl. `@ariatinternational`, `@megaformerstudio`).
- Chunk 2: `topLocations` split as `Austin, Texas` (3) + `Austin, TX` (3), `postMix` = 9 reels + 3 carousels of 12 filterable posts, externalUrl etc.
- Chunk 3: `topLocations` deduped to `Austin, TX` count 6; `baseLocation` = {Austin, TX, USA, confidence: high}; `audienceHints` = "Her audience likely consists of young adults interested in lifestyle, fashion, and personal development."; `brandAffinities` = the 4 @-tagged brands; `vibes` + `topCategory` still populated.
- Vision (chunk post-3): first attempt returned `aestheticProfile: null` — OpenAI couldn't fetch IG CDN URLs. Fixed by base64-proxying; awaiting user's next local test confirmation.

## What ships to prod after each deploy

User `wrangler deploy`d `9e9514c` (chunks 1-3). Verified `creatorclaw.co`
persona card now shows `Austin, TX` for Amanda instead of `—`. The Score
stat removal + onboarding pacing are frontend-only, auto-deployed via
static hosting. Vision pilot (`79ce04f`) is pushed but awaiting local
verify before manual deploy.

## Design discussion — `brandAffinities`

User flagged: if a creator already @-mentions a brand, they likely
*already* have a relationship. Recommending those same brands as new
leads is unhelpful. Agreed to use `brandAffinities` as:

1. **Exclusion filter** + tier/positioning signal in `generateBrands`.
2. **Social proof** injected into `draftPitch` prompts.
3. (Later) A "Your partnerships" panel on the persona view as portfolio.

Not yet implemented. Queued behind current vision work.

## State of the world at session end

- Prod worker: `9e9514c` (chunks 1-3 live).
- Repo HEAD: `79ce04f` (vision fix pushed, not yet deployed).
- GitHub Actions workflow: still disabled/broken; manual `wrangler deploy`.
- Frontend: auto-deployed, all recent changes live.
- Next planned work (when user ready):
  - Verify vision locally → deploy `79ce04f`.
  - Wire `brandAffinities` into `generateBrands` as exclusion + tier signal.
  - Wire `brandAffinities` + existing partnerships into `draftPitch` as social proof.
  - Audience demographics (real, not heuristic) — requires IG Graph Insights (post-signin path, not Apify scrape).
  - Comments scrape (Phase 2 persona enrichment, adds ~30s latency).

## Open backlog (P0 items untouched this session)

- Meta Business Verification + App Review — still Dev mode, blocks public launch.
- Decide FB Login vs IG Login API before submitting review.
- iOS Capacitor app — blocked on Meta.
- GitHub Actions wrangler deploy — disabled, fine for now.
