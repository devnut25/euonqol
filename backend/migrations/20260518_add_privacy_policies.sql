-- ============================================================
-- Migration: 20260518_add_privacy_policies
-- Add privacy policy management tables
-- ============================================================

-- Privacy policies (admin-managed, per language + patient_type)
CREATE TABLE IF NOT EXISTS euonqol.privacy_policies (
  id           SERIAL       PRIMARY KEY,
  title        VARCHAR(255) NOT NULL,
  content      TEXT         NOT NULL,
  language_id  INT          NOT NULL REFERENCES euonqol.eu_countries(id),
  patient_type VARCHAR(20)  NOT NULL CHECK (patient_type IN ('unidentified', 'traceable', 'identified')),
  is_active    BOOLEAN      NOT NULL DEFAULT true,
  created_by   VARCHAR(36)  REFERENCES public.user_entity(id),
  created_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_privacy_policies_language ON euonqol.privacy_policies(language_id);
CREATE INDEX IF NOT EXISTS idx_privacy_policies_patient_type ON euonqol.privacy_policies(patient_type);
CREATE INDEX IF NOT EXISTS idx_privacy_policies_active ON euonqol.privacy_policies(is_active);

-- Survey ↔ privacy policy association (many-to-many)
CREATE TABLE IF NOT EXISTS euonqol.survey_privacy_policies (
  id                SERIAL      PRIMARY KEY,
  survey_id         INT         NOT NULL REFERENCES euonqol.surveys(id) ON DELETE CASCADE,
  privacy_policy_id INT         NOT NULL REFERENCES euonqol.privacy_policies(id) ON DELETE RESTRICT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(survey_id, privacy_policy_id)
);

CREATE INDEX IF NOT EXISTS idx_spp_survey ON euonqol.survey_privacy_policies(survey_id);
CREATE INDEX IF NOT EXISTS idx_spp_policy ON euonqol.survey_privacy_policies(privacy_policy_id);

-- Track patient acceptance of privacy policies (recorded at session start)
CREATE TABLE IF NOT EXISTS euonqol.privacy_policy_acceptances (
  id                SERIAL      PRIMARY KEY,
  privacy_policy_id INT         NOT NULL REFERENCES euonqol.privacy_policies(id),
  assignment_id     INT         NOT NULL REFERENCES euonqol.survey_questionnaire_patients_assignment(id) ON DELETE CASCADE,
  accepted_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ppa_policy ON euonqol.privacy_policy_acceptances(privacy_policy_id);
CREATE INDEX IF NOT EXISTS idx_ppa_assignment ON euonqol.privacy_policy_acceptances(assignment_id);
