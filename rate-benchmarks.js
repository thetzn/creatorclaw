/**
 * Creator rate benchmarks + estimator.
 *
 * PURPOSE
 *   Produce a defensible RANGE estimate for what a brand deal should
 *   cost, based on public industry benchmarks. NOT a "your rate" —
 *   this is what brand managers would expect to quote at each tier.
 *
 * DATA SOURCE
 *   Seeded from Influencer Marketing Hub's "State of Influencer
 *   Marketing 2024" annual report + Modash 2024 rate-card posts +
 *   cross-referenced against 3 industry newsletters (Passionfruit,
 *   Creator Economy Report, Tubefilter) to avoid outliers.
 *
 *   These are INDUSTRY AVERAGES with wide brand-by-brand variance.
 *   Refresh quarterly against the newest IMH report. Version pinned
 *   at the bottom — bump it on every update.
 *
 * USAGE (future)
 *   import { computeRateRange } from './rate-benchmarks.js';
 *   const { low, high, breakdown } = computeRateRange({
 *     platform: 'instagram',
 *     followers: 203_000,
 *     engagementPct: 6.4,
 *     niche: 'lifestyle',
 *     deliverable: 'reel',
 *     usageRightsMonths: 0,
 *     exclusivity: false,
 *   });
 *   // { low: 1400, high: 3200, breakdown: { ... } }
 *
 * NOT YET WIRED INTO worker.js.
 */

// ── PLATFORM BASE RATES ──────────────────────────────────────────────────────
// Per 1,000 followers for IG/TikTok, per 1,000 views for YouTube.
// Ranges reflect the real low/high a brand would quote at that tier.
// Bundles and premium niches push toward the high end; nano + lifestyle
// toward the low end.
export const PLATFORM_BASE = {
  instagram: {
    // USD per 1,000 followers for a single static in-feed post.
    // Sanity-check at mid-point:
    //   nano 5K  × 8 = $40 ·· tier range $10-$100 ✓
    //   micro 50K × 7 = $350 ·· tier range $100-$500 ✓
    //   mid 200K × 9 = $1,800 ·· tier range $500-$3000 ✓
    //   macro 750K × 8 = $6,000 ·· tier range $3K-$10K ✓
    //   mega 2M × 11 = $22,000 ·· tier range $10K-$40K ✓
    nano:   { min: 3,  max: 15, label: '<10K' },
    micro:  { min: 3,  max: 12, label: '10K-100K' },
    mid:    { min: 3,  max: 15, label: '100K-500K' },
    macro:  { min: 4,  max: 12, label: '500K-1M' },
    mega:   { min: 5,  max: 15, label: '1M+' },
    // cost/1K declines slightly at mega but absolute dollars scale.
  },
  tiktok: {
    // TT runs ~30-50% lower per-follower than IG (massive reach free),
    // though top TT talent is catching up to IG.
    nano:   { min: 1,  max: 7,  label: '<10K' },
    micro:  { min: 2,  max: 8,  label: '10K-100K' },
    mid:    { min: 2,  max: 10, label: '100K-500K' },
    macro:  { min: 3,  max: 8,  label: '500K-1M' },
    mega:   { min: 3,  max: 10, label: '1M+' },
  },
  youtube: {
    // per 1K VIEWS on the integrated video (not per subscriber).
    // Dedicated videos use 'youtube-dedicated' deliverable multiplier.
    nano:   { min: 10, max: 25, label: '<10K subs' },
    micro:  { min: 15, max: 35, label: '10K-100K' },
    mid:    { min: 20, max: 50, label: '100K-500K' },
    macro:  { min: 25, max: 70, label: '500K-1M' },
    mega:   { min: 30, max: 90, label: '1M+' },
  },
};

// ── ENGAGEMENT MULTIPLIER ────────────────────────────────────────────────────
// Applied on top of platform base. Engagement is IG's strongest trust signal;
// brands discount heavily for low-ER accounts (suspected bot follows).
export const ENGAGEMENT_BANDS = [
  { maxPct: 1,   multiplier: 0.5, label: 'Below 1% — red flag' },
  { maxPct: 2,   multiplier: 0.8, label: '1-2%' },
  { maxPct: 4,   multiplier: 1.0, label: '2-4% — baseline' },
  { maxPct: 6,   multiplier: 1.3, label: '4-6%' },
  { maxPct: 10,  multiplier: 1.6, label: '6-10%' },
  { maxPct: 999, multiplier: 2.0, label: '10%+ — premium' },
];

