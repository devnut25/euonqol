-- =============================================================================
-- Migration: link patients to survey_questionnaire
-- Date: 2026-06-15
-- Description:
--   - Truncates patients and related data (dev environment)
--   - Removes the old global UNIQUE(patient_id) constraint
--   - Adds survey_questionnaire_id NOT NULL FK to patients
--   - Adds composite UNIQUE(patient_id, survey_questionnaire_id)
--   - Adds composite UNIQUE(mail, survey_questionnaire_id) for non-null mails
-- =============================================================================

-- Whole migration is skipped if patients.survey_questionnaire_id already
-- exists: step 1 TRUNCATEs real patient data, which must run at most once —
-- guarding only the later ADD COLUMN/CONSTRAINT would leave the TRUNCATE
-- unconditional and wipe live data on any re-run.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'euonqol' AND table_name = 'patients' AND column_name = 'survey_questionnaire_id'
  ) THEN
    RAISE NOTICE 'Skipping 20260615_link_patients_to_questionnaire: euonqol.patients.survey_questionnaire_id already exists';
    RETURN;
  END IF;

  -- 1. Clean up all patient-related data
  EXECUTE $ddl$ TRUNCATE TABLE euonqol.survey_questionnaire_patients_assignment CASCADE $ddl$;
  EXECUTE $ddl$ TRUNCATE TABLE euonqol.patient_sessions CASCADE $ddl$;
  EXECUTE $ddl$ TRUNCATE TABLE euonqol.patients CASCADE $ddl$;

  -- 2. Drop the old global unique constraint on patient_id
  EXECUTE $ddl$ ALTER TABLE euonqol.patients DROP CONSTRAINT IF EXISTS patients_patient_id_key $ddl$;

  -- Also drop any index that may enforce it
  EXECUTE $ddl$ DROP INDEX IF EXISTS euonqol.patients_patient_id_key $ddl$;

  -- 3. Add survey_questionnaire_id column (NOT NULL, FK to surveys_questionnaires)
  EXECUTE $ddl$
    ALTER TABLE euonqol.patients
      ADD COLUMN survey_questionnaire_id INT NOT NULL
        REFERENCES euonqol.surveys_questionnaires(id)
        ON DELETE CASCADE
  $ddl$;

  -- 4. Add composite unique: same patient_id can exist in different questionnaires
  EXECUTE $ddl$
    ALTER TABLE euonqol.patients
      ADD CONSTRAINT patients_patient_id_sqid_unique
        UNIQUE (patient_id, survey_questionnaire_id)
  $ddl$;

  -- 5. Add partial unique index: same email cannot appear twice in the same questionnaire
  --    (only when mail is not null)
  EXECUTE $ddl$
    CREATE UNIQUE INDEX patients_mail_sqid_unique
      ON euonqol.patients (mail, survey_questionnaire_id)
      WHERE mail IS NOT NULL
  $ddl$;
END $$;
