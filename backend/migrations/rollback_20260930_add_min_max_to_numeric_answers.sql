-- Rollback: add_min_max_to_numeric_answers
-- Date: 2026-09-30

SET search_path TO euonqol;

ALTER TABLE euonqol.socio_demo_answers
  DROP CONSTRAINT IF EXISTS socio_demo_answers_min_max_check,
  DROP COLUMN IF EXISTS min_value,
  DROP COLUMN IF EXISTS max_value;

ALTER TABLE euonqol.feedback_answers
  DROP CONSTRAINT IF EXISTS feedback_answers_min_max_check,
  DROP COLUMN IF EXISTS min_value,
  DROP COLUMN IF EXISTS max_value;
