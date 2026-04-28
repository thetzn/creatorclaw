-- ─────────────────────────────────────────────────────────────────────────────
-- Add 'awaiting_payment' stage to creator_deals.
--
-- Sits between 'producing' and 'closed': creator has delivered the content
-- but the brand hasn't paid yet. Counts as pipeline value, not earned, until
-- it moves to 'closed'.
--
-- Run in the Supabase SQL editor. Idempotent.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE creator_deals
  DROP CONSTRAINT IF EXISTS creator_deals_status_check;

ALTER TABLE creator_deals
  ADD CONSTRAINT creator_deals_status_check
  CHECK (status IN (
    'inbound',
    'outreach',
    'in_progress',
    'negotiating',
    'producing',
    'awaiting_payment',
    'closed'
  ));
