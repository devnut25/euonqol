-- Migration: add_consent_questions_to_study_info_sheet
-- Date: 2026-09-14
-- Description: Add the two informed-consent question texts (data processing
--              consent, participation consent) as per-survey/per-language
--              content on the study info sheet, replacing the previously
--              hardcoded static labels shown on the public study-info screen.
--              Nullable at DB level (existing rows keep NULL); the app layer
--              enforces them as required on create/update, and the public
--              frontend falls back to the static label when NULL.

SET search_path TO euonqol;

ALTER TABLE euonqol.survey_study_info_sheets
  ADD COLUMN IF NOT EXISTS consent_data_question_text TEXT,
  ADD COLUMN IF NOT EXISTS consent_participate_question_text TEXT;

COMMENT ON COLUMN euonqol.survey_study_info_sheets.consent_data_question_text IS 'Informed-consent question text: consent to data processing, shown on the public study-info screen. Nullable for pre-existing rows; falls back to a static label when NULL.';
COMMENT ON COLUMN euonqol.survey_study_info_sheets.consent_participate_question_text IS 'Informed-consent question text: consent to participate in the study, shown on the public study-info screen. Nullable for pre-existing rows; falls back to a static label when NULL.';
