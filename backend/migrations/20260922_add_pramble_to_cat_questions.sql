-- Migration: add_pramble_to_cat_questions
-- Date: 2026-09-22
-- Description: Add a per-language preamble column to cat_questions, mirroring
--              static_questions.pramble — used for FIXED (non-adaptive) CAT
--              questions, i.e. IRT-scored questions whose scale has no
--              cat_item_bank_scales mapping for the module's patient group (no
--              adaptive session exists for them, they're presented one at a
--              time exactly like a static question — see
--              QuestionnaireService.getPreview's fixedQuestions branch).
--              Adaptive CAT sessions still use cat_item_bank_scale_preambles
--              instead (fixed per scale, not per question).

SET search_path TO euonqol;

ALTER TABLE euonqol.cat_questions
  ADD COLUMN IF NOT EXISTS pramble TEXT;

COMMENT ON COLUMN euonqol.cat_questions.pramble IS 'Per-language preamble text for a fixed (non-adaptive) CAT question, imported from the Questions sheet''s Pramble column. Mirrors static_questions.pramble.';
