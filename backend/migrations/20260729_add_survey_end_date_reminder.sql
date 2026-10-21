-- Migration: Add creator "survey ending soon" reminder tracking
-- Date: 2026-07-29

ALTER TABLE euonqol.surveys
  ADD COLUMN IF NOT EXISTS end_date_reminder_sent_at TIMESTAMPTZ NULL;

COMMENT ON COLUMN euonqol.surveys.end_date_reminder_sent_at IS 'Set when the "3 days to end_date" creator reminder email has been sent (idempotency guard, never re-sent)';
