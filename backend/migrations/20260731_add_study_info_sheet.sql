-- Migration: Add study_info_sheets feature
-- Date: 2026-07-31
-- Description: Per-survey, per-language "study info sheet" content shown to the
--              patient after the privacy policy step, with accept/decline. Mirrors
--              survey_presentations (single content blob per survey+language, with
--              is_fallback/is_current/version), plus a rejection_message column for
--              the decline exit screen. The two new columns on
--              survey_questionnaire_patients_assignment mirror
--              eligibility_status/eligibility_disqualification_msg, persisting only
--              the decline outcome (acceptance needs no persistence: a patient who
--              already started answering resumes via the existing can_resume path,
--              bypassing the whole pre-flow).

SET search_path TO euonqol;

CREATE TABLE IF NOT EXISTS euonqol.survey_study_info_sheets (
    id                SERIAL PRIMARY KEY,
    survey_id         INTEGER NOT NULL REFERENCES euonqol.surveys(id) ON DELETE CASCADE,
    language_id       INTEGER NOT NULL REFERENCES euonqol.eu_countries(id) ON UPDATE NO ACTION,
    title             VARCHAR(255),
    content           TEXT NOT NULL,
    rejection_message TEXT,
    version           INTEGER NOT NULL DEFAULT 1,
    is_current        BOOLEAN NOT NULL DEFAULT TRUE,
    is_fallback       BOOLEAN NOT NULL DEFAULT FALSE,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ssis_survey_lang_current
  ON euonqol.survey_study_info_sheets (survey_id, language_id, is_current);
CREATE INDEX IF NOT EXISTS idx_ssis_survey
  ON euonqol.survey_study_info_sheets (survey_id);

ALTER TABLE euonqol.survey_questionnaire_patients_assignment
  ADD COLUMN IF NOT EXISTS study_info_status VARCHAR(20) NULL,
  ADD COLUMN IF NOT EXISTS study_info_rejection_msg TEXT NULL;

COMMENT ON COLUMN euonqol.survey_study_info_sheets.rejection_message
  IS 'Plain-text exit message shown to the patient when they decline (rendered as plain text, not HTML)';
COMMENT ON COLUMN euonqol.survey_questionnaire_patients_assignment.study_info_status
  IS 'Set to ''declined'' when the patient declines the study info sheet; mirrors eligibility_status';
COMMENT ON COLUMN euonqol.survey_questionnaire_patients_assignment.study_info_rejection_msg
  IS 'Snapshot of the rejection message shown at decline time; mirrors eligibility_disqualification_msg';
