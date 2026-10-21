-- Rollback: study_info_sheet_consent_questions_list
-- Date: 2026-09-30
-- Restores the two fixed consent columns and fills them from the first two
-- questions (by order_position) of each sheet. Questions beyond the second are
-- lost, since the old schema had room for two only.

SET search_path TO euonqol;

ALTER TABLE euonqol.survey_study_info_sheets
  ADD COLUMN IF NOT EXISTS consent_data_question_text TEXT,
  ADD COLUMN IF NOT EXISTS consent_participate_question_text TEXT;

WITH ranked AS (
  SELECT study_info_sheet_id,
         question_text,
         ROW_NUMBER() OVER (PARTITION BY study_info_sheet_id ORDER BY order_position, id) AS rn
    FROM euonqol.survey_study_info_sheet_consent_questions
)
UPDATE euonqol.survey_study_info_sheets s
   SET consent_data_question_text        = (SELECT r.question_text FROM ranked r WHERE r.study_info_sheet_id = s.id AND r.rn = 1),
       consent_participate_question_text = (SELECT r.question_text FROM ranked r WHERE r.study_info_sheet_id = s.id AND r.rn = 2)
 WHERE EXISTS (SELECT 1 FROM ranked r WHERE r.study_info_sheet_id = s.id);

COMMENT ON COLUMN euonqol.survey_study_info_sheets.consent_data_question_text IS 'Informed-consent question text: consent to data processing, shown on the public study-info screen. Nullable for pre-existing rows; falls back to a static label when NULL.';
COMMENT ON COLUMN euonqol.survey_study_info_sheets.consent_participate_question_text IS 'Informed-consent question text: consent to participate in the study, shown on the public study-info screen. Nullable for pre-existing rows; falls back to a static label when NULL.';

DROP TABLE IF EXISTS euonqol.survey_study_info_sheet_consent_questions;