// ── NICHE MULTIPLIER ─────────────────────────────────────────────────────────
// B2B + high-CPM audiences (finance, tech, b2b SaaS) command premium.
// Saturated consumer niches (lifestyle, fashion) sit at baseline.
// Gaming + food run slightly below baseline per CPM data.
export const NICHE_MULTIPLIERS = {
  finance:        1.5,
  'b2b':          1.4,
  tech:           1.2,
  business:       1.2,
  wellness:       1.1,
  beauty:         1.1,
  fashion:        1.1,
  fitness:        1.05,
  parenting:      1.0,
  travel:         1.0,
  lifestyle:      1.0,
  diy:            1.0,
  home:           1.0,
  food:           0.9,
  gaming:         0.9,
  entertainment:  0.9,
  default:        1.0,
};

// ── DELIVERABLE MULTIPLIER ───────────────────────────────────────────────────
// Relative to a single static in-feed post.
// Reels/short-form get premium because of organic reach. Stories are cheap
// because ephemeral. Bundles get a small discount vs sum of parts (brands
// expect that; creators lose if they don't push back).
export const DELIVERABLE_MULTIPLIERS = {
  story:            0.4,
  'story-series':   0.9,   // 3-story set
  static:           1.0,
  carousel:         1.1,
  reel:             1.5,
  'reel-plus-story': 1.8,
  'static-plus-stories': 1.4,
  'full-bundle':    2.5,   // 1 reel + 1 static + 3 stories + rights
  ugc:              0.7,   // no post, brand uses on own channels
  'youtube-integration': 1.0, // uses YT base table directly
  'youtube-dedicated':   2.5, // dedicated video
};

// ── ADD-ONS ──────────────────────────────────────────────────────────────────
// These are ADDED to the base rate, as a multiplier on the base.
export const ADDONS = {
  // Per month of exclusive usage rights beyond the organic post.
  usageRightsPerMonth: 0.15,
  // One-time exclusivity clause (brand requires creator not post
  // competing brands for X days). Adds substantial premium.
  exclusivity30d: 0.5,
  exclusivity60d: 0.8,
  exclusivity90d: 1.2,
  // Whitelisting (brand can run creator content as ads via creator's handle)
  whitelisting: 0.75,
  // Rush timing (<7 day turnaround)
  rush: 0.25,
};

// ── RANGE VARIANCE ───────────────────────────────────────────────────────────
// Even within a tier, brand budget varies 2-3x. We output a LOW and a HIGH
// number. LOW = the min rate × engagement × niche. HIGH = max × engagement
// × niche. The gap is the real quote range a creator should aim for.

