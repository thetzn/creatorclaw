-- ─────────────────────────────────────────────────────────────────────────────
-- Telegram bot: link Telegram users to existing CreatorClaw accounts so the
-- agent (persona, deals, conversations, Google Workspace tokens) is shared
-- across web and Telegram.
--
-- Run in the Supabase SQL editor. Idempotent.
-- ─────────────────────────────────────────────────────────────────────────────

-- ─── user_telegram_links ────────────────────────────────────────────────────
-- One row per linked Telegram identity. Telegram_id is the PK so a Telegram
-- user can only link to one CreatorClaw account at a time. Unlink is a row
-- delete.
CREATE TABLE IF NOT EXISTS user_telegram_links (
  telegram_id          BIGINT PRIMARY KEY,
  user_id              UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  telegram_username    TEXT,
  telegram_first_name  TEXT,
  linked_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_active_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_user_telegram_links_user
  ON user_telegram_links(user_id);

COMMENT ON TABLE user_telegram_links IS
  'Maps a Telegram user_id to a CreatorClaw auth user. One Telegram → one CC.';

-- ─── telegram_link_codes ────────────────────────────────────────────────────
-- Short-lived codes generated when a Telegram user runs /start. The bot
-- sends a link to creatorclaw.co/?telegram_link=<code>; the web app POSTs
-- the code back to the Worker's /telegram/link endpoint with the signed-in
-- user's JWT, which writes user_telegram_links.
CREATE TABLE IF NOT EXISTS telegram_link_codes (
  code                 TEXT PRIMARY KEY,
  telegram_id          BIGINT NOT NULL,
  telegram_username    TEXT,
  telegram_first_name  TEXT,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at           TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '15 minutes'),
  consumed_at          TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_telegram_link_codes_telegram
  ON telegram_link_codes(telegram_id);

COMMENT ON TABLE telegram_link_codes IS
  'Short-lived (~15 min) codes for the Telegram → web account-linking handshake.';

-- ─── telegram_pending_actions ───────────────────────────────────────────────
-- Ephemeral storage for Phase 2 inline keyboards — Telegram callback_data
-- caps at 64 bytes, so richer payloads (drafted email subject/body, brand
-- match indices, etc.) live here, referenced by id in the button.
CREATE TABLE IF NOT EXISTS telegram_pending_actions (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  kind         TEXT NOT NULL,          -- 'pitch_send' | 'pitch_draft' | 'idea_schedule' | etc
  payload      JSONB NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at   TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '1 hour')
);

CREATE INDEX IF NOT EXISTS idx_telegram_pending_actions_user
  ON telegram_pending_actions(user_id, created_at DESC);

-- ─── conversations.telegram_chat_id ─────────────────────────────────────────
-- One Telegram chat = one persisted conversation, mirroring the web's
-- sidebar entry per chat. Lets the agent retain context across messages.
ALTER TABLE conversations
  ADD COLUMN IF NOT EXISTS telegram_chat_id BIGINT;

CREATE INDEX IF NOT EXISTS idx_conversations_telegram_chat
  ON conversations(telegram_chat_id) WHERE telegram_chat_id IS NOT NULL;

-- ─── RLS ────────────────────────────────────────────────────────────────────
-- Worker mints user-scoped JWTs (HS256, sub=user_id) for every Telegram
-- turn, so RLS uses auth.uid() exactly as on the web.
ALTER TABLE user_telegram_links ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "user_telegram_links_own_select" ON user_telegram_links;
CREATE POLICY "user_telegram_links_own_select" ON user_telegram_links
  FOR SELECT USING (user_id = auth.uid());

DROP POLICY IF EXISTS "user_telegram_links_own_insert" ON user_telegram_links;
CREATE POLICY "user_telegram_links_own_insert" ON user_telegram_links
  FOR INSERT WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "user_telegram_links_own_update" ON user_telegram_links;
CREATE POLICY "user_telegram_links_own_update" ON user_telegram_links
  FOR UPDATE USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "user_telegram_links_own_delete" ON user_telegram_links;
CREATE POLICY "user_telegram_links_own_delete" ON user_telegram_links
  FOR DELETE USING (user_id = auth.uid());

-- telegram_link_codes is server-only — Worker reads/writes via service role
-- (the codes carry telegram_id before any user account is linked, so RLS
-- by auth.uid() doesn't apply).
ALTER TABLE telegram_link_codes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "telegram_link_codes_no_user" ON telegram_link_codes;
CREATE POLICY "telegram_link_codes_no_user" ON telegram_link_codes
  FOR ALL USING (FALSE) WITH CHECK (FALSE);

-- telegram_pending_actions: own rows only.
ALTER TABLE telegram_pending_actions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "telegram_pending_actions_own" ON telegram_pending_actions;
CREATE POLICY "telegram_pending_actions_own" ON telegram_pending_actions
  FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
