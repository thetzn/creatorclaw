-- Cyber audit 1: RLS, grant, and advisor reinforcement.
--
-- Some early production tables (personas, conversations, messages,
-- ig_connections) predate the checked-in table-creation migrations. This
-- migration is intentionally conditional where needed: it hardens existing
-- production tables while staying safe for fresh environments.

CREATE SCHEMA IF NOT EXISTS private;
REVOKE ALL ON SCHEMA private FROM PUBLIC;

-- Legacy user-data tables: replace old broad "public" policies with
-- authenticated, own-row policies and remove anon table grants.
DO $$
BEGIN
  IF to_regclass('public.personas') IS NOT NULL
     AND EXISTS (
       SELECT 1 FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = 'personas' AND column_name = 'user_id'
     ) THEN
    EXECUTE 'ALTER TABLE public.personas ENABLE ROW LEVEL SECURITY';
    EXECUTE 'ALTER TABLE public.personas FORCE ROW LEVEL SECURITY';
    EXECUTE 'DROP POLICY IF EXISTS "users own their personas" ON public.personas';
    EXECUTE 'DROP POLICY IF EXISTS "personas_own_select" ON public.personas';
    EXECUTE 'CREATE POLICY "personas_own_select" ON public.personas FOR SELECT TO authenticated USING ((select auth.uid()) IS NOT NULL AND user_id = (select auth.uid()))';
    EXECUTE 'DROP POLICY IF EXISTS "personas_own_insert" ON public.personas';
    EXECUTE 'CREATE POLICY "personas_own_insert" ON public.personas FOR INSERT TO authenticated WITH CHECK ((select auth.uid()) IS NOT NULL AND user_id = (select auth.uid()))';
    EXECUTE 'DROP POLICY IF EXISTS "personas_own_update" ON public.personas';
    EXECUTE 'CREATE POLICY "personas_own_update" ON public.personas FOR UPDATE TO authenticated USING ((select auth.uid()) IS NOT NULL AND user_id = (select auth.uid())) WITH CHECK ((select auth.uid()) IS NOT NULL AND user_id = (select auth.uid()))';
    EXECUTE 'DROP POLICY IF EXISTS "personas_own_delete" ON public.personas';
    EXECUTE 'CREATE POLICY "personas_own_delete" ON public.personas FOR DELETE TO authenticated USING ((select auth.uid()) IS NOT NULL AND user_id = (select auth.uid()))';
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_personas_user_id ON public.personas(user_id)';
    EXECUTE 'REVOKE ALL ON public.personas FROM anon';
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON public.personas TO authenticated';
    EXECUTE 'REVOKE TRUNCATE, REFERENCES, TRIGGER ON public.personas FROM authenticated';
  END IF;

  IF to_regclass('public.conversations') IS NOT NULL
     AND EXISTS (
       SELECT 1 FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = 'conversations' AND column_name = 'user_id'
     ) THEN
    EXECUTE 'ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY';
    EXECUTE 'ALTER TABLE public.conversations FORCE ROW LEVEL SECURITY';
    EXECUTE 'DROP POLICY IF EXISTS "users own their conversations" ON public.conversations';
    EXECUTE 'DROP POLICY IF EXISTS "conversations_own_select" ON public.conversations';
    EXECUTE 'CREATE POLICY "conversations_own_select" ON public.conversations FOR SELECT TO authenticated USING ((select auth.uid()) IS NOT NULL AND user_id = (select auth.uid()))';
    EXECUTE 'DROP POLICY IF EXISTS "conversations_own_insert" ON public.conversations';
    EXECUTE 'CREATE POLICY "conversations_own_insert" ON public.conversations FOR INSERT TO authenticated WITH CHECK ((select auth.uid()) IS NOT NULL AND user_id = (select auth.uid()))';
    EXECUTE 'DROP POLICY IF EXISTS "conversations_own_update" ON public.conversations';
    EXECUTE 'CREATE POLICY "conversations_own_update" ON public.conversations FOR UPDATE TO authenticated USING ((select auth.uid()) IS NOT NULL AND user_id = (select auth.uid())) WITH CHECK ((select auth.uid()) IS NOT NULL AND user_id = (select auth.uid()))';
    EXECUTE 'DROP POLICY IF EXISTS "conversations_own_delete" ON public.conversations';
    EXECUTE 'CREATE POLICY "conversations_own_delete" ON public.conversations FOR DELETE TO authenticated USING ((select auth.uid()) IS NOT NULL AND user_id = (select auth.uid()))';
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_conversations_user_id ON public.conversations(user_id)';
    EXECUTE 'REVOKE ALL ON public.conversations FROM anon';
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON public.conversations TO authenticated';
    EXECUTE 'REVOKE TRUNCATE, REFERENCES, TRIGGER ON public.conversations FROM authenticated';
  END IF;

  IF to_regclass('public.messages') IS NOT NULL
     AND EXISTS (
       SELECT 1 FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = 'messages' AND column_name = 'user_id'
     ) THEN
    EXECUTE 'ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY';
    EXECUTE 'ALTER TABLE public.messages FORCE ROW LEVEL SECURITY';
    EXECUTE 'DROP POLICY IF EXISTS "users own their messages" ON public.messages';
    EXECUTE 'DROP POLICY IF EXISTS "messages_own_select" ON public.messages';
    EXECUTE 'CREATE POLICY "messages_own_select" ON public.messages FOR SELECT TO authenticated USING ((select auth.uid()) IS NOT NULL AND user_id = (select auth.uid()))';
    EXECUTE 'DROP POLICY IF EXISTS "messages_own_insert" ON public.messages';
    EXECUTE 'CREATE POLICY "messages_own_insert" ON public.messages FOR INSERT TO authenticated WITH CHECK ((select auth.uid()) IS NOT NULL AND user_id = (select auth.uid()))';
    EXECUTE 'DROP POLICY IF EXISTS "messages_own_update" ON public.messages';
    EXECUTE 'CREATE POLICY "messages_own_update" ON public.messages FOR UPDATE TO authenticated USING ((select auth.uid()) IS NOT NULL AND user_id = (select auth.uid())) WITH CHECK ((select auth.uid()) IS NOT NULL AND user_id = (select auth.uid()))';
    EXECUTE 'DROP POLICY IF EXISTS "messages_own_delete" ON public.messages';
    EXECUTE 'CREATE POLICY "messages_own_delete" ON public.messages FOR DELETE TO authenticated USING ((select auth.uid()) IS NOT NULL AND user_id = (select auth.uid()))';
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_messages_user_id ON public.messages(user_id)';
    EXECUTE 'REVOKE ALL ON public.messages FROM anon';
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON public.messages TO authenticated';
    EXECUTE 'REVOKE TRUNCATE, REFERENCES, TRIGGER ON public.messages FROM authenticated';
  END IF;

  IF to_regclass('public.ig_connections') IS NOT NULL
     AND EXISTS (
       SELECT 1 FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = 'ig_connections' AND column_name = 'user_id'
     ) THEN
    EXECUTE 'ALTER TABLE public.ig_connections ENABLE ROW LEVEL SECURITY';
    EXECUTE 'ALTER TABLE public.ig_connections FORCE ROW LEVEL SECURITY';
    EXECUTE 'DROP POLICY IF EXISTS "users own their ig connection" ON public.ig_connections';
    EXECUTE 'DROP POLICY IF EXISTS "ig_connections_own_select" ON public.ig_connections';
    EXECUTE 'CREATE POLICY "ig_connections_own_select" ON public.ig_connections FOR SELECT TO authenticated USING ((select auth.uid()) IS NOT NULL AND user_id = (select auth.uid()))';
    EXECUTE 'DROP POLICY IF EXISTS "ig_connections_own_insert" ON public.ig_connections';
    EXECUTE 'CREATE POLICY "ig_connections_own_insert" ON public.ig_connections FOR INSERT TO authenticated WITH CHECK ((select auth.uid()) IS NOT NULL AND user_id = (select auth.uid()))';
    EXECUTE 'DROP POLICY IF EXISTS "ig_connections_own_update" ON public.ig_connections';
    EXECUTE 'CREATE POLICY "ig_connections_own_update" ON public.ig_connections FOR UPDATE TO authenticated USING ((select auth.uid()) IS NOT NULL AND user_id = (select auth.uid())) WITH CHECK ((select auth.uid()) IS NOT NULL AND user_id = (select auth.uid()))';
    EXECUTE 'DROP POLICY IF EXISTS "ig_connections_own_delete" ON public.ig_connections';
    EXECUTE 'CREATE POLICY "ig_connections_own_delete" ON public.ig_connections FOR DELETE TO authenticated USING ((select auth.uid()) IS NOT NULL AND user_id = (select auth.uid()))';
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_ig_connections_user_id ON public.ig_connections(user_id)';
    EXECUTE 'REVOKE ALL ON public.ig_connections FROM anon';
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON public.ig_connections TO authenticated';
    EXECUTE 'REVOKE TRUNCATE, REFERENCES, TRIGGER ON public.ig_connections FROM authenticated';
  END IF;

  IF to_regclass('public.brand_matches') IS NOT NULL
     AND EXISTS (
       SELECT 1 FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = 'brand_matches' AND column_name = 'user_id'
     ) THEN
    EXECUTE 'ALTER TABLE public.brand_matches ENABLE ROW LEVEL SECURITY';
    EXECUTE 'ALTER TABLE public.brand_matches FORCE ROW LEVEL SECURITY';
    EXECUTE 'DROP POLICY IF EXISTS "users own their brand matches" ON public.brand_matches';
    EXECUTE 'DROP POLICY IF EXISTS "brand_matches_own_select" ON public.brand_matches';
    EXECUTE 'CREATE POLICY "brand_matches_own_select" ON public.brand_matches FOR SELECT TO authenticated USING ((select auth.uid()) IS NOT NULL AND user_id = (select auth.uid()))';
    EXECUTE 'DROP POLICY IF EXISTS "brand_matches_own_insert" ON public.brand_matches';
    EXECUTE 'CREATE POLICY "brand_matches_own_insert" ON public.brand_matches FOR INSERT TO authenticated WITH CHECK ((select auth.uid()) IS NOT NULL AND user_id = (select auth.uid()))';
    EXECUTE 'DROP POLICY IF EXISTS "brand_matches_own_update" ON public.brand_matches';
    EXECUTE 'CREATE POLICY "brand_matches_own_update" ON public.brand_matches FOR UPDATE TO authenticated USING ((select auth.uid()) IS NOT NULL AND user_id = (select auth.uid())) WITH CHECK ((select auth.uid()) IS NOT NULL AND user_id = (select auth.uid()))';
    EXECUTE 'DROP POLICY IF EXISTS "brand_matches_own_delete" ON public.brand_matches';
    EXECUTE 'CREATE POLICY "brand_matches_own_delete" ON public.brand_matches FOR DELETE TO authenticated USING ((select auth.uid()) IS NOT NULL AND user_id = (select auth.uid()))';
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_brand_matches_user_id ON public.brand_matches(user_id)';
    EXECUTE 'REVOKE ALL ON public.brand_matches FROM anon';
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON public.brand_matches TO authenticated';
    EXECUTE 'REVOKE TRUNCATE, REFERENCES, TRIGGER ON public.brand_matches FROM authenticated';
  END IF;

  IF to_regclass('public.pulse_ideas') IS NOT NULL
     AND EXISTS (
       SELECT 1 FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = 'pulse_ideas' AND column_name = 'user_id'
     ) THEN
    EXECUTE 'ALTER TABLE public.pulse_ideas ENABLE ROW LEVEL SECURITY';
    EXECUTE 'ALTER TABLE public.pulse_ideas FORCE ROW LEVEL SECURITY';
    EXECUTE 'DROP POLICY IF EXISTS "users own their pulse ideas" ON public.pulse_ideas';
    EXECUTE 'DROP POLICY IF EXISTS "pulse_ideas_own_select" ON public.pulse_ideas';
    EXECUTE 'CREATE POLICY "pulse_ideas_own_select" ON public.pulse_ideas FOR SELECT TO authenticated USING ((select auth.uid()) IS NOT NULL AND user_id = (select auth.uid()))';
    EXECUTE 'DROP POLICY IF EXISTS "pulse_ideas_own_insert" ON public.pulse_ideas';
    EXECUTE 'CREATE POLICY "pulse_ideas_own_insert" ON public.pulse_ideas FOR INSERT TO authenticated WITH CHECK ((select auth.uid()) IS NOT NULL AND user_id = (select auth.uid()))';
    EXECUTE 'DROP POLICY IF EXISTS "pulse_ideas_own_update" ON public.pulse_ideas';
    EXECUTE 'CREATE POLICY "pulse_ideas_own_update" ON public.pulse_ideas FOR UPDATE TO authenticated USING ((select auth.uid()) IS NOT NULL AND user_id = (select auth.uid())) WITH CHECK ((select auth.uid()) IS NOT NULL AND user_id = (select auth.uid()))';
    EXECUTE 'DROP POLICY IF EXISTS "pulse_ideas_own_delete" ON public.pulse_ideas';
    EXECUTE 'CREATE POLICY "pulse_ideas_own_delete" ON public.pulse_ideas FOR DELETE TO authenticated USING ((select auth.uid()) IS NOT NULL AND user_id = (select auth.uid()))';
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_pulse_ideas_user_id ON public.pulse_ideas(user_id)';
    EXECUTE 'REVOKE ALL ON public.pulse_ideas FROM anon';
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON public.pulse_ideas TO authenticated';
    EXECUTE 'REVOKE TRUNCATE, REFERENCES, TRIGGER ON public.pulse_ideas FROM authenticated';
  END IF;
