-- Cyber audit 1: RLS reinforcement for legacy user-data tables.
--
-- Some early production tables (personas, conversations, messages,
-- ig_connections) predate the checked-in table-creation migrations. This
-- migration is intentionally conditional: it hardens those tables when they
-- exist, while staying safe for new environments that do not have them yet.

DO $$
BEGIN
  IF to_regclass('public.personas') IS NOT NULL
     AND EXISTS (
       SELECT 1 FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = 'personas' AND column_name = 'user_id'
     ) THEN
    EXECUTE 'ALTER TABLE public.personas ENABLE ROW LEVEL SECURITY';
    EXECUTE 'ALTER TABLE public.personas FORCE ROW LEVEL SECURITY';
    EXECUTE 'DROP POLICY IF EXISTS "personas_own_select" ON public.personas';
    EXECUTE 'CREATE POLICY "personas_own_select" ON public.personas FOR SELECT TO authenticated USING (user_id = auth.uid())';
    EXECUTE 'DROP POLICY IF EXISTS "personas_own_insert" ON public.personas';
    EXECUTE 'CREATE POLICY "personas_own_insert" ON public.personas FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid())';
    EXECUTE 'DROP POLICY IF EXISTS "personas_own_update" ON public.personas';
    EXECUTE 'CREATE POLICY "personas_own_update" ON public.personas FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid())';
    EXECUTE 'DROP POLICY IF EXISTS "personas_own_delete" ON public.personas';
    EXECUTE 'CREATE POLICY "personas_own_delete" ON public.personas FOR DELETE TO authenticated USING (user_id = auth.uid())';
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
    EXECUTE 'DROP POLICY IF EXISTS "conversations_own_select" ON public.conversations';
    EXECUTE 'CREATE POLICY "conversations_own_select" ON public.conversations FOR SELECT TO authenticated USING (user_id = auth.uid())';
    EXECUTE 'DROP POLICY IF EXISTS "conversations_own_insert" ON public.conversations';
    EXECUTE 'CREATE POLICY "conversations_own_insert" ON public.conversations FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid())';
    EXECUTE 'DROP POLICY IF EXISTS "conversations_own_update" ON public.conversations';
    EXECUTE 'CREATE POLICY "conversations_own_update" ON public.conversations FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid())';
    EXECUTE 'DROP POLICY IF EXISTS "conversations_own_delete" ON public.conversations';
    EXECUTE 'CREATE POLICY "conversations_own_delete" ON public.conversations FOR DELETE TO authenticated USING (user_id = auth.uid())';
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
    EXECUTE 'DROP POLICY IF EXISTS "messages_own_select" ON public.messages';
    EXECUTE 'CREATE POLICY "messages_own_select" ON public.messages FOR SELECT TO authenticated USING (user_id = auth.uid())';
    EXECUTE 'DROP POLICY IF EXISTS "messages_own_insert" ON public.messages';
    EXECUTE 'CREATE POLICY "messages_own_insert" ON public.messages FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid())';
    EXECUTE 'DROP POLICY IF EXISTS "messages_own_update" ON public.messages';
    EXECUTE 'CREATE POLICY "messages_own_update" ON public.messages FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid())';
    EXECUTE 'DROP POLICY IF EXISTS "messages_own_delete" ON public.messages';
    EXECUTE 'CREATE POLICY "messages_own_delete" ON public.messages FOR DELETE TO authenticated USING (user_id = auth.uid())';
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
    EXECUTE 'DROP POLICY IF EXISTS "ig_connections_own_select" ON public.ig_connections';
    EXECUTE 'CREATE POLICY "ig_connections_own_select" ON public.ig_connections FOR SELECT TO authenticated USING (user_id = auth.uid())';
    EXECUTE 'DROP POLICY IF EXISTS "ig_connections_own_insert" ON public.ig_connections';
    EXECUTE 'CREATE POLICY "ig_connections_own_insert" ON public.ig_connections FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid())';
    EXECUTE 'DROP POLICY IF EXISTS "ig_connections_own_update" ON public.ig_connections';
    EXECUTE 'CREATE POLICY "ig_connections_own_update" ON public.ig_connections FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid())';
    EXECUTE 'DROP POLICY IF EXISTS "ig_connections_own_delete" ON public.ig_connections';
    EXECUTE 'CREATE POLICY "ig_connections_own_delete" ON public.ig_connections FOR DELETE TO authenticated USING (user_id = auth.uid())';
    EXECUTE 'REVOKE ALL ON public.ig_connections FROM anon';
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON public.ig_connections TO authenticated';
    EXECUTE 'REVOKE TRUNCATE, REFERENCES, TRIGGER ON public.ig_connections FROM authenticated';
  END IF;
END $$;

ALTER TABLE IF EXISTS public.creator_deals FORCE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.creator_facts FORCE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.creator_submitted_rates FORCE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.google_workspace_connections FORCE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.user_telegram_links FORCE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.telegram_link_codes FORCE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.telegram_pending_actions FORCE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.bug_reports FORCE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.brand_intel FORCE ROW LEVEL SECURITY;
