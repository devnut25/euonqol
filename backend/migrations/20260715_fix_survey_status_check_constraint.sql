-- Migration: Actually apply the surveys_status_check widening that
-- 20260526_update_survey_status_lifecycle.sql left commented out.
-- Idempotent: safe to run whether or not the constraint was manually fixed already.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'surveys_status_check'
  ) THEN
    ALTER TABLE euonqol.surveys DROP CONSTRAINT surveys_status_check;
  END IF;
END $$;

ALTER TABLE euonqol.surveys ADD CONSTRAINT surveys_status_check
  CHECK (status::text = ANY (ARRAY['draft', 'in_progress', 'completed', 'disabled', 'active']::text[]));