END $$;

-- Checked-in user-data tables: force RLS, scope policies to authenticated,
-- use initplan-friendly auth.uid(), and narrow grants to actual app needs.
DO $$
BEGIN
  IF to_regclass('public.creator_deals') IS NOT NULL THEN
    EXECUTE 'ALTER TABLE public.creator_deals ENABLE ROW LEVEL SECURITY';
    EXECUTE 'ALTER TABLE public.creator_deals FORCE ROW LEVEL SECURITY';
    EXECUTE 'DROP POLICY IF EXISTS "creator_deals_own_select" ON public.creator_deals';
    EXECUTE 'CREATE POLICY "creator_deals_own_select" ON public.creator_deals FOR SELECT TO authenticated USING ((select auth.uid()) IS NOT NULL AND user_id = (select auth.uid()))';
    EXECUTE 'DROP POLICY IF EXISTS "creator_deals_own_insert" ON public.creator_deals';
    EXECUTE 'CREATE POLICY "creator_deals_own_insert" ON public.creator_deals FOR INSERT TO authenticated WITH CHECK ((select auth.uid()) IS NOT NULL AND user_id = (select auth.uid()))';
    EXECUTE 'DROP POLICY IF EXISTS "creator_deals_own_update" ON public.creator_deals';
    EXECUTE 'CREATE POLICY "creator_deals_own_update" ON public.creator_deals FOR UPDATE TO authenticated USING ((select auth.uid()) IS NOT NULL AND user_id = (select auth.uid())) WITH CHECK ((select auth.uid()) IS NOT NULL AND user_id = (select auth.uid()))';
    EXECUTE 'DROP POLICY IF EXISTS "creator_deals_own_delete" ON public.creator_deals';
    EXECUTE 'CREATE POLICY "creator_deals_own_delete" ON public.creator_deals FOR DELETE TO authenticated USING ((select auth.uid()) IS NOT NULL AND user_id = (select auth.uid()))';
    EXECUTE 'REVOKE ALL ON public.creator_deals FROM anon';
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON public.creator_deals TO authenticated';
    EXECUTE 'REVOKE TRUNCATE, REFERENCES, TRIGGER ON public.creator_deals FROM authenticated';
  END IF;

  IF to_regclass('public.creator_facts') IS NOT NULL THEN
    EXECUTE 'ALTER TABLE public.creator_facts ENABLE ROW LEVEL SECURITY';
    EXECUTE 'ALTER TABLE public.creator_facts FORCE ROW LEVEL SECURITY';
    EXECUTE 'DROP POLICY IF EXISTS "creator_facts_own_select" ON public.creator_facts';
    EXECUTE 'CREATE POLICY "creator_facts_own_select" ON public.creator_facts FOR SELECT TO authenticated USING ((select auth.uid()) IS NOT NULL AND user_id = (select auth.uid()))';
    EXECUTE 'DROP POLICY IF EXISTS "creator_facts_own_insert" ON public.creator_facts';
    EXECUTE 'CREATE POLICY "creator_facts_own_insert" ON public.creator_facts FOR INSERT TO authenticated WITH CHECK ((select auth.uid()) IS NOT NULL AND user_id = (select auth.uid()))';
    EXECUTE 'DROP POLICY IF EXISTS "creator_facts_own_update" ON public.creator_facts';
    EXECUTE 'CREATE POLICY "creator_facts_own_update" ON public.creator_facts FOR UPDATE TO authenticated USING ((select auth.uid()) IS NOT NULL AND user_id = (select auth.uid())) WITH CHECK ((select auth.uid()) IS NOT NULL AND user_id = (select auth.uid()))';
    EXECUTE 'DROP POLICY IF EXISTS "creator_facts_own_delete" ON public.creator_facts';
    EXECUTE 'CREATE POLICY "creator_facts_own_delete" ON public.creator_facts FOR DELETE TO authenticated USING ((select auth.uid()) IS NOT NULL AND user_id = (select auth.uid()))';
    EXECUTE 'REVOKE ALL ON public.creator_facts FROM anon';
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON public.creator_facts TO authenticated';
    EXECUTE 'REVOKE TRUNCATE, REFERENCES, TRIGGER ON public.creator_facts FROM authenticated';
  END IF;

  IF to_regclass('public.creator_submitted_rates') IS NOT NULL THEN
    EXECUTE 'ALTER TABLE public.creator_submitted_rates ENABLE ROW LEVEL SECURITY';
    EXECUTE 'ALTER TABLE public.creator_submitted_rates FORCE ROW LEVEL SECURITY';
    EXECUTE 'DROP POLICY IF EXISTS "submitted_rates_own" ON public.creator_submitted_rates';
    EXECUTE 'CREATE POLICY "submitted_rates_own" ON public.creator_submitted_rates FOR ALL TO authenticated USING ((select auth.uid()) IS NOT NULL AND user_id = (select auth.uid())) WITH CHECK ((select auth.uid()) IS NOT NULL AND user_id = (select auth.uid()))';
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_creator_submitted_rates_user_id ON public.creator_submitted_rates(user_id)';
    EXECUTE 'REVOKE ALL ON public.creator_submitted_rates FROM anon';
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON public.creator_submitted_rates TO authenticated';
    EXECUTE 'REVOKE TRUNCATE, REFERENCES, TRIGGER ON public.creator_submitted_rates FROM authenticated';
  END IF;

  IF to_regclass('public.google_workspace_connections') IS NOT NULL THEN
    EXECUTE 'ALTER TABLE public.google_workspace_connections ENABLE ROW LEVEL SECURITY';
    EXECUTE 'ALTER TABLE public.google_workspace_connections FORCE ROW LEVEL SECURITY';
    EXECUTE 'DROP POLICY IF EXISTS "google_ws_own_select" ON public.google_workspace_connections';
    EXECUTE 'CREATE POLICY "google_ws_own_select" ON public.google_workspace_connections FOR SELECT TO authenticated USING ((select auth.uid()) IS NOT NULL AND user_id = (select auth.uid()))';
    EXECUTE 'DROP POLICY IF EXISTS "google_ws_own_insert" ON public.google_workspace_connections';
    EXECUTE 'CREATE POLICY "google_ws_own_insert" ON public.google_workspace_connections FOR INSERT TO authenticated WITH CHECK ((select auth.uid()) IS NOT NULL AND user_id = (select auth.uid()))';
    EXECUTE 'DROP POLICY IF EXISTS "google_ws_own_update" ON public.google_workspace_connections';
    EXECUTE 'CREATE POLICY "google_ws_own_update" ON public.google_workspace_connections FOR UPDATE TO authenticated USING ((select auth.uid()) IS NOT NULL AND user_id = (select auth.uid())) WITH CHECK ((select auth.uid()) IS NOT NULL AND user_id = (select auth.uid()))';
    EXECUTE 'DROP POLICY IF EXISTS "google_ws_own_delete" ON public.google_workspace_connections';
    EXECUTE 'CREATE POLICY "google_ws_own_delete" ON public.google_workspace_connections FOR DELETE TO authenticated USING ((select auth.uid()) IS NOT NULL AND user_id = (select auth.uid()))';
    EXECUTE 'REVOKE ALL ON public.google_workspace_connections FROM anon';
    EXECUTE 'REVOKE ALL ON public.google_workspace_connections FROM authenticated';
    EXECUTE 'GRANT SELECT (user_id, email, expires_at, created_at, updated_at) ON public.google_workspace_connections TO authenticated';
    EXECUTE 'GRANT INSERT, UPDATE, DELETE ON public.google_workspace_connections TO authenticated';
  END IF;

  IF to_regclass('public.user_telegram_links') IS NOT NULL THEN
    EXECUTE 'ALTER TABLE public.user_telegram_links ENABLE ROW LEVEL SECURITY';
    EXECUTE 'ALTER TABLE public.user_telegram_links FORCE ROW LEVEL SECURITY';
    EXECUTE 'DROP POLICY IF EXISTS "user_telegram_links_own_select" ON public.user_telegram_links';
    EXECUTE 'CREATE POLICY "user_telegram_links_own_select" ON public.user_telegram_links FOR SELECT TO authenticated USING ((select auth.uid()) IS NOT NULL AND user_id = (select auth.uid()))';
    EXECUTE 'DROP POLICY IF EXISTS "user_telegram_links_own_insert" ON public.user_telegram_links';
    EXECUTE 'CREATE POLICY "user_telegram_links_own_insert" ON public.user_telegram_links FOR INSERT TO authenticated WITH CHECK ((select auth.uid()) IS NOT NULL AND user_id = (select auth.uid()))';
    EXECUTE 'DROP POLICY IF EXISTS "user_telegram_links_own_update" ON public.user_telegram_links';
    EXECUTE 'CREATE POLICY "user_telegram_links_own_update" ON public.user_telegram_links FOR UPDATE TO authenticated USING ((select auth.uid()) IS NOT NULL AND user_id = (select auth.uid())) WITH CHECK ((select auth.uid()) IS NOT NULL AND user_id = (select auth.uid()))';
    EXECUTE 'DROP POLICY IF EXISTS "user_telegram_links_own_delete" ON public.user_telegram_links';
    EXECUTE 'CREATE POLICY "user_telegram_links_own_delete" ON public.user_telegram_links FOR DELETE TO authenticated USING ((select auth.uid()) IS NOT NULL AND user_id = (select auth.uid()))';
    EXECUTE 'REVOKE ALL ON public.user_telegram_links FROM anon';
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_telegram_links TO authenticated';
    EXECUTE 'REVOKE TRUNCATE, REFERENCES, TRIGGER ON public.user_telegram_links FROM authenticated';
  END IF;

  IF to_regclass('public.telegram_link_codes') IS NOT NULL THEN
    EXECUTE 'ALTER TABLE public.telegram_link_codes ENABLE ROW LEVEL SECURITY';
    EXECUTE 'ALTER TABLE public.telegram_link_codes FORCE ROW LEVEL SECURITY';
    EXECUTE 'DROP POLICY IF EXISTS "telegram_link_codes_no_user" ON public.telegram_link_codes';
    EXECUTE 'CREATE POLICY "telegram_link_codes_no_user" ON public.telegram_link_codes FOR ALL TO anon, authenticated USING (false) WITH CHECK (false)';
    EXECUTE 'REVOKE ALL ON public.telegram_link_codes FROM anon, authenticated';
  END IF;

  IF to_regclass('public.telegram_pending_actions') IS NOT NULL THEN
    EXECUTE 'ALTER TABLE public.telegram_pending_actions ENABLE ROW LEVEL SECURITY';
    EXECUTE 'ALTER TABLE public.telegram_pending_actions FORCE ROW LEVEL SECURITY';
    EXECUTE 'DROP POLICY IF EXISTS "telegram_pending_actions_own" ON public.telegram_pending_actions';
    EXECUTE 'CREATE POLICY "telegram_pending_actions_own" ON public.telegram_pending_actions FOR ALL TO authenticated USING ((select auth.uid()) IS NOT NULL AND user_id = (select auth.uid())) WITH CHECK ((select auth.uid()) IS NOT NULL AND user_id = (select auth.uid()))';
    EXECUTE 'REVOKE ALL ON public.telegram_pending_actions FROM anon';
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON public.telegram_pending_actions TO authenticated';
    EXECUTE 'REVOKE TRUNCATE, REFERENCES, TRIGGER ON public.telegram_pending_actions FROM authenticated';
  END IF;

  IF to_regclass('public.bug_reports') IS NOT NULL THEN
    EXECUTE 'ALTER TABLE public.bug_reports ENABLE ROW LEVEL SECURITY';
    EXECUTE 'ALTER TABLE public.bug_reports FORCE ROW LEVEL SECURITY';
    EXECUTE 'DROP POLICY IF EXISTS "bug_reports_anyone_insert" ON public.bug_reports';
    EXECUTE 'CREATE POLICY "bug_reports_anyone_insert" ON public.bug_reports FOR INSERT TO anon, authenticated WITH CHECK (user_id IS NULL OR user_id = (select auth.uid()))';
    EXECUTE 'DROP POLICY IF EXISTS "bug_reports_own_select" ON public.bug_reports';
    EXECUTE 'CREATE POLICY "bug_reports_own_select" ON public.bug_reports FOR SELECT TO authenticated USING ((select auth.uid()) IS NOT NULL AND user_id = (select auth.uid()))';
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_bug_reports_user_id ON public.bug_reports(user_id)';
    EXECUTE 'REVOKE ALL ON public.bug_reports FROM anon, authenticated';
    EXECUTE 'GRANT INSERT ON public.bug_reports TO anon';
    EXECUTE 'GRANT SELECT, INSERT ON public.bug_reports TO authenticated';
  END IF;

  IF to_regclass('public.brand_intel') IS NOT NULL THEN
    EXECUTE 'ALTER TABLE public.brand_intel ENABLE ROW LEVEL SECURITY';
    EXECUTE 'ALTER TABLE public.brand_intel FORCE ROW LEVEL SECURITY';
    EXECUTE 'DROP POLICY IF EXISTS "brand_intel_no_client_access" ON public.brand_intel';
    EXECUTE 'CREATE POLICY "brand_intel_no_client_access" ON public.brand_intel FOR ALL TO anon, authenticated USING (false) WITH CHECK (false)';
    EXECUTE 'REVOKE ALL ON public.brand_intel FROM anon, authenticated';
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON public.brand_intel TO service_role';
  END IF;

  IF to_regclass('public.rate_benchmarks') IS NOT NULL THEN
    EXECUTE 'ALTER TABLE public.rate_benchmarks ENABLE ROW LEVEL SECURITY';
    EXECUTE 'ALTER TABLE public.rate_benchmarks FORCE ROW LEVEL SECURITY';
    EXECUTE 'DROP POLICY IF EXISTS "benchmarks_read_all" ON public.rate_benchmarks';
    EXECUTE 'CREATE POLICY "benchmarks_read_all" ON public.rate_benchmarks FOR SELECT TO anon, authenticated USING (true)';
    EXECUTE 'REVOKE ALL ON public.rate_benchmarks FROM anon, authenticated';
    EXECUTE 'GRANT SELECT ON public.rate_benchmarks TO anon, authenticated';
  END IF;
