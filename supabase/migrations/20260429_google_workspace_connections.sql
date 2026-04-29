-- ─────────────────────────────────────────────────────────────────────────────
-- Google Workspace OAuth tokens — per-creator storage for MCP access.
--
-- The Worker initiates OAuth (GET /google/auth → Google → /google/callback),
-- exchanges the code for tokens, and upserts a row here. On each chat turn
-- that needs Gmail/Calendar, the Worker reads the access_token (refreshing
-- if expired) and forwards it as a Bearer to the google_workspace_mcp
-- server. RLS keeps each creator's tokens isolated.
--
-- Replaces the Arcade Gmail integration. Run in Supabase SQL editor.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS google_workspace_connections (
  user_id        UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email          TEXT,                          -- the connected Google account email
  access_token   TEXT NOT NULL,
  refresh_token  TEXT,                          -- nullable: rare cases (returning user, no refresh granted)
  scopes         TEXT,                          -- space-delimited granted scopes from the token response
  expires_at     TIMESTAMPTZ NOT NULL,          -- when the access_token expires; refreshed proactively
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE google_workspace_connections IS
  'OAuth tokens for the creator''s connected Google account. Read+refresh by the Worker for MCP calls.';

CREATE INDEX IF NOT EXISTS idx_google_workspace_connections_email
  ON google_workspace_connections (email);

-- Auto-bump updated_at
CREATE OR REPLACE FUNCTION google_workspace_connections_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_google_workspace_connections_updated_at ON google_workspace_connections;
CREATE TRIGGER trg_google_workspace_connections_updated_at
  BEFORE UPDATE ON google_workspace_connections
  FOR EACH ROW EXECUTE FUNCTION google_workspace_connections_set_updated_at();

-- RLS: creators see/manage only their own row. The Worker uses the user's
-- session JWT (passed via creatorContext.accessToken on each chat request)
-- so auth.uid() resolves correctly.
ALTER TABLE google_workspace_connections ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "google_ws_own_select" ON google_workspace_connections;
CREATE POLICY "google_ws_own_select" ON google_workspace_connections
  FOR SELECT USING (user_id = auth.uid());

DROP POLICY IF EXISTS "google_ws_own_insert" ON google_workspace_connections;
CREATE POLICY "google_ws_own_insert" ON google_workspace_connections
  FOR INSERT WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "google_ws_own_update" ON google_workspace_connections;
CREATE POLICY "google_ws_own_update" ON google_workspace_connections
  FOR UPDATE USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "google_ws_own_delete" ON google_workspace_connections;
CREATE POLICY "google_ws_own_delete" ON google_workspace_connections
  FOR DELETE USING (user_id = auth.uid());
