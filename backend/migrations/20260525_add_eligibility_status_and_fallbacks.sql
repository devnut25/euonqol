-- Migration: 20260525_add_eligibility_status_and_fallbacks
-- Adds eligibility disqualification tracking on assignments and
-- is_fallback flags for presentations and eligibility translations.

-- 1. Track whether a patient was disqualified by eligibility pre-screening.
--    Only stored for non-unidentified (private) assignments.
ALTER TABLE euonqol.survey_questionnaire_patients_assignment
  ADD COLUMN IF NOT EXISTS eligibility_status VARCHAR(20) NULL,
  ADD COLUMN IF NOT EXISTS eligibility_disqualification_msg TEXT NULL;

-- 2. Mark a presentation version as the fallback to show when the
--    patient's chosen language has no dedicated translation.
ALTER TABLE euonqol.survey_presentations
  ADD COLUMN IF NOT EXISTS is_fallback BOOLEAN NOT NULL DEFAULT FALSE;

-- 3. Mark a per-question eligibility translation as the fallback to show
--    when the patient's chosen language has no dedicated translation.
ALTER TABLE euonqol.survey_eligibility_question_translations
  ADD COLUMN IF NOT EXISTS is_fallback BOOLEAN NOT NULL DEFAULT FALSE;
