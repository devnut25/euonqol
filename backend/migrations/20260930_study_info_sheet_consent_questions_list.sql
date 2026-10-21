-- Migration: study_info_sheet_consent_questions_list
-- Date: 2026-09-30
-- Description: Replace the two fixed informed-consent question columns of the
--              study info sheet (consent_data_question_text,
--              consent_participate_question_text, added by
--              20260914_add_consent_questions_to_study_info_sheet) with a
--              dynamic list of consent questions per sheet version.
--
--              Each sheet row (one per survey/language/version) owns its own
--              ordered list; a new sheet version gets a new list, so older
--              versions keep the questions they were shown with.
--
--              Existing data is preserved: for EVERY sheet row (current and
--              historical versions) the two old texts, when present, are copied
--              into the new table as order_position 0 (data consent) and 1
--              (participation consent). Rows where both were NULL get no
--              questions and the public frontend keeps falling back to its
--              static labels, as it did before. The old columns are dropped
--              afterwards.
--
--              Idempotent: the data copy and the DROP run only while the old
--              columns still exist.

SET search_path TO euonqol;

CREATE TABLE IF NOT EXISTS euonqol.survey_study_info_sheet_consent_questions (
    id                  SERIAL PRIMARY KEY,
    study_info_sheet_id INTEGER NOT NULL REFERENCES euonqol.survey_study_info_sheets(id) ON DELETE CASCADE,
    question_text       TEXT NOT NULL,
    order_position      INTEGER NOT NULL DEFAULT 0,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ssiscq_sheet_order
    ON euonqol.survey_study_info_sheet_consent_questions (study_info_sheet_id, order_position);

COMMENT ON TABLE euonqol.survey_study_info_sheet_consent_questions IS 'Informed-consent questions shown on the public study-info screen, one ordered list per study info sheet version. The patient must answer "I consent" to every question to proceed.';
COMMENT ON COLUMN euonqol.survey_study_info_sheet_consent_questions.question_text IS 'Consent question text, in the language of the parent study info sheet.';
COMMENT ON COLUMN euonqol.survey_study_info_sheet_consent_questions.order_position IS 'Display order within the sheet (0-based).';

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'euonqol'
       AND table_name = 'survey_study_info_sheets'
       AND column_name = 'consent_data_question_text'
  ) THEN
    INSERT INTO euonqol.survey_study_info_sheet_consent_questions
      (study_info_sheet_id, question_text, order_position)
    SELECT s.id, TRIM(s.consent_data_question_text), 0
      FROM euonqol.survey_study_info_sheets s
     WHERE NULLIF(TRIM(s.consent_data_question_text), '') IS NOT NULL
       AND NOT EXISTS (
         SELECT 1 FROM euonqol.survey_study_info_sheet_consent_questions q
          WHERE q.study_info_sheet_id = s.id
       );
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'euonqol'
       AND table_name = 'survey_study_info_sheets'
       AND column_name = 'consent_participate_question_text'
  ) THEN
    INSERT INTO euonqol.survey_study_info_sheet_consent_questions
      (study_info_sheet_id, question_text, order_position)
    SELECT s.id, TRIM(s.consent_participate_question_text), 1
      FROM euonqol.survey_study_info_sheets s
     WHERE NULLIF(TRIM(s.consent_participate_question_text), '') IS NOT NULL
       AND NOT EXISTS (
         SELECT 1 FROM euonqol.survey_study_info_sheet_consent_questions q
          WHERE q.study_info_sheet_id = s.id
            AND q.order_position = 1
       );
  END IF;
END $$;

ALTER TABLE euonqol.survey_study_info_sheets
  DROP COLUMN IF EXISTS consent_data_question_text,
  DROP COLUMN IF EXISTS consent_participate_question_text;
