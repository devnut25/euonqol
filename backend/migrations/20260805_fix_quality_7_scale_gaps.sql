-- Migration: fill in missing intermediate values (2-6) for all quality_7* answer profiles
--
-- The quality_7/quality_7_NA/quality_7_PNTA/quality_7_NA_PNTA answer profiles were seeded
-- with only the two endpoint values (1 = "Pessima"/"Very Poor", 7 = "Ottima"/"Excellent")
-- plus sentinel rows (SKIP_SYS/SKIP_PAT/NA/PNTA) — no rows exist for values 2-6. This is
-- insufficient for a slider control where the patient can land on any intermediate integer:
-- a saved response must reference a concrete answer_options row via answer_option_id, and
-- today none exists for 2/3/4/5/6.
--
-- This migration, for every profile whose code starts with 'quality_7':
--   1. Shifts display_order of everything after value=1 (value=7, and NA/PNTA if present)
--      forward by 5 slots to make room.
--   2. Inserts the 5 missing genuine values (2..6, option_code NULL, is_selectable true)
--      into the freed slots, so the final order reads:
--      SKIP_SYS, SKIP_PAT, 1, 2, 3, 4, 5, 6, 7, [NA], [PNTA].
--   3. Labels each new value with the plain numeral in every language already used by that
--      profile (read dynamically from existing i18n rows, not hardcoded) — intermediate VAS
--      points have no distinct per-language wording, only the two endpoints do.
--   4. Points questions.question_type to 'quality_7' for every question currently using one
--      of these profiles, so they render as a slider once the frontend ships.
--
-- Driven entirely by `code ILIKE 'quality_7%'` — no hardcoded profile/option ids, so it also
-- covers any variant not enumerated by hand.

BEGIN;

-- questions.question_type is CHECK-constrained to ('check', 'textcheck', 'text') — widen it
-- to also allow 'quality_7' (the new slider render mode) before the UPDATE below can set it.
ALTER TABLE euonqol.questions DROP CONSTRAINT IF EXISTS questions_question_type_check;
ALTER TABLE euonqol.questions ADD CONSTRAINT questions_question_type_check
  CHECK (question_type IN ('check', 'textcheck', 'text', 'quality_7'));

DO $$
DECLARE
  profile_row RECORD;
  new_value INT;
  new_option_id INT;
  lang_id INT;
BEGIN
  FOR profile_row IN
    SELECT id, code FROM euonqol.answer_profiles WHERE code ILIKE 'quality_7%'
  LOOP
    -- Skip profiles that already have the intermediate values (2-6) inserted —
    -- without this, re-running the migration would insert duplicate rows and
    -- shift display_order again.
    IF EXISTS (
      SELECT 1 FROM euonqol.answer_options
      WHERE answer_profile_id = profile_row.id AND value = 2
    ) THEN
      CONTINUE;
    END IF;

    -- Make room: push value=7 (and any NA/PNTA rows after it) forward by 5 slots.
    UPDATE euonqol.answer_options
    SET display_order = display_order + 5
    WHERE answer_profile_id = profile_row.id AND display_order >= 4;

    FOR new_value IN 2..6 LOOP
      INSERT INTO euonqol.answer_options (answer_profile_id, value, option_code, display_order, is_selectable)
      VALUES (profile_row.id, new_value, NULL, 2 + new_value, TRUE)
      RETURNING id INTO new_option_id;

      FOR lang_id IN
        SELECT DISTINCT oi.language_id
        FROM euonqol.answer_option_i18n oi
        JOIN euonqol.answer_options ao ON ao.id = oi.answer_option_id
        WHERE ao.answer_profile_id = profile_row.id
      LOOP
        INSERT INTO euonqol.answer_option_i18n (answer_option_id, language_id, label)
        VALUES (new_option_id, lang_id, new_value::text);
      END LOOP;
    END LOOP;
  END LOOP;
END $$;

-- Existing (and future) questions on these profiles should render as a slider.
UPDATE euonqol.questions
SET question_type = 'quality_7'
WHERE answer_profile_id IN (
  SELECT id FROM euonqol.answer_profiles WHERE code ILIKE 'quality_7%'
);

COMMIT;
