-- Migration: Convert questions.value from English text label to numeric position
-- The 'value' field in conditional questions (parent_qid IS NOT NULL) was stored
-- as the English text of the answer option (e.g. "Yes", "Not at all").
-- After this migration it stores the numeric 'value' field from answer_options
-- (e.g. "1", "2", "-1"), which is language-agnostic and matches the new frontend logic.
--
-- Run a diagnostic SELECT first to check coverage before applying the UPDATE.

-- ─── DIAGNOSTIC (run this first, do not apply) ───────────────────────────────
-- SELECT
--   q.id,
--   q.question_code,
--   q.parent_qid,
--   q.value AS old_value,
--   ao.value::text AS new_value,
--   aoi.label AS matched_label
-- FROM euonqol.questions q
-- JOIN euonqol.questions pq
--   ON pq.question_code = q.parent_qid
--   AND pq.kit_version_id = q.kit_version_id
-- JOIN euonqol.answer_options ao
--   ON ao.answer_profile_id = pq.answer_profile_id
-- JOIN euonqol.answer_option_i18n aoi
--   ON aoi.answer_option_id = ao.id
--   AND aoi.language_id = (
--     SELECT id FROM euonqol.eu_countries WHERE LOWER(language) = 'english' LIMIT 1
--   )
-- WHERE q.parent_qid IS NOT NULL
--   AND q.value IS NOT NULL
--   AND TRIM(q.value) <> ''
--   AND aoi.label ILIKE TRIM(q.value)
--   AND q.question_kind = 'static'
-- ORDER BY q.id;

-- ─── UPDATE ───────────────────────────────────────────────────────────────────
BEGIN;

UPDATE euonqol.questions q
SET value = (
  SELECT ao.value::text
  FROM euonqol.questions pq
  JOIN euonqol.answer_options ao
    ON ao.answer_profile_id = pq.answer_profile_id
  JOIN euonqol.answer_option_i18n aoi
    ON aoi.answer_option_id = ao.id
    AND aoi.language_id = (
      SELECT id FROM euonqol.eu_countries WHERE LOWER(language) = 'english' LIMIT 1
    )
  WHERE pq.question_code = q.parent_qid
    AND pq.kit_version_id = q.kit_version_id
    AND aoi.label ILIKE TRIM(q.value)
  LIMIT 1
)
WHERE q.parent_qid IS NOT NULL
  AND q.value IS NOT NULL
  AND TRIM(q.value) <> ''
  AND q.question_kind = 'static';

-- Verify: rows where value was not matched will still contain the old text.
-- Check them with:
-- SELECT id, question_code, parent_qid, value FROM euonqol.questions
-- WHERE parent_qid IS NOT NULL AND value IS NOT NULL
-- AND question_kind = 'static'
-- AND value ~ '[^0-9\-]';  -- still contains non-numeric chars

COMMIT;