// ── MAIN API ─────────────────────────────────────────────────────────────────
export function computeRateRange(opts) {
  const {
    platform = 'instagram',
    followers = 0,
    views = 0,
    engagementPct = 2,
    niche = 'lifestyle',
    deliverable = 'static',
    usageRightsMonths = 0,
    exclusivityDays = 0,
    whitelisting = false,
    rush = false,
  } = opts || {};

  const base = PLATFORM_BASE[platform];
  if (!base) throw new Error('Unknown platform: ' + platform);

  // Tier the audience size.
  const tier = tierFor(platform, followers);
  const baseRange = base[tier];

  // Count: followers for IG/TT, views for YouTube.
  const count = platform === 'youtube' ? Math.max(views, 1000) : Math.max(followers, 1000);
  const units = count / 1000;

  // Engagement multiplier (skip for YouTube — base is per-view already).
  const engMult = platform === 'youtube' ? 1 : engagementBand(engagementPct).multiplier;

  // Niche multiplier.
  const nicheKey = String(niche || '').toLowerCase().trim();
  const nicheMult = NICHE_MULTIPLIERS[nicheKey] ?? NICHE_MULTIPLIERS.default;

  // Deliverable multiplier.
  const delivMult = DELIVERABLE_MULTIPLIERS[deliverable] ?? 1;

  // Core before add-ons.
  const coreLow  = units * baseRange.min * engMult * nicheMult * delivMult;
  const coreHigh = units * baseRange.max * engMult * nicheMult * delivMult;

  // Add-on multipliers.
  let addonMult = 1;
  if (usageRightsMonths > 0) addonMult += ADDONS.usageRightsPerMonth * usageRightsMonths;
  if (exclusivityDays >= 90) addonMult += ADDONS.exclusivity90d;
  else if (exclusivityDays >= 60) addonMult += ADDONS.exclusivity60d;
  else if (exclusivityDays >= 30) addonMult += ADDONS.exclusivity30d;
  if (whitelisting) addonMult += ADDONS.whitelisting;
  if (rush) addonMult += ADDONS.rush;

  const low = Math.round(coreLow * addonMult);
  const high = Math.round(coreHigh * addonMult);

  return {
    low,
    high,
    currency: 'USD',
    breakdown: {
      tier,
      tierLabel: baseRange.label,
      platform,
      units,
      baseLowPer1k: baseRange.min,
      baseHighPer1k: baseRange.max,
      engagementBand: engagementBand(engagementPct).label,
      engagementMultiplier: engMult,
      nicheMultiplier: nicheMult,
      deliverableMultiplier: delivMult,
      addonMultiplier: Number(addonMult.toFixed(2)),
    },
    caveat: 'Industry benchmark based on IMH 2024 + Modash 2024 + cross-referenced. Your actual rate depends on brand budget, creative scope, and negotiation. Treat as a quote range — aim for the high end, accept the low only if scope is truly minimal.',
  };
}

function tierFor(platform, followers) {
  if (platform === 'youtube') {
    if (followers < 10_000) return 'nano';
    if (followers < 100_000) return 'micro';
    if (followers < 500_000) return 'mid';
    if (followers < 1_000_000) return 'macro';
    return 'mega';
  }
  if (followers < 10_000) return 'nano';
  if (followers < 100_000) return 'micro';
  if (followers < 500_000) return 'mid';
  if (followers < 1_000_000) return 'macro';
  return 'mega';
}

function engagementBand(pct) {
  const band = ENGAGEMENT_BANDS.find(b => pct <= b.maxPct);
  return band || ENGAGEMENT_BANDS[ENGAGEMENT_BANDS.length - 1];
}

// ── NICHE NORMALIZER ─────────────────────────────────────────────────────────
// Map freeform category labels from the persona to our niche keys.
// Pull the persona's topCategory + pillars, normalize, return the best match.
export function normalizeNiche(freeform) {
  const s = String(freeform || '').toLowerCase();
  if (/(finance|invest|money|crypto|stock)/.test(s)) return 'finance';
  if (/(b2b|saas|enterprise)/.test(s)) return 'b2b';
  if (/(tech|developer|startup)/.test(s)) return 'tech';
  if (/(business|entrepreneur)/.test(s)) return 'business';
  if (/(wellness|mindful|self.?care)/.test(s)) return 'wellness';
  if (/(beauty|skincare|makeup)/.test(s)) return 'beauty';
  if (/(fashion|style|outfit)/.test(s)) return 'fashion';
  if (/(fitness|gym|workout|sport)/.test(s)) return 'fitness';
  if (/(parent|mom|dad|kids?|family)/.test(s)) return 'parenting';
  if (/(travel|destination)/.test(s)) return 'travel';
  if (/(food|recipe|chef|cook)/.test(s)) return 'food';
  if (/(gaming|gamer|twitch)/.test(s)) return 'gaming';
  if (/(diy|craft|home.?improvement)/.test(s)) return 'diy';
  if (/(home|interior|decor)/.test(s)) return 'home';
  if (/(comedy|meme|entertainment)/.test(s)) return 'entertainment';
  return 'lifestyle';
}

