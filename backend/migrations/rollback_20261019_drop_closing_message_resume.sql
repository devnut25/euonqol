-- Rollback: 20261019_drop_closing_message_resume.sql
-- Recreates the column only: the texts deleted by the migration are not restored.

SET search_path TO euonqol;

ALTER TABLE euonqol.survey_closing_messages
  ADD COLUMN IF NOT EXISTS resume_message TEXT NULL;
