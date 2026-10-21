-- Migration: Move max_completions from surveys to questionnaires
-- Date: 2026-06-17
--
-- Rationale: max_completions was at survey level but the limit should apply
-- per-questionnaire inside a survey, so each questionnaire can independently
-- reach its threshold without closing the whole survey.

SET search_path TO euonqol;

-- 1. Add max_completions column to questionnaires
ALTER TABLE questionnaires
  ADD COLUMN IF NOT EXISTS max_completions INT NULL;

-- 2. surveys.max_completions is kept nullable (already was) but is now deprecated.
--    We leave the column in place for backward-compatibility; application logic
--    will no longer read/write it.

SELECT 'Migration 20260617 OK' AS result;
