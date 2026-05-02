# CreatorClaw — Session Handoff

**Production:** https://creatorclaw.co (formerly served at https://thetzn.github.io/creatorclaw/)
**Repo:** https://github.com/thetzn/creatorclaw
**Worker:** https://creatorclaw-proxy.creatorclaw.workers.dev

A tool that ingests a creator's public Instagram handle and produces a persona dashboard, content ideas, and brand-match pitches — all powered by a Cloudflare Worker proxying OpenAI + Apify.

---

## Where files live

The canonical project root is now the GitHub clone:

`/Users/alcor/Documents/Codex/Projects/creatorclaw`

Edit and commit from this folder. The old `/tmp/creatorclaw_repo` clone was only a temporary working copy and should not be treated as canonical anymore.

| Path | Role |
|---|---|
| `/Users/alcor/Documents/Codex/Projects/creatorclaw/index.html` | Deployed GitHub Pages app. Edit this for HTML/CSS/JS changes. |
| `/Users/alcor/Documents/Codex/Projects/creatorclaw/CreatorClaw.html` | Legacy HTML copy kept in the repo for now. Do not assume it is identical to `index.html`. |
| `/Users/alcor/Documents/Claude/Projects/creatorclaw` | Old loose working folder. Reference only; do not edit for deploys. |

**Deploy pattern after every edit:**
```bash
cd /Users/alcor/Documents/Codex/Projects/creatorclaw
git status
git add index.html
git commit -m "..."
git push origin main
```

Other important files in `creatorclaw/`:
- `worker.js` — Cloudflare Worker source. Deploy with `wrangler deploy` from `/Users/alcor/Documents/Codex/Projects/creatorclaw`.
- `wrangler.toml` — Worker config (name, main, compatibility_date).
- `docs/` — Product/session notes and architecture history.
- `logo.svg` — Legacy (pre-PNG logo). Not used anymore.
- `package.json` / `node_modules/` — Local tooling dependencies.

---

## Architecture (current)

```
Browser (creatorclaw.co)
  │
  │  POST { igScrape: true, handle: "nike" }
  ▼
Cloudflare Worker (creatorclaw-proxy.creatorclaw.workers.dev)
  │
  ├── Apify Instagram Profile Scraper → follower count, posts, profile pic
  ├── Downloads profile pic → base64 data URL (IG CDN blocks browser loads)
  ├── OpenAI gpt-4o-mini → interprets post captions → categories/vibes/themes
  │
  └── Returns single JSON payload
       { username, displayName, profilePicData, followers, engagementRate, bio,
         categories[], vibes[], recentThemes[], verified, _raw:{...} }

Browser then:
  1. Persona generation → OpenAI gpt-4o-mini (core fields only, nulls hard-overridden with real scraped values)
  2. Client-side `expandPersona()` synthesizes age/locations/radar (FAKE — see "What's real vs fake" below)
  3. Create tab → OpenAI gpt-4o-mini (10 content ideas)
  4. Pitch tab → OpenAI gpt-4o-mini (8 brand matches + AI-drafted pitch emails)
```

### Worker endpoints (all POST to the Worker root)
- `{ webSearch: true, messages: [...] }` — OpenAI Responses API with `web_search_preview` tool (GPT-4o). Legacy IG fallback.
- `{ igScrape: true, handle: "..." }` — Apify + OpenAI hybrid. **Primary IG analyzer.** ~5–8s response.
- `{ messages: [...] }` — Standard chat completions passthrough (gpt-4o-mini). Used for persona/brands/pulse generation.

### Worker secrets (set via `wrangler secret put`)
- `API_KEY` — OpenAI API key
- `APIFY_TOKEN` — Apify personal token
- ~~`KIMI_API_KEY`~~ — Unused (previous Moonshot key, replaced by OpenAI)

### Worker CORS allowlist
```js
['https://creatorclaw.co', 'http://creatorclaw.co',
 'https://www.creatorclaw.co', 'http://www.creatorclaw.co',
 'https://thetzn.github.io',
 'http://localhost', 'http://127.0.0.1']
```
If you add a new domain (e.g. `app.creatorclaw.co`), update the Worker AND redeploy (`wrangler deploy`), don't just push HTML.

---

## Deployment

| What you changed | What to do |
|---|---|
| HTML / CSS / JS in the HTML file | `git commit && git push`. GitHub Pages auto-deploys in ~60s. |
| `worker.js` | `cd /tmp/creatorclaw_repo && wrangler deploy`. Worker is live immediately. Then also push the worker.js change to git so it's versioned. |
| Domain / DNS | Gandi DNS is pointed at GitHub's 4 apex IPs. `CNAME` file in the repo must match the Custom Domain setting in GitHub Pages settings. |

