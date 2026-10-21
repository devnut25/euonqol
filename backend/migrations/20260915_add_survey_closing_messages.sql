-- Migration: Add survey_closing_messages table (versioned closing texts per language)
-- Date: 2026-09-15

SET search_path TO euonqol;

CREATE TABLE IF NOT EXISTS euonqol.survey_closing_messages (
    id          SERIAL PRIMARY KEY,
    survey_id   INTEGER NOT NULL REFERENCES euonqol.surveys(id) ON DELETE CASCADE,
    language_id INTEGER NOT NULL REFERENCES euonqol.eu_countries(id) ON UPDATE NO ACTION,
    content     TEXT NOT NULL,
    version     INTEGER NOT NULL DEFAULT 1,
    is_current  BOOLEAN NOT NULL DEFAULT TRUE,
    is_fallback BOOLEAN NOT NULL DEFAULT FALSE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_scm_survey_lang_current ON euonqol.survey_closing_messages (survey_id, language_id, is_current);
CREATE INDEX idx_scm_survey ON euonqol.survey_closing_messages (survey_id);
