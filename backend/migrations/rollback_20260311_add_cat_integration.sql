-- Rollback Migration: add_cat_integration
-- Date: 2026-03-11
-- Description: Rollback CAT integration changes

-- ================================================
-- 1. Remove scores field from assignments
-- ================================================

DROP INDEX IF EXISTS euonqol.idx_assignment_scores;

ALTER TABLE euonqol.survey_questionnaire_patients_assignment 
DROP COLUMN IF EXISTS scores;

-- ================================================
-- 2. Drop cat_module_sessions table
-- ================================================

DROP INDEX IF EXISTS euonqol.idx_cat_session_completed;
DROP INDEX IF EXISTS euonqol.idx_cat_session_module;
DROP INDEX IF EXISTS euonqol.idx_cat_session_assignment;

DROP TABLE IF EXISTS euonqol.cat_module_sessions CASCADE;

-- ================================================
-- 3. Remove new fields from cat_settings
-- ================================================

DROP INDEX IF EXISTS euonqol.idx_cat_settings_setting_key;

ALTER TABLE euonqol.cat_settings 
DROP COLUMN IF EXISTS setting_key,
DROP COLUMN IF EXISTS api_configuration;

-- ================================================
-- Rollback complete
-- ================================================

DO $$
BEGIN
  RAISE NOTICE 'Rollback completed successfully!';
  RAISE NOTICE 'All CAT integration changes have been reverted.';
END $$;
