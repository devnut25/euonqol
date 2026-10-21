-- Migration: add 'feedback' to question_kind CHECK constraints
-- Affects:
--   euonqol.kit_version_files  (kit_version_files_question_kind_check)
--   euonqol.questions          (questions_question_kind_check)

BEGIN;

-- ── kit_version_files ──────────────────────────────────────────────────────
ALTER TABLE euonqol.kit_version_files
  DROP CONSTRAINT IF EXISTS kit_version_files_question_kind_check;

ALTER TABLE euonqol.kit_version_files
  ADD CONSTRAINT kit_version_files_question_kind_check
    CHECK (question_kind IN ('static', 'cat', 'socio-demo', 'feedback'));

-- ── questions ──────────────────────────────────────────────────────────────
ALTER TABLE euonqol.questions
  DROP CONSTRAINT IF EXISTS questions_question_kind_check;

ALTER TABLE euonqol.questions
  ADD CONSTRAINT questions_question_kind_check
    CHECK (question_kind IN ('static', 'cat', 'socio-demo', 'feedback'));

COMMIT;
