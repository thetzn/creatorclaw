-- ─────────────────────────────────────────────────────────────────────────────
-- Rate data: industry benchmarks + creator-submitted actual rates
--
-- Two tables:
--   rate_benchmarks             — per platform/tier base rate ranges, seeded
--                                 from published industry reports. Refreshed
--                                 quarterly.
--   creator_submitted_rates     — actual deals reported by creators (flywheel
--                                 data). Eventually replaces benchmarks as
--                                 the primary signal.
--
-- Plus a view (rate_aggregates) that anonymizes + buckets submitted rates by
-- platform/tier/niche/deliverable so the rate estimator can blend benchmark
-- + peer-median without exposing individual rows.
--
-- Run this in the Supabase SQL editor. Idempotent (uses IF NOT EXISTS and
-- ON CONFLICT).
-- ─────────────────────────────────────────────────────────────────────────────

-- ── BENCHMARKS TABLE ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS rate_benchmarks (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  platform         TEXT NOT NULL CHECK (platform IN ('instagram', 'tiktok', 'youtube')),
  tier             TEXT NOT NULL CHECK (tier IN ('nano', 'micro', 'mid', 'macro', 'mega')),
  base_per_1k_low  NUMERIC(10,2) NOT NULL,
  base_per_1k_high NUMERIC(10,2) NOT NULL,
  tier_label       TEXT NOT NULL,                -- human-readable tier range
  unit             TEXT NOT NULL DEFAULT 'follower',  -- 'follower' | 'view'
  source           TEXT NOT NULL,                -- 'imh_2024', 'modash_2024', etc.
  source_notes     TEXT,
  version          TEXT NOT NULL DEFAULT '2024.1',
  created_at       TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(platform, tier, version)
);

COMMENT ON TABLE rate_benchmarks IS
  'Industry-published baseline rates per platform/tier. Not user data. Refresh quarterly.';

