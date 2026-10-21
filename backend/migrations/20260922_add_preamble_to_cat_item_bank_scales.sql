-- Migration: add_preamble_to_cat_item_bank_scales
-- Date: 2026-09-22
-- Description: Add a per-language preamble table for CAT scale mappings, populated
--              from the "Questions" sheet's existing "Pramble" column on import
--              (same text repeated on every row sharing a ScaleCode/language) —
--              shown fixed for the whole CAT session of that scale on the public
--              questionnaire. Replaces the old static_questions-lookup hack in
--              getScaleStartingPreamble. One row per (scale, language), following
--              the same shape as static_questions/cat_questions.

SET search_path TO euonqol;

CREATE TABLE euonqol.cat_item_bank_scale_preambles (
  id                      SERIAL PRIMARY KEY,
  cat_item_bank_scale_id  INTEGER NOT NULL REFERENCES euonqol.cat_item_bank_scales(id) ON DELETE CASCADE,
  language_id             INTEGER NOT NULL REFERENCES euonqol.eu_countries(id),
  preamble                TEXT,
  created_at              TIMESTAMPTZ DEFAULT now(),
  updated_at              TIMESTAMPTZ DEFAULT now(),
  UNIQUE (cat_item_bank_scale_id, language_id)
);

CREATE INDEX idx_cibsp_scale_lang ON euonqol.cat_item_bank_scale_preambles (cat_item_bank_scale_id, language_id);

COMMENT ON TABLE euonqol.cat_item_bank_scale_preambles IS 'Per-language fixed preamble text shown above every CAT question of a scale''s session, imported from the Questions sheet''s Pramble column.';
