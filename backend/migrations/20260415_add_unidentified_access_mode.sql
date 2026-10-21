-- Migration: add_unidentified_access_mode
-- Date: 2026-04-15
-- Description: Add 'unidentified' as a valid access_mode for anonymous public-link patients

-- Drop existing check constraint on patients.access_mode and recreate with 'unidentified'
-- access_mode may have already been moved off patients by later migrations
-- (20260525_move_access_mode_to_questionnaire.sql -> 20260525_move_access_mode_to_survey.sql),
-- so skip if the column no longer exists on this table.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'euonqol'
      AND table_name = 'patients'
      AND column_name = 'access_mode'
  ) THEN
    ALTER TABLE euonqol.patients
      DROP CONSTRAINT IF EXISTS patients_access_mode_check;

    ALTER TABLE euonqol.patients
      ADD CONSTRAINT patients_access_mode_check
      CHECK (access_mode IN ('identified', 'traceable', 'unidentified'));
  ELSE
    RAISE NOTICE 'Skipping patients_access_mode_check: euonqol.patients.access_mode does not exist (column moved by later migrations)';
  END IF;
END $$;
