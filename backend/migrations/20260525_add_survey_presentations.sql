-- Migration: Add survey_presentations table (versioned welcome/intro texts per language)
-- Date: 2026-05-25

SET search_path TO euonqol;

CREATE TABLE IF NOT EXISTS euonqol.survey_presentations (
    id          SERIAL PRIMARY KEY,
    survey_id   INTEGER NOT NULL REFERENCES euonqol.surveys(id) ON DELETE CASCADE,
    language_id INTEGER NOT NULL REFERENCES euonqol.eu_countries(id) ON UPDATE NO ACTION,
    title       VARCHAR(255),
    content     TEXT NOT NULL,
    version     INTEGER NOT NULL DEFAULT 1,
    is_current  BOOLEAN NOT NULL DEFAULT TRUE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sp_survey_lang_current ON euonqol.survey_presentations (survey_id, language_id, is_current);
CREATE INDEX IF NOT EXISTS idx_sp_survey ON euonqol.survey_presentations (survey_id);
