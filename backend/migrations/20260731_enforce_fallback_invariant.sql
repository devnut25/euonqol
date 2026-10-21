-- Migration: Enforce "exactly one fallback, always" for Presentation and Study
-- Info Sheet, mirroring the partial unique index already in place for Privacy
-- Policy (20260519_add_fallback_privacy_policy.sql) and Email Templates
-- (20260723_add_fallback_email_template.sql). "At least one" is enforced at the
-- application layer (backend/src/services/*); this index only guarantees "at
-- most one" per survey, as a defense-in-depth backstop against races.
--
-- Also backfills existing surveys that currently have zero fallback rows for
-- Presentation, Study Info Sheet, and Privacy Policy (picks the lowest-id
-- current row per survey) — a direct consequence of the app never having
-- forced this before. Eligibility Criteria is intentionally NOT backfilled
-- here: its fallback is a per-language flag applied uniformly across every
-- question, which isn't safely resolvable with a generic SQL backfill; it
-- self-heals the next time an admin marks any language as fallback for that
-- survey (the app now always allows setting a new fallback, only blocks
-- unsetting one without a replacement).

SET search_path TO euonqol;

-- ── Backfill: pick a fallback for surveys that currently have none ──────────

UPDATE survey_presentations sp
SET is_fallback = TRUE
WHERE sp.is_current = TRUE
  AND sp.id = (
    SELECT MIN(sp2.id) FROM survey_presentations sp2
    WHERE sp2.survey_id = sp.survey_id AND sp2.is_current = TRUE
  )
  AND NOT EXISTS (
    SELECT 1 FROM survey_presentations sp3
    WHERE sp3.survey_id = sp.survey_id AND sp3.is_current = TRUE AND sp3.is_fallback = TRUE
  );

UPDATE survey_study_info_sheets ssis
SET is_fallback = TRUE
WHERE ssis.is_current = TRUE
  AND ssis.id = (
    SELECT MIN(ssis2.id) FROM survey_study_info_sheets ssis2
    WHERE ssis2.survey_id = ssis.survey_id AND ssis2.is_current = TRUE
  )
  AND NOT EXISTS (
    SELECT 1 FROM survey_study_info_sheets ssis3
    WHERE ssis3.survey_id = ssis.survey_id AND ssis3.is_current = TRUE AND ssis3.is_fallback = TRUE
  );

UPDATE survey_privacy_policies spp
SET is_fallback = TRUE
WHERE spp.id = (
    SELECT MIN(spp2.id) FROM survey_privacy_policies spp2
    WHERE spp2.survey_id = spp.survey_id
  )
  AND NOT EXISTS (
    SELECT 1 FROM survey_privacy_policies spp3
    WHERE spp3.survey_id = spp.survey_id AND spp3.is_fallback = TRUE
  );

-- ── At-most-one partial unique indexes ───────────────────────────────────────

CREATE UNIQUE INDEX IF NOT EXISTS idx_sp_survey_fallback
  ON survey_presentations (survey_id)
  WHERE is_fallback = TRUE;

CREATE UNIQUE INDEX IF NOT EXISTS idx_ssis_survey_fallback
  ON survey_study_info_sheets (survey_id)
  WHERE is_fallback = TRUE;
