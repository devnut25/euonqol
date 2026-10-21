-- Migration: Add is_fallback column to survey_privacy_policies
-- Date: 2026-05-19
-- Description: Allows each survey to designate one privacy policy as fallback,
--              shown to patients when no exact (patient_type + language) match exists.

ALTER TABLE euonqol.survey_privacy_policies
  ADD COLUMN IF NOT EXISTS is_fallback BOOLEAN NOT NULL DEFAULT FALSE;

-- Ensure at most one fallback per survey (partial unique index)
CREATE UNIQUE INDEX IF NOT EXISTS idx_spp_survey_fallback
  ON euonqol.survey_privacy_policies (survey_id)
  WHERE is_fallback = TRUE;

COMMENT ON COLUMN euonqol.survey_privacy_policies.is_fallback
  IS 'When true, this policy is shown as fallback when no exact language+patient_type match exists for a patient';
