-- creator_facts: lightweight long-term memory for the agent.
-- Stores stable preferences, outcomes, and strategy decisions the agent
-- learns from conversation, keyed by a short label so updates overwrite
-- prior values for the same concept.
--
-- Examples of what belongs here:
--   key='preferred_pitch_tone'           value='warm, slightly self-deprecating, no hype words'
--   key='avoid_words'                    value='synergy, unlock, amplify'
--   key='brand_lululemon_payment_speed'  value='30 days, paid on time twice'
--   key='negotiation_floor_reel_ig'      value='$1500 minimum even for tiny brands'
--
-- NOT for: facts already in scraped_data / persona (followers, niche, etc.)

CREATE TABLE IF NOT EXISTS creator_facts (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  key         TEXT NOT NULL,
  value       TEXT NOT NULL,
  category    TEXT NOT NULL DEFAULT 'general'
              CHECK (category IN ('voice','preferences','brand_history','negotiation','workflow','general')),
  source      TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, key)
);

CREATE INDEX IF NOT EXISTS idx_creator_facts_user_category
  ON creator_facts (user_id, category);
CREATE INDEX IF NOT EXISTS idx_creator_facts_user_updated
  ON creator_facts (user_id, updated_at DESC);

CREATE OR REPLACE FUNCTION creator_facts_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS creator_facts_updated_at ON creator_facts;
CREATE TRIGGER creator_facts_updated_at
  BEFORE UPDATE ON creator_facts
  FOR EACH ROW EXECUTE FUNCTION creator_facts_set_updated_at();

ALTER TABLE creator_facts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "creator_facts_own_select" ON creator_facts;
CREATE POLICY "creator_facts_own_select" ON creator_facts
  FOR SELECT USING (user_id = auth.uid());

DROP POLICY IF EXISTS "creator_facts_own_insert" ON creator_facts;
CREATE POLICY "creator_facts_own_insert" ON creator_facts
  FOR INSERT WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "creator_facts_own_update" ON creator_facts;
CREATE POLICY "creator_facts_own_update" ON creator_facts
  FOR UPDATE USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "creator_facts_own_delete" ON creator_facts;
CREATE POLICY "creator_facts_own_delete" ON creator_facts
  FOR DELETE USING (user_id = auth.uid());
