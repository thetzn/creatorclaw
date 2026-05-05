# CreatorClaw UI/UX Audit — Source-Based, 2026-05

**Scope:** `index.html` HEAD on `main` (`7b053f9`), 6634 LOC.

**Caveats:** visual rendering, real-data states, and mobile keyboard behavior are *inferred from source*, not observed in a live browser. Items marked **[VISUAL-VERIFY]** need browser confirmation before acting.

**Format per item:** `ID | Severity | Surface | Anchor | Issue → Fix`

**Severity legend:** **P0** ship-blocker for a demo, **P1** hurts feel/conversion, **P2** polish.

---

## 1. Information architecture

| ID | Sev | Surface | Anchor | Issue → Fix |
|---|---|---|---|---|
| IA-01 | P0 | Persona/Analytics tab | `index.html:1003-1019` | **Hard-coded placeholder data ships to logged-in users.** Static markup shows "Jordan Mitchell", "Fitness enthusiast & lifestyle creator…", `549K`, `5.3%`, "Rising Star", and 6 hardcoded vibe tags. If JS fails or persona isn't loaded yet, real users see Jordan's bio. → Render the entire `#persona-result` block via JS only after `state.persona` resolves; replace static markup with skeleton placeholders or remove from initial HTML. |
| IA-02 | P1 | Top nav | `index.html:931-939` | **6 nav buttons + back-to-chat = visual overload on desktop, scrollable strip on mobile** (`overflow-x:auto`, no overflow indicator). Order is also opinionated: Analytics → Create → Pitch → Pipeline → (Connect hidden) → Settings. → Drop "Connect" entirely (already lives in Settings → Connectors per `bf1cc96`); add a subtle right-edge gradient mask on mobile to signal scrollability; consider grouping Analytics/Create/Pitch/Pipeline as the "agent tools" cluster and pushing Settings to the avatar menu. |
| IA-03 | P1 | Chat sidebar tools | `index.html:1301-1306` | **Tool icons in sidebar are inconsistent line-weight/style** — Analytics uses bar-chart, Create uses `+`, Pitch uses arrow-out-of-box, Pipeline uses bar-stack, Settings uses cog. Mixing concrete UI metaphors with literal symbols. → Standardize on one icon family (recommend Lucide outline at `stroke-width:1.8`); the Create `+` is the weakest — use a sparkle/lightning icon. |
| IA-04 | P2 | Settings left nav | `index.html:1131-1178` | **4 of 9 entries are "Soon" stubs** (Billing, Usage, Permissions, Language). Dead options dilute trust and signal under-construction. → Hide stubs entirely until shipping; reveal individually as features land. Show "Soon" pills only inline in the panel itself, not in the nav. |
| IA-05 | P1 | Tab labels | `index.html:933` | **Nav says "Analytics" but URL/state says `tab-persona`; CTA on the tab says "Build your creator brief" — three names for one surface.** → Pick one. Recommend "Persona" everywhere or "Analytics" everywhere; align the headline. |

## 2. Onboarding & gating

| ID | Sev | Surface | Anchor | Issue → Fix |
|---|---|---|---|---|
| OB-01 | P0 | Intro screen | `index.html:908-912` | **"Continue with Instagram" button is a `Soon` stub but rendered with full IG gradient prominence.** Equal visual weight as Google sign-in implies parity that isn't there. → Demote IG button to `outline` style or a small "We'll add Instagram soon" link below the divider; keep gradient only when actually wired. |
| OB-02 | P1 | Intro try-first | `index.html:913-917` | **"Or try it first, no account needed" copy with "Build your agent" CTA conflicts** — try-first implies low commitment, "Build your agent" implies high. → Either change CTA to "See a preview" / "Try a sample" (low commit), OR change divider copy to "or skip ahead, sign in later" to match the agent-building frame. |
| OB-03 | P1 | Composer when logged out | `index.html:177-178, 1340` | **Disabled textarea with "Sign in to continue the conversation…" placeholder is non-functional.** It looks tappable, isn't. (An earlier fix was reverted.) → Re-add a clickable overlay button or replace the textarea entirely with a styled "Sign in to keep chatting" CTA when `body.logged-out`. |
| OB-04 | P1 | Teaser gates (×3) | `index.html:1044-1058`, `1071-1085`, `1125` | **Same gate component duplicated 3× with subtle copy variations** — Persona ("Unlock your full persona"), Brands ("See all your brand matches"), Pulse ("Unlock all 10 content ideas"). Maintenance hazard and visual repetition for users who scroll across tabs while logged out. → Extract `<TeaserGate variant="persona|brands|pulse">` (single source); also reconsider whether 3 separate gates serve users — a single primary gate after first tab might convert better than gating each. |
| OB-05 | P2 | Persona "fake stats" honesty | `index.html:1038-1042` | Per `AGENTS.md`, Gender/Age/Locations/Radar/Growth are synthesized. Currently labeled with confident headings ("Gender Split", "Age Distribution") with no visible "estimated" disclaimer. **Demo risk: a creator will spot it.** → Add a small "Estimated" pill on each fake-data chart-card title, plus a footer link "How we calculate this." |

