-- Migration: add_pdf_filename_to_content_tables
-- Date: 2026-08-07
-- Description: Store the original uploaded filename alongside pdf_url for
--              privacy policies, presentations and study info sheets. The
--              file on disk keeps its random-hex name (see FileStorage.savePdf);
--              this column only preserves the name the uploader chose, so it
--              can be shown back to them instead of the random storage name.

SET search_path TO euonqol;

ALTER TABLE euonqol.privacy_policies
  ADD COLUMN IF NOT EXISTS pdf_filename VARCHAR(255);

ALTER TABLE euonqol.survey_presentations
  ADD COLUMN IF NOT EXISTS pdf_filename VARCHAR(255);

ALTER TABLE euonqol.survey_study_info_sheets
  ADD COLUMN IF NOT EXISTS pdf_filename VARCHAR(255);

COMMENT ON COLUMN euonqol.privacy_policies.pdf_filename IS 'Original filename of the uploaded PDF, as chosen by the uploader (display only — storage uses a random hex filename, see pdf_url)';
COMMENT ON COLUMN euonqol.survey_presentations.pdf_filename IS 'Original filename of the uploaded PDF, as chosen by the uploader (display only — storage uses a random hex filename, see pdf_url)';
COMMENT ON COLUMN euonqol.survey_study_info_sheets.pdf_filename IS 'Original filename of the uploaded PDF, as chosen by the uploader (display only — storage uses a random hex filename, see pdf_url)';
