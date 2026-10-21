-- Migration: convert ctt_norms_versions.norms from a fixed record keyed by
-- descriptive scale name ({"S_Physical Symptoms": {average, sd}, ...}) to a
-- modular array of {name, scaleCode, average, sd} entries. scaleCode values
-- reuse the mapping previously hardcoded in backend/src/config/cttNorms.ts
-- (CTT_SCALE_CODE_TO_NAME, now removed) so existing scoring behavior is
-- preserved exactly.
--
-- Safe to run once: rows already in array shape are skipped via the
-- jsonb_typeof(norms) = 'object' guard, so re-running is a no-op.

BEGIN;

UPDATE euonqol.ctt_norms_versions
SET norms = (
  SELECT jsonb_agg(
    jsonb_build_object(
      'name', key,
      'scaleCode', CASE key
        WHEN 'S_Physical Symptoms' THEN 'PS_S'
        WHEN 'S_Side Effects' THEN 'SE_S'
        WHEN 'S_Partner' THEN 'PAR_S'
        WHEN 'S_Employer' THEN 'EMP_S'
        WHEN 'S_Lifestyle Changes' THEN 'LC_S'
        WHEN 'S_WISP' THEN 'WISP'
        WHEN 'Individual Cancer Burden' THEN 'ICB_S'
        WHEN 'Impact of Cancer on Life Role' THEN 'ICLR_S'
        WHEN 'Care and Communication' THEN 'CC_S'
        ELSE key
      END,
      'average', (value->>'average')::numeric,
      'sd', (value->>'sd')::numeric
    )
  )
  FROM jsonb_each(norms)
)
WHERE jsonb_typeof(norms) = 'object';

COMMIT;
