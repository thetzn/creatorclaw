-- ─────────────────────────────────────────────────────────────────────────────
-- Pipeline tool: creator-owned deal flow.
--
-- Each row is one brand deal a creator is tracking, from first DM to final
-- payment. Replaces the localStorage-only MVP. Frontend reads/writes through
-- Supabase when the user is logged in; falls back to localStorage when
-- logged out (try-first flow), and migrates local rows on first login.
--
-- Run in the Supabase SQL editor. Idempotent.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS creator_deals (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  brand_name    TEXT NOT NULL,
  brand_domain  TEXT,
  status        TEXT NOT NULL DEFAULT 'outreach'
                CHECK (status IN ('inbound','outreach','in_progress','negotiating','producing','closed')),
  platform      TEXT,                       -- 'Instagram' | 'TikTok' | 'YouTube' | 'Other'
  deliverable   TEXT,                       -- 'Reel' | 'Static' | 'Carousel' | 'Story set' | etc.
  amount_usd    NUMERIC(10,2) NOT NULL DEFAULT 0 CHECK (amount_usd >= 0),
  notes         TEXT,
  due_date      DATE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE creator_deals IS
  'Per-creator deal pipeline. One row = one brand conversation, from inbound to closed/paid.';

CREATE INDEX IF NOT EXISTS idx_creator_deals_user_status
  ON creator_deals (user_id, status);
CREATE INDEX IF NOT EXISTS idx_creator_deals_user_updated
  ON creator_deals (user_id, updated_at DESC);

-- Auto-bump updated_at on every UPDATE.
CREATE OR REPLACE FUNCTION creator_deals_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_creator_deals_updated_at ON creator_deals;
CREATE TRIGGER trg_creator_deals_updated_at
  BEFORE UPDATE ON creator_deals
  FOR EACH ROW EXECUTE FUNCTION creator_deals_set_updated_at();

-- RLS: each creator sees only their own deals.
ALTER TABLE creator_deals ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "creator_deals_own_select" ON creator_deals;
CREATE POLICY "creator_deals_own_select" ON creator_deals
  FOR SELECT USING (user_id = auth.uid());

DROP POLICY IF EXISTS "creator_deals_own_insert" ON creator_deals;
CREATE POLICY "creator_deals_own_insert" ON creator_deals
  FOR INSERT WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "creator_deals_own_update" ON creator_deals;
CREATE POLICY "creator_deals_own_update" ON creator_deals
  FOR UPDATE USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "creator_deals_own_delete" ON creator_deals;
CREATE POLICY "creator_deals_own_delete" ON creator_deals
  FOR DELETE USING (user_id = auth.uid());
