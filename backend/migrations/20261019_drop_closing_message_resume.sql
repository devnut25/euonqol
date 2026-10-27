-- Migration: Drop survey_closing_messages.resume_message (EK-549)
-- Date: 2026-10-19
--
-- The resume-screen text is now the responsesAlreadySaved key of ui_translations
-- (Settings › Languages, see 20261019_add_ui_translation_resume.sql), with the count
-- of saved responses computed by the page. The per-survey HTML text is no longer used.
-- WARNING: existing resume_message texts are permanently deleted.

SET search_path TO euonqol;

BEGIN;

ALTER TABLE euonqol.survey_closing_messages
  DROP COLUMN IF EXISTS resume_message;

COMMIT;