## 3. Chat surface

| ID | Sev | Surface | Anchor | Issue → Fix |
|---|---|---|---|---|
| CHAT-01 | P0 | Static empty greeting | `index.html:1325-1335` | **Empty-state HTML hardcodes 4 generic suggestion buttons** that are shown for all logged-in users on first-load, regardless of whether persona exists. A user without a persona can't get useful answers from "Which of my recent posts performed best?" → For users without persona, replace these 4 suggestions with one big CTA card: "Build your persona to get personalized help." |
| CHAT-02 | P1 | `TOOL_CONFIG.main` has no chips | `index.html:2960-2966` | The main tool greeting/headline/chips are all `null` — but the static empty state keeps showing 4 chips. After `setActiveTool('main')` runs, these inconsistencies create different empty-state experiences depending on entry path. → Either add `main` chips matching the static HTML, or have JS render the empty state entirely from `TOOL_CONFIG`. |
| CHAT-03 | P1 | Chat header context badge | `index.html:1320` | `.chat-context-badge` displays the current tool when active, but it's a loud gold pill at ~9px uppercase letter-spacing 0.18em — punches above the title. → Soften to muted color, lower contrast; keep it as a label, not a flag. |
| CHAT-04 | P1 | Suggestion chip arrow | `index.html:110-113` | `.tool-chip::after { content: '→' }` rendered as a unicode arrow at 10.5px shifts on hover. Cute but breaks if browser swaps font; arrow alignment is finicky between platforms. → Replace with inline SVG arrow; keep the slide-on-hover animation. **[VISUAL-VERIFY]** |
| CHAT-05 | P1 | Sidebar conversation list | `index.html:1296-1297` | Only "Recent" section header, no grouping by date, no search. After ~50 conversations this becomes a wall. → Group into Today / Last 7 days / Older; add a search input above the list. (Punt grouping if it's too much for the demo.) |
| CHAT-06 | P2 | Chat avatar (assistant) | `index.html:136-138` | Spinning crab during loading is charming but `is-loading` applies a 1.6s `spin` to the whole avatar including the crab body — it spins literally. → Either constrain spin to a loading dot/ring around the avatar, or replace with a 3-dot pulse. The current behavior reads as "broken" rather than "thinking." **[VISUAL-VERIFY]** |
| CHAT-07 | P2 | Streaming cursor | `index.html:141` | 6×14px gold block cursor blinks at 0.9s. Combined with thinking-verb animation, busy. → Reduce to a 2px-wide bar; or only show when no verb is animating. |
| CHAT-08 | P1 | `pre-wrap` on chat-msg-body | `index.html:139` | `white-space:pre-wrap` is the default, then individual cards override with `.has-card{white-space:normal}`. Easy to forget — any new inline card CSS that doesn't include this gets rogue whitespace from template indentation. → Flip default to `normal` on `.chat-msg-body` and apply `pre-wrap` only to plain-text message content via `.chat-msg-body.is-text`. |

## 4. Persona / Analytics tab

| ID | Sev | Surface | Anchor | Issue → Fix |
|---|---|---|---|---|
| PERS-01 | P1 | Persona header card | `index.html:439-450` | **80px avatar + 22px name + 6 vibe-tag chips on a single row creates dense top.** On longer bios (>2 lines) the right column wraps unevenly with the media-kit button absolute-positioned top-right. → Limit visible vibes to 3 with "+ N more" expansion; cap bio at 2 lines with "Show more"; reflow media-kit button to bottom of header on narrow widths (already done <640 but breakpoint should be 768). |
| PERS-02 | P1 | Stat cards bottom row | `index.html:1021-1025` | **Only 3 stat cards (Reach / Engagement / Tier)** after Growth Rate was removed. Grid is `grid-3` so cards stretch wide — a single stat card (Tier) on the right looks lonely with massive icon glow. → Either swap Tier into a smaller header chip, or add a 4th meaningful stat (e.g., "Posting cadence: 3.2 reels/week"). |
| PERS-03 | P1 | "Stat sub" labels overlap | `index.html:1022-1023` | `<div class="stat-card-label">Total Reach<span class="stat-card-sub">+12%</span></div>` puts label + delta inline but the delta is hardcoded. After the Growth Rate removal these `+12%` and `+0.8%` are now misleading. → Drop the `+%` deltas or wire them to real period-over-period numbers; otherwise this is fake-data that ships. |
| PERS-04 | P2 | Pillars bar | `index.html:468-474` | Pillars render as 4-5 equal cards, each a stat-block with name/% /bar. At 4 cards they fit, at 5 they get tight. → Cap at 4; if persona returns 5+ pillars, render a horizontal bar chart instead. |
| PERS-05 | P0 | Pie chart hardcoded | `index.html:1038` | `conic-gradient(... 223.2deg, 345.6deg)` literally hardcodes 62/34/4 split into the static markup. **This is the demographic split we know is fake.** When the teaser-gate is shown for logged-out users, the blurred fake numbers are still visible behind the gate. For logged-in users, **these never get refreshed with real data** because there's no real source. → Either build the conic-gradient from `state.persona.gender` in JS, OR replace pie with an "Estimated audience demographics" placeholder card that requires Modash/HypeAuditor. |

## 5. Create tab (Pulse)

| ID | Sev | Surface | Anchor | Issue → Fix |
|---|---|---|---|---|
| PUL-01 | P1 | Create CTA copy | `index.html:1123` | "Generate ideas matched to your audience" — generic. → Personalize: "Generate Reel + carousel ideas using @{handle}'s top performers." |
| PUL-02 | P1 | Trend badge color set | `index.html:660-664` | 4 trend states (hot=red / rising=gold / steady=green / new=plum). **Rising's gold-dim is the same chip color as the persona-match block** (`pulse-persona-match` line 667 also uses gold-dim) — visual rhyme that says "these are equally important" but they aren't. → Swap rising to a softer amber or differentiate the persona-match background to a neutral tint; only the Hot/Rising chip should fight for attention. |
| PUL-03 | P1 | Pulse-card meta layout | `index.html:670-672` | `flex-wrap: wrap` with `gap:12px` row-gap 5px — at narrow widths meta items break to multiple rows in unpredictable order. → Use `grid-template-columns: 1fr 1fr` consistently, both desktop and mobile. (Already done in inline-pulse-grid line 244, just propagate.) |
| PUL-04 | P2 | Idea card title | `index.html:665` | `padding-right: 62px` reserves space for the absolute-positioned trend badge — fragile. If badge text grows ("Rising Hot", localization), title overlaps. → Use grid: `grid-template-columns: 1fr auto` with title and badge as siblings instead of absolute positioning. |

## 6. Pitch tab

| ID | Sev | Surface | Anchor | Issue → Fix |
|---|---|---|---|---|
| PIT-01 | P1 | Brand-trust block | `index.html:628-633` | "Best angle" + evidence pills is good content but **kicker font-size is 8px** which is below the readable threshold for body copy. → Bump kicker to 9-10px with letter-spacing 0.12em; the angle text is fine at 12px. |
| PIT-02 | P1 | Brand-card actions | `index.html:643-649` | Footer has `Draft Pitch` (primary gold) + `Pipeline` (secondary). On mobile (`flex-direction:column`, `display:grid` line 740), they stack as 1fr 1fr — fine. But the `outreach-btn` font is 9px uppercase. → Bump button text to 10-11px; reduce letter-spacing to 0.06em for short buttons. |
| PIT-03 | P1 | Match meter | `index.html:619-623` | 50px ring with 13px score numeral inside a 6px label. Tight. **Conic-gradient match ring is purely decorative — match score isn't shown as fill, just deg.** Reads as a generic dial, not a meaningful gauge. → Either size up to 56px and 16px numeral, or drop the ring entirely and show a horizontal mini-bar with the % beside the brand name. |
| PIT-04 | P1 | Mobile carousel | `index.html:714-719` | Brand grid converts to horizontal scroll-snap on mobile. **No scroll indicator** — users may not know there are more cards. → Add a tiny dot-pagination strip above the grid showing position (1/8, 2/8, etc.) or a right-edge gradient. |

## 7. Pipeline tab

| ID | Sev | Surface | Anchor | Issue → Fix |
|---|---|---|---|---|
| PIPE-01 | P1 | Two ways to add a deal | `index.html:1096, 1098-1104` | **"+ New deal" button (modal) AND a quick-add textarea with NLP parsing** both visible at once. Decision paralysis. → Demote the modal "New deal" to a small `…` overflow inside the quick-add card ("or fill out a form"); make quick-add the primary path. |
| PIPE-02 | P0 | 7-column kanban on desktop | `index.html:525` | `grid-template-columns: repeat(7, minmax(220px, 1fr))` = minimum 1540px before the board fits without horizontal scroll. **At 1100px max-width main + 32px padding, the board overflows and forces sideways scroll on every desktop laptop.** → Either reduce stages (consolidate "in_progress" + "negotiating" + "producing" into a single "active" with sub-status), or scope the board to its own page width (`max-width: 100%`, escape `.main`'s 1100px cap). Awaiting Payment pulsing animation also makes scrolling jumpy. |
| PIPE-03 | P1 | Stage accent stripe | `index.html:530-536` | 7 distinct top stripes — design intent is good, but 7 colors at low saturation against `var(--card2)` are hard to differentiate. → Drop to 3 phases with color (Outreach=gold-dim, Active=gold, Closed=green); use only typography weight to distinguish sub-stages within Active. |
| PIPE-04 | P2 | Pipeline empty state | `index.html:1111-1116` | "Track every deal from first DM to paid" then a single button "Add First Deal". → Add a 30-second example: "Try: 'Alo Yoga wants 2 reels for $4k'" pre-filled in the quick-add input as a clickable example. |

## 8. Settings tab

| ID | Sev | Surface | Anchor | Issue → Fix |
|---|---|---|---|---|
| SET-01 | P1 | Two-pane on mobile | `index.html:886-892` | Mobile collapses left nav to top, right content below. **Nav becomes a horizontal scroll strip of 9 items with no indication of active.** → Render mobile nav as an accordion (one open at a time) instead of side-rail. |
| SET-02 | P1 | "What your agent knows" | `index.html:1199-1213` | Inline edit form lives inside the panel — when user clicks "edit" on a fact, the form appears below the list with no scroll/anchor — easy to miss. → On edit click, scroll the edit form into view AND highlight the row being edited above. |
| SET-03 | P2 | Agent style | `index.html:1217-1232` | "Prefill from profile" link is gold uppercase tracking text wedged on the right edge of the Instructions label row — unconventional placement. → Move to a button below the textarea: "Reset to my profile defaults". |
| SET-04 | P2 | Connectors row | `index.html:490-501` | Hover reveals border change but no other affordance that the row is interactive. → Add cursor:pointer to the entire row; or remove the row hover and make only the button look interactive. |

## 9. Mobile-specific

| ID | Sev | Surface | Anchor | Issue → Fix |
|---|---|---|---|---|
| MOB-01 | P1 | Vertical centering on short pages | `index.html:706-707` | `body.in-tool` mode uses `min-height:calc(100vh - 52px)` and `justify-content:center` on `.main`. On the persona empty state (just `<center-cta>`) the content is mid-screen; on the loading state it jumps down because the page suddenly has more height. → Drop `justify-content:center`; align everything to top with reasonable top padding (32px). The visual "drift" is jarring. **[VISUAL-VERIFY]** |
| MOB-02 | P1 | iOS zoom prevention | `index.html:301` | `input,textarea,select{font-size:16px !important}` only inside `@media(max-width:768px)`. **The chat-input is 14px outside that breakpoint** — fine on iPad landscape (768px) but on iPad portrait (768px) it triggers zoom. → Set 16px from the start; size down only if needed via `transform:scale(0.875)`. |
| MOB-03 | P1 | Header consolidation logic | `index.html:692-701` | Header swaps based on `body.in-tool` AND `#chat-view` not hidden — overlapping conditions. Mobile-title element needs JS to populate but I don't see a `setMobileTitle` reliably called. → Add a single `function setHeaderState(state)` and remove the dual-class system; populate mobile-title in one place. |
| MOB-04 | P1 | Brand card width | `index.html:280, 717` | Inline brand grid uses `flex: 0 0 86%`, regular brand-grid uses `flex: 0 0 86% min-width 280px`. On 320px screens, 86% = 275px, below the min-width — card overflows. → Drop min-width or reduce to 240px. |
| MOB-05 | P2 | Tap target audit | `index.html:680-682, 274` | `pulse-save-btn` is 9px font, padding 9×14, ~28-32px tall — below the 44px tap target. Already partially addressed line 744 (`min-height:40px`) but inline-pulse-grid pulse-save-btn line 253 is `min-height:34px`. → Standardize all tap targets to `min-height:44px` per Apple HIG; raise inline buttons too (the chat surface needs it most on phones). |

## 10. Accessibility

| ID | Sev | Surface | Anchor | Issue → Fix |
|---|---|---|---|---|
| A11Y-01 | P1 | Color-only state | `index.html:660-664, 530-536` | Trend badges and pipeline stripes use only color to convey state. Color-blind users lose the signal. → Add a small icon prefix to each badge (Hot, Rising, Steady, New as text or symbol) — or text-only labels. |
| A11Y-02 | P1 | Click handlers on `<div>` | `index.html:1132, 1148, 1154-1155, 1157` | Settings nav uses `<div class="st-nav-item" onclick=...>` — not keyboard-focusable, no role. → Convert to `<button>` or add `role="tab" tabindex="0"` + keydown handlers. |
| A11Y-03 | P2 | Image alts | `index.html:1326, 1291` | `<img data-crab-img alt="">` — empty alt is correct for decorative, but the chat-empty crab is the only icon — could be `alt="CreatorClaw"` for screen-reader context (pair with the text below). Right now SR users hear just "How can I help today?" with no app context. → Set `alt="CreatorClaw agent"` once per page; keep empty for repeated decorative use. |
| A11Y-04 | P2 | Focus visible only on `:focus-visible` | `index.html:399-400` | Good — keeps mouse users clean. But `outline:2px solid var(--gold)` on `outline-offset:2px` against gold-dim backgrounds is low contrast. → Use a 3px outline with 2px white offset ring, or `box-shadow: 0 0 0 2px var(--bg), 0 0 0 4px var(--gold)`. |

## 11. Visual system / typography

| ID | Sev | Surface | Anchor | Issue → Fix |
|---|---|---|---|---|
| VIS-01 | P1 | Letter-spacing on small uppercase | sitewide, e.g. `index.html:198, 370, 580, 605` | Most uppercase labels at 9-11px have `letter-spacing: 0.15em` to `0.25em`. **At 9px with 0.25em tracking, "GROWTH" is 9px tall, 6.75px between letters — characters lose connection.** → Cap tracking at 0.12em for ≤10px text; allow 0.15-0.20em only at ≥12px. The mobile override at line 705 already does this for some but not consistently. |
| VIS-02 | P1 | Emoji icons in CTAs | `index.html:978, 1067, 1112, 1123` | Unicode glyphs `✦`, `♢`, `◇`, `◎` rendered as content. **These are rendered with the system emoji font on iOS/Android** and look completely different from desktop monochrome. → Replace with inline SVG icons matching the Lucide stroke set used in Settings nav. |
| VIS-03 | P2 | Border tokens | `index.html:14-15` | `--border:#1E1E1E` and `--border2:#2A2A2A` differ by only 12 units — barely perceptible distinction in actual UI. The system would benefit from consolidation. → Either drop one or push them apart (e.g., `--border:#222`, `--border2:#333`). |
| VIS-04 | P2 | Card hover lift inconsistency | sitewide | Some cards lift on hover (`transform:translateY(-1px)` brand-card, pipeline-card), some don't (chat-suggestion, pulse-card line 658-659). → Pick one: either ALL cards lift, or NO cards lift (subtle border highlight only). Recommend the latter for a more "tool-like" feel vs marketing site. |
| VIS-05 | P2 | Light theme contrast | `index.html:24-32` | `--text:#2A251D` on `--bg:#F5F1E8` ≈ 10:1 — fine. But `--muted:#7A6F5F` on `--card2:#F0EAD8` ≈ 3.4:1 — below WCAG AA for body text (need 4.5:1). → Darken `--muted` to `#6A5F4F` in light theme. |

## 12. Loading & empty states

| ID | Sev | Surface | Anchor | Issue → Fix |
|---|---|---|---|---|
| LOAD-01 | P1 | Persona reveal kicker | `index.html:987` | Still says "First read" — supposed to be "Creator persona" per recent work; reverted with the rest. → Re-apply the 5 "first read" → "Creator persona" / "your creator persona" replacements (we know the spots). |
| LOAD-02 | P1 | Loading subtitle copy | `index.html:1068, 1124, 1000` | "Scanning 12,000+ brand profiles…", "Analyzing 50K+ trending posts…", "Scanning your recent posts…" — three different scales and tones. → Unify: "{verb}ing {specific thing} for {creator}…" pattern, e.g., "Matching brands to @{handle}…". The fake "12,000+" / "50K+" numbers feel inflated. |
| LOAD-03 | P2 | Progress bars are fake | `index.html:404, 190` | All `loading-progress-bar` widths are driven by JS timers (`startLoading`), not real progress. They feel dishonest if the user notices the bar fills smoothly while the real work might be done. → Either tie to real milestones (10% scrape started → 60% scrape done → 90% LLM done → 100%) or replace with a thinking-verb only (we already do that in chat). |
| LOAD-04 | P2 | Empty state when persona missing | `index.html:1325-1335` | Logged-in user with no persona sees the same empty state as a fully-onboarded user. → Detect `!state.persona` and show a "Build your persona to get personalized help" card with a one-click handle prompt. |

## 13. Honesty & trust signals

| ID | Sev | Surface | Anchor | Issue → Fix |
|---|---|---|---|---|
| HON-01 | P0 | "Estimated" labels missing | persona demographics, growth charts | Per `AGENTS.md`, audience demographics are synthesized. → Add a small "Estimated" pill on each fake-data chart-card title with a tooltip "We estimate this from {source}. Connect Instagram for verified data." Critical for credibility with creator audience. |
| HON-02 | P1 | Match scores | brand cards, pulse cards | "92% match" with no explanation of inputs. Sophisticated users will ask. → Add a small `?` after the match score that opens a popover: "Audience overlap (40%), aesthetic fit (30%), tier fit (30%)" or whatever the actual heuristic is. |
| HON-03 | P1 | "AI can make mistakes" hint | `index.html:1345` | Disclaimer is at chat-composer bottom but not on idea cards or pitch drafts. → Add a tiny "Generated, edit before sending" footer to the inline pitch-render card; same for draft-script output. |

---

## Suggested triage order for demo

If you only have time for 5: **IA-01, OB-03, CHAT-01, PIPE-02, LOAD-01.**

If you have time for 10, add: **PERS-05, OB-04, PIT-03, MOB-01, HON-01.**

Everything else is post-demo polish.

---

## For the next agent

Each item has `index.html:{line}` anchors. To execute one, read the anchor, apply the recommended fix, run the file through a syntax check, and commit with message `[<ID>] <one-line description>`. Don't batch unrelated fixes. **[VISUAL-VERIFY]** items should be screenshotted before/after.
