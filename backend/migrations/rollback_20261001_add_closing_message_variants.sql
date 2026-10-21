-- Rollback: add_closing_message_variants
-- Date: 2026-10-01

SET search_path TO euonqol;

ALTER TABLE euonqol.survey_closing_messages
  DROP COLUMN IF EXISTS link_used_message,
  DROP COLUMN IF EXISTS survey_closed_message,
  DROP COLUMN IF EXISTS resume_message;
