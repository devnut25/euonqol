-- Migration: cascade-delete patient_group_questions when their question is deleted
--
-- questions.cat_item_bank has ON DELETE CASCADE, so deleting a CAT item bank cascades
-- into deleting its questions. Every other table hanging off `questions` (static_questions,
-- cat_questions, socio_demo_questions, socio_demo_answers) already cascades on question
-- delete, but patient_group_questions was left with the default NO ACTION. As soon as a
-- bank's questions had any patient-group mapping (created during import/seeding), deleting
-- the bank failed with:
--   Foreign key constraint violated on the constraint: `patient_group_questions_question_id_fkey`
--
-- Fix: align patient_group_questions with its sibling tables by cascading on question delete.

BEGIN;

ALTER TABLE euonqol.patient_group_questions
  DROP CONSTRAINT patient_group_questions_question_id_fkey;

ALTER TABLE euonqol.patient_group_questions
  ADD CONSTRAINT patient_group_questions_question_id_fkey
    FOREIGN KEY (question_id) REFERENCES euonqol.questions(id)
    ON DELETE CASCADE ON UPDATE NO ACTION;

COMMIT;
