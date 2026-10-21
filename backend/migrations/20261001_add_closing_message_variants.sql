-- Migration: Add per-language closing message variants (link already used, survey closed, resume)
-- Date: 2026-10-01

SET search_path TO euonqol;

ALTER TABLE euonqol.survey_closing_messages
  ADD COLUMN IF NOT EXISTS link_used_message     TEXT NULL,
  ADD COLUMN IF NOT EXISTS survey_closed_message TEXT NULL,
  ADD COLUMN IF NOT EXISTS resume_message        TEXT NULL;