### GitHub Pages custom domain setting
In GitHub → repo Settings → Pages → "Custom domain" field. Must match the `CNAME` file in the repo root. If they disagree, the site 404s. Current expected value: `creatorclaw.co`.

### Wrangler auth
Only the account owner's machine is logged into Cloudflare. For a coworker to deploy the Worker, invite them at Cloudflare dashboard → Manage Account → Members. For HTML-only changes they don't need Worker access.

---

## What's REAL vs FAKE in the persona dashboard

The user asked about this explicitly. Be honest when they ask again.

| Field | Source | Real? |
|---|---|---|
| Follower count | Apify scrape | ✅ Real |
| Engagement rate | Calculated from real post likes + comments | ✅ Real |
| Post count | Apify scrape | ✅ Real |
| Profile pic, bio, verified status | Apify scrape | ✅ Real |
| Categories / vibes / content themes | OpenAI interprets real captions | ✅ Semi-real (AI inference from real data) |
| Posting frequency | Calculated from real post timestamps | ✅ Real |
| **Top locations (cities)** | Hardcoded in `expandPersona()` | ❌ Fake |
| **Age distribution** | Picks 1 of 3 hardcoded templates by niche | ❌ Fake |
| **Gender split** | Hardcoded in HTML (62/34/4) | ❌ Fake |
| **Radar (Authenticity/Consistency/etc.)** | Random jitter around persona score | ❌ Fake |
| **Growth chart curve** | Synthesized from current follower count | ⚠️ Plausible but fabricated |

**Why fake:** Instagram hides audience demographics on public profiles. You need either (a) the creator to OAuth into the app via Instagram Graph API, or (b) a paid estimation service like Modash / HypeAuditor. See `FUTURE-FEATURES.md` for the plan.

**The `score` field was removed** in commit 7e06d94 because it was a heuristic users couldn't interpret.

---

## Product flow (current)

1. Intro screen: typewriter animation ("Welcome to CreatorClaw. / The AI agent for content creators.") → IG handle input fades in → creator enters handle → Analyze.
2. Intro dismisses. Crab logo spinner appears on the **Persona** tab with rotating messages ("Finding your profile…", "Analyzing sentiment…", etc.) and a progress bar. The **Connect** tab auto-hides from the nav.
3. After ~8s: persona card renders with profile pic, verified badge (only if Apify says verified), bio, vibes tags, stat cards (reach, engagement, growth, tier), content pillars, growth chart. CTA button appears: "Continue to Create".
4. **Create** tab (was "Pulse"): 10 AI-generated content ideas with hook, trend tag, estimated reach, Schedule + Draft Script actions.
   - Schedule → HTML5 date/time → downloads an .ics file.
   - Draft Script → AI generates hook/body/CTA in creator's voice → copy to clipboard.
