-- Move access_mode from questionnaires to surveys
-- Questionnaires inherit the mode from their parent survey

ALTER TABLE euonqol.surveys
  ADD COLUMN IF NOT EXISTS access_mode VARCHAR(20) NOT NULL DEFAULT 'identified'
  CHECK (access_mode IN ('identified', 'traceable', 'unidentified'));

ALTER TABLE euonqol.questionnaires
  DROP COLUMN IF EXISTS access_mode;