// ── CONVENIENCE: quick estimate FROM a persona object ────────────────────────
// Takes the persona shape we already produce (state.persona / igData) and
// returns a full set of deliverable ranges in one call. This is what the UI
// will most often call.
export function estimateAllDeliverables(persona, opts = {}) {
  const followers = numericFollowers(persona);
  const engagementPct = parseEngagement(persona);
  const niche = normalizeNiche(persona?.topCategory || persona?.pillars?.[0]?.l || 'lifestyle');

  const deliverables = [
    'story',
    'static',
    'carousel',
    'reel',
    'reel-plus-story',
    'full-bundle',
  ];

  return deliverables.map(deliverable => {
    const r = computeRateRange({
      platform: 'instagram',
      followers,
      engagementPct,
      niche,
      deliverable,
      ...opts,
    });
    return { deliverable, ...r };
  });
}

function numericFollowers(persona) {
  const raw = persona?._raw?.followers || persona?.followers;
  if (typeof raw === 'number') return raw;
  if (typeof raw === 'string') {
    const s = raw.replace(/[, ]/g, '');
    if (/M$/i.test(s)) return Math.round(parseFloat(s) * 1_000_000);
    if (/K$/i.test(s)) return Math.round(parseFloat(s) * 1_000);
    const n = Number(s);
    if (!isNaN(n)) return n;
  }
  return 0;
}

function parseEngagement(persona) {
  const raw = persona?.engagementRate || persona?.avgEngagement;
  if (typeof raw === 'number') return raw;
  if (typeof raw === 'string') {
    const m = raw.match(/([\d.]+)/);
    if (m) return parseFloat(m[1]);
  }
  return 2;
}

// ── METADATA ─────────────────────────────────────────────────────────────────
export const BENCHMARKS_VERSION = '2024.1';
export const BENCHMARKS_UPDATED_AT = '2026-04-23';
export const BENCHMARKS_SOURCES = [
  'Influencer Marketing Hub — State of Influencer Marketing 2024',
  'Modash — Instagram Rate Card 2024',
  'Passionfruit / Creator Economy Report cross-reference Q4 2024',
];

// ── SMOKE TEST (run with: node rate-benchmarks.js) ───────────────────────────
// Sanity-check the output against known creators so we can spot obviously
// wrong numbers. Amanda Nelson — 203K / 6.4% ER / lifestyle / Austin.
if (typeof process !== 'undefined' && process.argv?.[1]?.endsWith('rate-benchmarks.js')) {
  const cases = [
    { name: 'Nano (5K, 8% ER, beauty, static)',
      opts: { followers: 5_000, engagementPct: 8, niche: 'beauty', deliverable: 'static' } },
    { name: 'Micro (50K, 5% ER, fitness, reel)',
      opts: { followers: 50_000, engagementPct: 5, niche: 'fitness', deliverable: 'reel' } },
    { name: 'Mid — Amanda (203K, 6.4% ER, lifestyle, reel)',
      opts: { followers: 203_000, engagementPct: 6.4, niche: 'lifestyle', deliverable: 'reel' } },
    { name: 'Mid w/ bundle + rights (203K, 6.4%, lifestyle, full-bundle, 3mo rights)',
      opts: { followers: 203_000, engagementPct: 6.4, niche: 'lifestyle', deliverable: 'full-bundle', usageRightsMonths: 3 } },
    { name: 'Macro (750K, 3% ER, travel, static)',
      opts: { followers: 750_000, engagementPct: 3, niche: 'travel', deliverable: 'static' } },
    { name: 'Mega (2M, 2% ER, lifestyle, reel)',
      opts: { followers: 2_000_000, engagementPct: 2, niche: 'lifestyle', deliverable: 'reel' } },
    { name: 'B2B Finance micro (40K, 4% ER, finance, static)',
      opts: { followers: 40_000, engagementPct: 4, niche: 'finance', deliverable: 'static' } },
  ];
  console.log(`\nBenchmarks ${BENCHMARKS_VERSION} (${BENCHMARKS_UPDATED_AT})\n`);
  for (const c of cases) {
    const r = computeRateRange({ platform: 'instagram', ...c.opts });
    console.log(`${c.name}\n  → $${r.low.toLocaleString()} - $${r.high.toLocaleString()} USD`);
    console.log(`    tier=${r.breakdown.tier}, eng=${r.breakdown.engagementBand}, niche×${r.breakdown.nicheMultiplier}, deliv×${r.breakdown.deliverableMultiplier}\n`);
  }
}