END $$;

-- Replace the public security-definer aggregate view with a public aggregate
-- cache table. The Worker reads the same REST path, but browser roles no
-- longer query a security-definer view over creator-submitted rows.
DO $$
DECLARE
  rate_kind "char";
BEGIN
  SELECT c.relkind INTO rate_kind
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relname = 'rate_aggregates';

  IF rate_kind = 'v' THEN
    EXECUTE 'DROP VIEW public.rate_aggregates';
  ELSIF rate_kind = 'm' THEN
    EXECUTE 'DROP MATERIALIZED VIEW public.rate_aggregates';
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.rate_aggregates (
  platform text not null,
  tier text not null,
  niche text not null,
  deliverable text not null,
  n integer,
  p50 numeric(10,2),
  p25 numeric(10,2),
  p75 numeric(10,2),
  min numeric(10,2),
  max numeric(10,2),
  refreshed_at timestamptz not null default now(),
  primary key (platform, tier, niche, deliverable)
);

ALTER TABLE public.rate_aggregates ALTER COLUMN platform SET NOT NULL;
ALTER TABLE public.rate_aggregates ALTER COLUMN tier SET NOT NULL;
ALTER TABLE public.rate_aggregates ALTER COLUMN niche SET NOT NULL;
ALTER TABLE public.rate_aggregates ALTER COLUMN deliverable SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.rate_aggregates'::regclass
      AND contype = 'p'
  ) THEN
    ALTER TABLE public.rate_aggregates
      ADD CONSTRAINT rate_aggregates_pkey PRIMARY KEY (platform, tier, niche, deliverable);
  END IF;
