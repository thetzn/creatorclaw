-- ─────────────────────────────────────────────────────────────────────────────
-- Bug reports: in-app capture from any user (signed-in or anonymous
-- onboarders).
--
-- The header bug-icon button opens a small modal with a description field +
-- optional category, captures runtime context (URL, viewport, user agent,
-- current chat tool, signed-in user info, IG handle, theme), and inserts
-- one row here. We read in the dashboard via service role.
--
-- Run in the Supabase SQL editor. Idempotent.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS bug_reports (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  email        TEXT,                      -- captured at submit time (denormalized — survives user deletion)
  description  TEXT NOT NULL CHECK (length(description) BETWEEN 1 AND 4000),
  category     TEXT CHECK (category IS NULL OR category IN ('ui','content','feature','data','other')),
  context      JSONB,                     -- url, viewport, userAgent, tool, ig_handle, theme, ts
  status       TEXT NOT NULL DEFAULT 'open'
               CHECK (status IN ('open','triaged','in_progress','resolved','wontfix','duplicate')),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_at  TIMESTAMPTZ
);

COMMENT ON TABLE bug_reports IS
  'In-app bug + feedback submissions. Service role reads all; reporters can read their own.';

CREATE INDEX IF NOT EXISTS idx_bug_reports_status_created
  ON bug_reports (status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_bug_reports_user
  ON bug_reports (user_id, created_at DESC);

-- RLS: anyone can submit (anon onboarders included). Reporters can read
-- their own. Triage / updates happen via service role in the dashboard.
ALTER TABLE bug_reports ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "bug_reports_anyone_insert" ON bug_reports;
CREATE POLICY "bug_reports_anyone_insert" ON bug_reports
  FOR INSERT TO anon, authenticated
  WITH CHECK (
    -- Authenticated submitters must be inserting their own user_id (or NULL).
    user_id IS NULL OR user_id = auth.uid()
  );

DROP POLICY IF EXISTS "bug_reports_own_select" ON bug_reports;
CREATE POLICY "bug_reports_own_select" ON bug_reports
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());