-- ── CREATOR-SUBMITTED RATES TABLE ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS creator_submitted_rates (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  creator_handle         TEXT,                   -- optional, for founder-seed rows without a user_id
  brand_name             TEXT,
  brand_domain           TEXT,
  platform               TEXT NOT NULL CHECK (platform IN ('instagram', 'tiktok', 'youtube', 'other')),
  followers_at_time      INTEGER,
  engagement_pct_at_time NUMERIC(5,2),
  niche                  TEXT,
  deliverable            TEXT NOT NULL,          -- 'static' | 'reel' | 'carousel' | 'story' | 'full-bundle' | etc.
  amount_usd             NUMERIC(10,2) NOT NULL CHECK (amount_usd >= 0),
  currency               TEXT DEFAULT 'USD',
  rights_months          INTEGER DEFAULT 0,
  exclusivity_days       INTEGER DEFAULT 0,
  whitelisting           BOOLEAN DEFAULT FALSE,
  rush                   BOOLEAN DEFAULT FALSE,
  -- Where this row came from
  source                 TEXT NOT NULL DEFAULT 'creator_submitted'
                         CHECK (source IN ('creator_submitted', 'founder_seed', 'imported_from_partner', 'survey')),
  verified               BOOLEAN DEFAULT FALSE,  -- TRUE when we have contract/screenshot/etc.
  notes                  TEXT,
  deal_date              DATE,                   -- when the deal happened
  created_at             TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE creator_submitted_rates IS
  'Real deal amounts reported by creators. The flywheel. Aggregated (with k-anon threshold) for peer-rate estimates.';

CREATE INDEX IF NOT EXISTS idx_submitted_rates_lookup
  ON creator_submitted_rates (platform, deliverable, followers_at_time);

-- ── RLS ─────────────────────────────────────────────────────────────────────
ALTER TABLE rate_benchmarks ENABLE ROW LEVEL SECURITY;
ALTER TABLE creator_submitted_rates ENABLE ROW LEVEL SECURITY;

-- Benchmarks: readable by anyone authenticated (including anon Worker calls
-- via the service role, which bypasses RLS anyway).
DROP POLICY IF EXISTS "benchmarks_read_all" ON rate_benchmarks;
CREATE POLICY "benchmarks_read_all" ON rate_benchmarks
  FOR SELECT USING (TRUE);

-- Submitted rates: each creator sees only their own rows.
DROP POLICY IF EXISTS "submitted_rates_own" ON creator_submitted_rates;
CREATE POLICY "submitted_rates_own" ON creator_submitted_rates
  FOR ALL USING (user_id = auth.uid());

-- ── AGGREGATE VIEW (anonymized, k-anonymity threshold of 3) ─────────────────
CREATE OR REPLACE VIEW rate_aggregates AS
SELECT
  platform,
  CASE
    WHEN followers_at_time IS NULL THEN 'unknown'
    WHEN followers_at_time < 10000   THEN 'nano'
    WHEN followers_at_time < 100000  THEN 'micro'
    WHEN followers_at_time < 500000  THEN 'mid'
    WHEN followers_at_time < 1000000 THEN 'macro'
    ELSE 'mega'
  END AS tier,
  COALESCE(NULLIF(niche, ''), 'unknown') AS niche,
  deliverable,
  COUNT(*)::INTEGER AS n,
  PERCENTILE_CONT(0.5)  WITHIN GROUP (ORDER BY amount_usd)::NUMERIC(10,2) AS p50,
  PERCENTILE_CONT(0.25) WITHIN GROUP (ORDER BY amount_usd)::NUMERIC(10,2) AS p25,
  PERCENTILE_CONT(0.75) WITHIN GROUP (ORDER BY amount_usd)::NUMERIC(10,2) AS p75,
  MIN(amount_usd)::NUMERIC(10,2) AS min,
  MAX(amount_usd)::NUMERIC(10,2) AS max
FROM creator_submitted_rates
WHERE amount_usd > 0
GROUP BY 1, 2, 3, 4
HAVING COUNT(*) >= 3;  -- k-anonymity: don't expose buckets smaller than 3

-- Make the view readable by anon/authenticated (bypasses RLS on the view).
GRANT SELECT ON rate_aggregates TO anon, authenticated;

-- ── SEED: industry benchmarks (IMH 2024 + Modash 2024 cross-referenced) ─────
-- Values identical to the constants in rate-benchmarks.js. Keep those in sync
-- until the Worker starts reading from this table.
INSERT INTO rate_benchmarks (platform, tier, base_per_1k_low, base_per_1k_high, tier_label, unit, source, version) VALUES
  -- Instagram, per 1K followers
  ('instagram', 'nano',   3,  15, '<10K',       'follower', 'imh_2024+modash_2024', '2024.1'),
  ('instagram', 'micro',  3,  12, '10K-100K',   'follower', 'imh_2024+modash_2024', '2024.1'),
  ('instagram', 'mid',    3,  15, '100K-500K',  'follower', 'imh_2024+modash_2024', '2024.1'),
  ('instagram', 'macro',  4,  12, '500K-1M',    'follower', 'imh_2024+modash_2024', '2024.1'),
  ('instagram', 'mega',   5,  15, '1M+',        'follower', 'imh_2024+modash_2024', '2024.1'),
  -- TikTok, per 1K followers
  ('tiktok',    'nano',   1,  7,  '<10K',       'follower', 'imh_2024+modash_2024', '2024.1'),
  ('tiktok',    'micro',  2,  8,  '10K-100K',   'follower', 'imh_2024+modash_2024', '2024.1'),
  ('tiktok',    'mid',    2,  10, '100K-500K',  'follower', 'imh_2024+modash_2024', '2024.1'),
  ('tiktok',    'macro',  3,  8,  '500K-1M',    'follower', 'imh_2024+modash_2024', '2024.1'),
  ('tiktok',    'mega',   3,  10, '1M+',        'follower', 'imh_2024+modash_2024', '2024.1'),
  -- YouTube, per 1K views
  ('youtube',   'nano',   10, 25, '<10K subs',  'view',     'imh_2024+modash_2024', '2024.1'),
  ('youtube',   'micro',  15, 35, '10K-100K',   'view',     'imh_2024+modash_2024', '2024.1'),
  ('youtube',   'mid',    20, 50, '100K-500K',  'view',     'imh_2024+modash_2024', '2024.1'),
  ('youtube',   'macro',  25, 70, '500K-1M',    'view',     'imh_2024+modash_2024', '2024.1'),
  ('youtube',   'mega',   30, 90, '1M+',        'view',     'imh_2024+modash_2024', '2024.1')
ON CONFLICT (platform, tier, version) DO UPDATE SET
  base_per_1k_low  = EXCLUDED.base_per_1k_low,
  base_per_1k_high = EXCLUDED.base_per_1k_high,
  tier_label       = EXCLUDED.tier_label,
  unit             = EXCLUDED.unit,
  source           = EXCLUDED.source;

-- ── SEED: creator-submitted rates (founder seed — user to fill in) ──────────
-- TODO: replace the two placeholder rows below with the real rates you have.
-- user_id can be NULL for founder_seed rows.
-- INSERT INTO creator_submitted_rates (
--   user_id, creator_handle, brand_name, brand_domain, platform,
--   followers_at_time, engagement_pct_at_time, niche, deliverable,
--   amount_usd, rights_months, exclusivity_days, whitelisting,
--   source, verified, notes, deal_date
-- ) VALUES
--   (NULL, '@creator1', 'Brand A', 'branda.com', 'instagram',
--    <followers>, <engagement_pct>, '<niche>', '<deliverable>',
--    <amount>, 0, 0, FALSE,
--    'founder_seed', TRUE, '<notes>', '<YYYY-MM-DD>'),
--   (NULL, '@creator2', 'Brand B', 'brandb.com', 'instagram',
--    <followers>, <engagement_pct>, '<niche>', '<deliverable>',
--    <amount>, 0, 0, FALSE,
--    'founder_seed', TRUE, '<notes>', '<YYYY-MM-DD>');