5. **Pitch** tab (was "Brands"): 8 AI-matched brands with compatibility meter, 3 reasons, deal range, Draft Pitch button (AI emails in creator's voice) + Start Outreach toggle.
6. User can also click **Download Media Kit** in the Persona header — generates a 1-page PDF via jsPDF.

Tabs in order: ~~Connect~~ (hidden after first analyze) / Persona / Create / Pitch.
Theme toggle (sun/moon) in header top-right — dark by default, light is warm cream palette.

---

## Common landmines (hit these before, don't hit again)

1. **Base64 embed regex eating code.** When embedding the PNG logo, a greedy regex wiped `startLoading`, `stopLoading`, `LOADING_MESSAGES`, `_loadingTimers`, `showModal`, `closeModal`. Symptom: persona spinner hangs forever, no visible error. Fix was in commit `f07c418` — restored from commit `1bffcb1`.

2. **Instagram CDN blocks image loads from non-IG referrers.** Can't just put `<img src="https://scontent.cdninstagram.com/...">` in the page. The Worker fetches the profile pic server-side and returns it as `profilePicData` (base64 data URL).

3. **Apify field names vary by actor version.** `followersCount` / `followers_count` / `followers` / `edge_followed_by.count` can all appear. Same for following / posts. Defensive fallbacks are in `runIGScrape()`.

4. **OpenAI `web_search_preview` requires the Responses API + gpt-4o**, NOT Chat Completions and NOT gpt-4o-mini. Error `"Invalid value: 'web_search_preview'. Supported values are: 'function' and 'custom'"` means someone put the tool on Chat Completions.

5. **GitHub Pages custom domain mismatch → 404.** If repo has `CNAME` = `creatorclaw.co` but GitHub Settings → Pages shows `app.creatorclaw.co`, the apex 404s. Happened once when a coworker changed the domain setting without updating CNAME.

6. **When persona prompt had "null followers" string in it**, the AI filled every numeric field with 0. Fix: `getConnectedStats()` now skips null/empty fields entirely so the prompt is clean.

7. **AI loves to rewrite real numbers.** The hard override after `parseJSON` in `generatePersona` forces `name`, `totalReach`, `avgEngagement` back to the scraped values before render. Don't remove this override.

---

## File structure of CreatorClaw.html (top to bottom)

```
<!DOCTYPE html>
  <head>
    <meta ...>
    <link> inter font
    <script src="jspdf UMD from cdnjs" defer>
    <style>
      :root (dark theme vars)
      :root[data-theme="light"] (warm cream vars)
      ...all component styles...
      /* Intro Screen */ styles
      @media (max-width:768px) { mobile overrides }
      .hidden
    </style>
  </head>
  <body>
    <div id="intro-screen"> (typewriter + IG input)
    <div class="header"> (logo, tabs, theme toggle, CC avatar)
    <div class="main">
      <div id="tab-connect"> (IG connect card — hidden after analyze)
      <div id="tab-persona"> (persona card, stats, pillars, charts)
      <div id="tab-brands">  (Pitch — brand match cards)
      <div id="tab-pulse">   (Create — content idea cards)
    <script>
      // Intro typewriter (runs on DOMContentLoaded)
      function typeWriter, runIntro, dismissIntro, introAnalyze
      // Theme: applyTheme / toggleTheme / IIFE reads localStorage
      // Crab logo: LOGO_DATA_URI (~62KB base64), crabSVG(), populates data-crab-img + data-crab
      // Progress loading: LOADING_MESSAGES, startLoading, stopLoading, _loadingTimers
      // Modal helpers: showModal, closeModal
      // State: state = { igConnected, igData, persona, brands, pulseIdeas, ... }
      // Main flow fns: analyzeIGProfile, generatePersona, expandPersona, renderPersona,
      //                buildCharts, generateBrands, renderBrands, generatePulse, renderPulse
      // Supporting: kimiChat (proxy call), showContinueCTA, advanceToPulse, advanceToBrands,
      //             draftPitch, draftScript, openSchedule, downloadICS, downloadMediaKit
    </script>
  </body>
```

---

## Recent commit history (last 15)

```
16d3064 Remove persona score; replace gold check with Instagram verified badge
9ecd640 (coworker commit, not reviewed)
f07c418 Fix: restore lost startLoading/stopLoading + showModal helpers
6377450 Intro flows directly into IG connect; Connect tab hides after first analyze
5089173 Use embedded gold-crab PNG as logo (replaces hand-drawn SVG)
1bffcb1 New crab logo: gold pincer-up sprite with face, replacing rainbow silhouette
c30d224 Intro: faster typing, drop 'Let's get started' line + CTA, auto-advance to app
ad8369b Add typing agent intro screen with smooth transition
ddae3df Fix mobile: vertically center content on small screens
3c247d2 Brand cards: show real brand logos via Google favicon service
31e5637 Loading copy: 'Reading your recent content' instead of '25 posts'
d844124 Proxy IG profile pic through Worker as base64 data URL
91a41f9 Pass profile picture through from Apify to the persona avatar
fe98d42 IG analytics via Apify — real follower counts + engagement from post data
10c419c Add custom domain creatorclaw.co (CNAME + Worker CORS allowlist)
```

---

## Quick reference: preview server

```json
// /Users/alcor/Documents/Codex/Projects/Poole/.Codex/launch.json
{
  "version": "0.0.1",
  "configurations": [{
    "name": "creatorclaw",
    "runtimeExecutable": "npx",
    "runtimeArgs": ["serve", "-l", "3000", "/Users/alcor/Documents/Codex/Projects/Poole"],
    "port": 3000
  }]
}
```

Starts `npx serve` on port 3000 pointing at the Poole folder. Load `/CreatorClaw.html`.

**Tip for testing flow without real API calls:** In browser console, remove the intro manually:
```js
document.getElementById('intro-screen').remove();
```
Then you can poke at `state`, call `switchTab('persona')`, etc.

---

## Context on the creator: this is a personal project

The owner is building CreatorClaw as a side project. Prioritize:
- Shipping over polish (but ensure what ships works)
- Mobile responsiveness (target audience lives on phones)
- Latency (never sacrifice it for cleverness — the Worker proxy + Apify + OpenAI chain is already 8–12s on persona generation, don't add to it)
- Honesty about what's real data vs synthesized (creators will call out bullshit demographics)

If you're starting a new session: read this file, then read `FUTURE-FEATURES.md`, then go.
