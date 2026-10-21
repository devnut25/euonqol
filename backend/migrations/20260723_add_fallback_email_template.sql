-- Migration: Add is_fallback column to surveys_questionnaires_email_templates
-- Date: 2026-07-23
-- Description: Allows each survey+questionnaire pair to designate one email
--              template as fallback, used when no exact language match exists
--              for an assignment.

ALTER TABLE euonqol.surveys_questionnaires_email_templates
  ADD COLUMN IF NOT EXISTS is_fallback BOOLEAN NOT NULL DEFAULT FALSE;

-- Ensure at most one fallback per survey+questionnaire (partial unique index)
CREATE UNIQUE INDEX IF NOT EXISTS idx_sqet_sq_fallback
  ON euonqol.surveys_questionnaires_email_templates (survey_questionnaire_id)
  WHERE is_fallback = TRUE;

COMMENT ON COLUMN euonqol.surveys_questionnaires_email_templates.is_fallback
  IS 'When true, this template is used as fallback when no exact language match exists for the assignment';