END $$;

DROP INDEX IF EXISTS public.idx_rate_aggregates_lookup;

ALTER TABLE public.rate_aggregates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rate_aggregates FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "rate_aggregates_read_all" ON public.rate_aggregates;
CREATE POLICY "rate_aggregates_read_all" ON public.rate_aggregates
  FOR SELECT TO anon, authenticated USING (true);

REVOKE ALL ON public.rate_aggregates FROM anon, authenticated;
GRANT SELECT ON public.rate_aggregates TO anon, authenticated;

CREATE OR REPLACE FUNCTION private.rebuild_rate_aggregates()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  TRUNCATE TABLE public.rate_aggregates;
  INSERT INTO public.rate_aggregates (
    platform, tier, niche, deliverable, n, p50, p25, p75, min, max, refreshed_at
  )
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
    COUNT(*)::integer AS n,
    PERCENTILE_CONT(0.5)  WITHIN GROUP (ORDER BY amount_usd)::numeric(10,2) AS p50,
    PERCENTILE_CONT(0.25) WITHIN GROUP (ORDER BY amount_usd)::numeric(10,2) AS p25,
    PERCENTILE_CONT(0.75) WITHIN GROUP (ORDER BY amount_usd)::numeric(10,2) AS p75,
    MIN(amount_usd)::numeric(10,2) AS min,
    MAX(amount_usd)::numeric(10,2) AS max,
    now() AS refreshed_at
  FROM public.creator_submitted_rates
  WHERE amount_usd > 0
  GROUP BY 1, 2, 3, 4
  HAVING COUNT(*) >= 3;
