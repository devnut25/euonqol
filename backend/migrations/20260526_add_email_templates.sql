-- Migration: Add email templates for survey+questionnaire pairs
-- Date: 2026-05-26

CREATE TABLE IF NOT EXISTS euonqol.surveys_questionnaires_email_templates (
    id                      SERIAL PRIMARY KEY,
    survey_questionnaire_id INTEGER NOT NULL
        REFERENCES euonqol.surveys_questionnaires(id) ON DELETE CASCADE,
    language_id             INTEGER NOT NULL
        REFERENCES euonqol.eu_countries(id),
    subject                 VARCHAR(255) NOT NULL,
    body                    TEXT NOT NULL,
    created_at              TIMESTAMPTZ DEFAULT NOW(),
    updated_at              TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT uq_sqet_sq_lang UNIQUE (survey_questionnaire_id, language_id)
);

CREATE INDEX IF NOT EXISTS idx_sqet_sq   ON euonqol.surveys_questionnaires_email_templates(survey_questionnaire_id);
CREATE INDEX IF NOT EXISTS idx_sqet_lang ON euonqol.surveys_questionnaires_email_templates(language_id);

COMMENT ON TABLE euonqol.surveys_questionnaires_email_templates
    IS 'Configurable email templates per survey+questionnaire pair, one per language. Supports placeholders: {{survey_name}}, {{questionnaire_name}}, {{link}}, {{qr_code}}';
