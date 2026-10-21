-- Migration: Move access_mode from patients to questionnaires
-- Date: 2026-05-25
--
-- Changes:
--   1. Add access_mode column to questionnaires (with default 'identified')
--   2. patients.group_id and patients.access_mode are already nullable — no structural change needed
--      Existing patient data is preserved; new patients will not require these fields.

BEGIN;

-- 1. Add access_mode to questionnaires
ALTER TABLE euonqol.questionnaires
  ADD COLUMN IF NOT EXISTS access_mode VARCHAR(20) NOT NULL DEFAULT 'identified'
  CHECK (access_mode IN ('identified', 'traceable', 'unidentified'));

COMMIT;