END;
$$;

CREATE OR REPLACE FUNCTION private.refresh_rate_aggregates_trigger()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  PERFORM private.rebuild_rate_aggregates();
  RETURN NULL;
END;
$$;

SELECT private.rebuild_rate_aggregates();

DROP TRIGGER IF EXISTS creator_submitted_rates_refresh_rate_aggregates
  ON public.creator_submitted_rates;
CREATE TRIGGER creator_submitted_rates_refresh_rate_aggregates
  AFTER INSERT OR UPDATE OR DELETE OR TRUNCATE ON public.creator_submitted_rates
  FOR EACH STATEMENT EXECUTE FUNCTION private.refresh_rate_aggregates_trigger();

-- Harden mutable search_path warnings on existing trigger functions.
DO $$
BEGIN
  IF to_regprocedure('public.creator_deals_set_updated_at()') IS NOT NULL THEN
    EXECUTE 'ALTER FUNCTION public.creator_deals_set_updated_at() SET search_path = public, pg_temp';
  END IF;
  IF to_regprocedure('public.creator_facts_set_updated_at()') IS NOT NULL THEN
    EXECUTE 'ALTER FUNCTION public.creator_facts_set_updated_at() SET search_path = public, pg_temp';
  END IF;
  IF to_regprocedure('public.google_workspace_connections_set_updated_at()') IS NOT NULL THEN
    EXECUTE 'ALTER FUNCTION public.google_workspace_connections_set_updated_at() SET search_path = public, pg_temp';
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
