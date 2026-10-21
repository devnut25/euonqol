-- Migration: Rename access_mode values to new nomenclature
-- identified    → traced
-- traceable     → anonymous_on_invitation
-- unidentified  → anonymous_spontaneous
--
-- Affected tables:
--   euonqol.surveys
--   euonqol.survey_questionnaire_patients_assignment

BEGIN;

-- 1. surveys table
UPDATE euonqol.surveys
SET access_mode = 'traced'
WHERE access_mode = 'identified';

UPDATE euonqol.surveys
SET access_mode = 'anonymous_on_invitation'
WHERE access_mode = 'traceable';

UPDATE euonqol.surveys
SET access_mode = 'anonymous_spontaneous'
WHERE access_mode = 'unidentified';

-- 2. survey_questionnaire_patients_assignment table
UPDATE euonqol.survey_questionnaire_patients_assignment
SET access_mode = 'traced'
WHERE access_mode = 'identified';

UPDATE euonqol.survey_questionnaire_patients_assignment
SET access_mode = 'anonymous_on_invitation'
WHERE access_mode = 'traceable';

UPDATE euonqol.survey_questionnaire_patients_assignment
SET access_mode = 'anonymous_spontaneous'
WHERE access_mode = 'unidentified';

COMMIT;
