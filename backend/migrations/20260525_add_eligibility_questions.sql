-- Migration: Add survey_eligibility_questions and translations tables (versioned, normalized)
-- Date: 2026-05-25

SET search_path TO euonqol;

-- Logical question per survey (language-neutral metadata, versioned)
CREATE TABLE IF NOT EXISTS euonqol.survey_eligibility_questions (
    id             SERIAL PRIMARY KEY,
    survey_id      INTEGER NOT NULL REFERENCES euonqol.surveys(id) ON DELETE CASCADE,
    expected_answer VARCHAR(3) NOT NULL DEFAULT 'yes' CHECK (expected_answer IN ('yes', 'no')),
    order_position  INTEGER NOT NULL DEFAULT 0,
    is_active       BOOLEAN NOT NULL DEFAULT TRUE,
    version         INTEGER NOT NULL DEFAULT 1,
    is_current      BOOLEAN NOT NULL DEFAULT TRUE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_seq_survey_current ON euonqol.survey_eligibility_questions (survey_id, is_current);
CREATE INDEX IF NOT EXISTS idx_seq_survey ON euonqol.survey_eligibility_questions (survey_id);

-- Translations: text per language per question version
CREATE TABLE IF NOT EXISTS euonqol.survey_eligibility_question_translations (
    id                       SERIAL PRIMARY KEY,
    question_id              INTEGER NOT NULL REFERENCES euonqol.survey_eligibility_questions(id) ON DELETE CASCADE,
    language_id              INTEGER NOT NULL REFERENCES euonqol.eu_countries(id) ON UPDATE NO ACTION,
    question_text            VARCHAR(500) NOT NULL,
    disqualification_message TEXT,
    UNIQUE (question_id, language_id)
);

CREATE INDEX IF NOT EXISTS idx_seqt_question ON euonqol.survey_eligibility_question_translations (question_id);
CREATE INDEX IF NOT EXISTS idx_seqt_question_lang ON euonqol.survey_eligibility_question_translations (question_id, language_id);
