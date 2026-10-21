-- Migration: add_pdf_url_to_content_tables
-- Date: 2026-08-07
-- Description: Add optional PDF attachment path (served statically via
--              /euonqol-api/uploads/...) to privacy policies, presentations and
--              study info sheets. The column stores the public-facing route path,
--              not a filesystem path — the file itself lives on disk under
--              backend/data/uploads/ and is never stored as base64 in the DB.

SET search_path TO euonqol;

ALTER TABLE euonqol.privacy_policies
  ADD COLUMN IF NOT EXISTS pdf_url VARCHAR(255);

ALTER TABLE euonqol.survey_presentations
  ADD COLUMN IF NOT EXISTS pdf_url VARCHAR(255);

ALTER TABLE euonqol.survey_study_info_sheets
  ADD COLUMN IF NOT EXISTS pdf_url VARCHAR(255);

COMMENT ON COLUMN euonqol.privacy_policies.pdf_url IS 'Public path to an optional attached PDF (served via express.static), e.g. /euonqol-api/uploads/privacy-policies/<hex>.pdf';
COMMENT ON COLUMN euonqol.survey_presentations.pdf_url IS 'Public path to an optional attached PDF (served via express.static), e.g. /euonqol-api/uploads/presentations/<hex>.pdf';
COMMENT ON COLUMN euonqol.survey_study_info_sheets.pdf_url IS 'Public path to an optional attached PDF (served via express.static), e.g. /euonqol-api/uploads/study-info-sheets/<hex>.pdf';
