-- Migration: add_min_max_to_numeric_answers
-- Date: 2026-09-30
-- Description: Add optional min/max bounds to the numeric free-input answers of
--              socio-demo (answer_type 'Integer') and feedback (answer_type
--              'Number') questions.
--
--              Filled from the new optional "Min" / "Max" columns of the kit
--              upload's "Answers" sheet. The public questionnaire player limits
--              the numeric input to [min_value, max_value] and the public
--              responses endpoint rejects values outside it.
--
--              Nullable: NULL = no bound on that side (existing rows and every
--              non-numeric answer type stay NULL). DOUBLE PRECISION so feedback
--              'Number' answers can carry decimal bounds too.

SET search_path TO euonqol;

ALTER TABLE euonqol.socio_demo_answers
  ADD COLUMN IF NOT EXISTS min_value DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS max_value DOUBLE PRECISION;

ALTER TABLE euonqol.socio_demo_answers
  DROP CONSTRAINT IF EXISTS socio_demo_answers_min_max_check;
ALTER TABLE euonqol.socio_demo_answers
  ADD CONSTRAINT socio_demo_answers_min_max_check
  CHECK (min_value IS NULL OR max_value IS NULL OR min_value <= max_value);

COMMENT ON COLUMN euonqol.socio_demo_answers.min_value IS 'Minimum value accepted by an Integer free-input answer (Answers sheet "Min" column). NULL = no lower bound beyond the default 0.';
COMMENT ON COLUMN euonqol.socio_demo_answers.max_value IS 'Maximum value accepted by an Integer free-input answer (Answers sheet "Max" column). NULL = no upper bound.';

ALTER TABLE euonqol.feedback_answers
  ADD COLUMN IF NOT EXISTS min_value DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS max_value DOUBLE PRECISION;

ALTER TABLE euonqol.feedback_answers
  DROP CONSTRAINT IF EXISTS feedback_answers_min_max_check;
ALTER TABLE euonqol.feedback_answers
  ADD CONSTRAINT feedback_answers_min_max_check
  CHECK (min_value IS NULL OR max_value IS NULL OR min_value <= max_value);

COMMENT ON COLUMN euonqol.feedback_answers.min_value IS 'Minimum value accepted by a Number free-input answer (Answers sheet "Min" column). NULL = no lower bound beyond the default 0.';
COMMENT ON COLUMN euonqol.feedback_answers.max_value IS 'Maximum value accepted by a Number free-input answer (Answers sheet "Max" column). NULL = no upper bound.';
