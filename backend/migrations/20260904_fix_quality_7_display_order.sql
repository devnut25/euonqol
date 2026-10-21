-- Migration: fix display_order for quality_7* answer_options
--
-- 20260805_fix_quality_7_scale_gaps.sql inserted the missing values 2-6 but its
-- "shift value=7 (and NA/PNTA) forward by 5" step never actually moved value=7,
-- leaving it tied with value=2 at display_order=4 (and NA/PNTA similarly out of
-- place). Result: options render as 1, 7, 2, 3, 4, 5, 6 instead of 1..7.
--
-- Fix: recompute display_order per profile strictly by `value` ascending — the
-- `value` column already encodes the intended order for this profile family
-- (SKIP_SYS=-2, SKIP_PAT=-1, scale=1..7, NA=8, PNTA=9), so this is a plain
-- row_number() re-sequencing, scoped to quality_7* profiles only.

BEGIN;

WITH ranked AS (
  SELECT
    ao.id,
    ROW_NUMBER() OVER (PARTITION BY ao.answer_profile_id ORDER BY ao.value ASC) AS rn
  FROM euonqol.answer_options ao
  JOIN euonqol.answer_profiles ap ON ap.id = ao.answer_profile_id
  WHERE ap.code ILIKE 'quality_7%'
)
UPDATE euonqol.answer_options ao
SET display_order = ranked.rn
FROM ranked
WHERE ao.id = ranked.id;

COMMIT;
