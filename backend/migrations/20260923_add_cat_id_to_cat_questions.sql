-- Migration: add_cat_id_to_cat_questions
-- Date: 2026-09-23
-- Description: Add the CAT item key column to cat_questions, mirroring
--              static_questions.cat_id — both hold the Questions sheet's
--              IRT_ItemCode (e.g. "AP4", "NV1", "DY6"), which is the key the
--              EORTC CAT engine indexes its item bank by.
--
--              Until now IRT_ItemCode was persisted only on the STATIC import
--              path. Questions imported into a CAT item bank from the dynamic
--              kit-version upload dropped it, so scoring a dynamic module's
--              FIXED (non-adaptive) IRT scales fell back to question_code —
--              which for those rows is the Excel QuestionID ("EUonQoL_014"),
--              not an item key the engine knows. The stateless estimate call
--              POST /runner/estimates/{instrument} then found no usable
--              response and returned irt=0 (information=0) for every such
--              dimension.
--
--              Nullable: rows created by the standalone CAT Item Bank upload
--              legitimately leave it empty, because there question_code IS
--              already the item key — scoring falls back to it.
--
--              NOTE: existing rows stay NULL. Re-run the dynamic kit-version
--              upload to backfill them (the import upserts in place).

SET search_path TO euonqol;

ALTER TABLE euonqol.cat_questions
  ADD COLUMN IF NOT EXISTS cat_id VARCHAR(50);

COMMENT ON COLUMN euonqol.cat_questions.cat_id IS 'CAT item key for this question (Questions sheet IRT_ItemCode, e.g. "AP4"), used as the item key when scoring fixed IRT scales via the stateless CAT estimates endpoint. Mirrors static_questions.cat_id. NULL for bank items uploaded via Settings > CAT Item Bank, whose question_code is already the item key.';
