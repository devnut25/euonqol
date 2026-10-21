-- Migration: move ctt_norms_version_id from surveys to questionnaires
-- 1. Make surveys.ctt_norms_version_id nullable (was NOT NULL)
-- 2. Add ctt_norms_version_id (nullable) to questionnaires

SET search_path TO euonqol;

-- Step 1: make the column nullable on surveys
ALTER TABLE surveys
  ALTER COLUMN ctt_norms_version_id DROP NOT NULL;

-- Step 2: add column to questionnaires
ALTER TABLE questionnaires
  ADD COLUMN IF NOT EXISTS ctt_norms_version_id INT NULL
    REFERENCES ctt_norms_versions(id)
    ON DELETE RESTRICT ON UPDATE NO ACTION;

CREATE INDEX IF NOT EXISTS idx_questionnaires_ctt_norms
  ON questionnaires(ctt_norms_version_id);
