-- Migration: scope CAT Item Bank scale->setting mappings per patient group.
--
-- Context: the real-world "CatSettings" sheet of a dynamic kit-version upload
-- maps ScaleCode -> a DIFFERENT setting_key per patient group (columns
-- "Group A", "Group B", "Group C", "Group D"), not a single group-independent
-- setting_key per scale as originally modeled. E.g. scale EF_S may use
-- EUonQOL_CAT_setting_EF for groups A/B/C but EUonQOL_CAT_setting_EF_D for
-- group D. cat_item_bank_scales must therefore be keyed by
-- (cat_item_bank_id, scale_code, patient_group_id), not just
-- (cat_item_bank_id, scale_code).
--
-- Legacy rows: 20260806 section 4a backfills cat_item_bank_scales from legacy
-- dynamic modules (one group-independent cat_setting_id per module), leaving
-- them with no patient_group_id. Since that legacy mapping applied to every
-- patient regardless of group, this migration fans each such row out to one
-- row per patient_group (same cat_setting_id), which preserves runtime
-- behavior exactly. No-op when there are no legacy rows.
-- cat_module_sessions stores scale + cat_setting_id directly (no FK to this
-- table), so replacing these rows does not affect in-flight sessions.

BEGIN;

ALTER TABLE euonqol.cat_item_bank_scales
  ADD COLUMN IF NOT EXISTS patient_group_id INTEGER;

-- Drop the old (bank, scale) unique key first: the fan-out below inserts
-- several rows per (bank, scale).
ALTER TABLE euonqol.cat_item_bank_scales
  DROP CONSTRAINT IF EXISTS cat_item_bank_scales_bank_scale_key;

-- Backfill: fan legacy group-independent rows out to every patient group.
INSERT INTO euonqol.cat_item_bank_scales
  (cat_item_bank_id, scale_code, display_name, cat_setting_id, patient_group_id)
SELECT s.cat_item_bank_id, s.scale_code, s.display_name, s.cat_setting_id, pg.id
FROM euonqol.cat_item_bank_scales s
CROSS JOIN euonqol.patient_groups pg
WHERE s.patient_group_id IS NULL;

DELETE FROM euonqol.cat_item_bank_scales
WHERE patient_group_id IS NULL;

-- Guard: fail loudly (rather than silently corrupt data) if rows are still
-- left with a NULL patient_group_id (only possible if patient_groups is empty).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM euonqol.cat_item_bank_scales WHERE patient_group_id IS NULL) THEN
    RAISE EXCEPTION 'cat_item_bank_scales has rows with no patient_group_id — seed patient_groups before re-running this migration';
  END IF;
END $$;

ALTER TABLE euonqol.cat_item_bank_scales
  ALTER COLUMN patient_group_id SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_cibs_patient_group') THEN
    ALTER TABLE euonqol.cat_item_bank_scales
      ADD CONSTRAINT fk_cibs_patient_group
        FOREIGN KEY (patient_group_id) REFERENCES euonqol.patient_groups(id) ON DELETE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'cat_item_bank_scales_bank_scale_group_key') THEN
    ALTER TABLE euonqol.cat_item_bank_scales
      ADD CONSTRAINT cat_item_bank_scales_bank_scale_group_key
        UNIQUE (cat_item_bank_id, scale_code, patient_group_id);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_cibs_patient_group
  ON euonqol.cat_item_bank_scales(patient_group_id);

COMMIT;
