-- Migration: Add ctt_norms_versions table and link surveys to a norms version
--
-- Step A: Create table + insert seed "EUonQoL 2024 v1"
-- Step B: Assign all existing surveys to the seed version
-- Step C: Add NOT NULL constraint + FK

-- Whole migration is skipped if ctt_norms_versions already exists: Steps B/C
-- are NOT safely re-runnable (the seed INSERT would duplicate, and the
-- UPDATE would stomp any ctt_norms_version_id surveys have since been given
-- via later features, e.g. 20260804_ctt_norms_modular_scales.sql), so this
-- must run at most once rather than being patched statement-by-statement.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'euonqol' AND table_name = 'ctt_norms_versions'
  ) THEN
    RAISE NOTICE 'Skipping 20260617_add_ctt_norms_versions: euonqol.ctt_norms_versions already exists';
    RETURN;
  END IF;

  -- ── Step A: Create table ───────────────────────────────────────────────────
  -- (DDL needs EXECUTE inside a DO block; INSERT/UPDATE below don't.)
  EXECUTE $ddl$
    CREATE TABLE euonqol.ctt_norms_versions (
      id          SERIAL PRIMARY KEY,
      name        VARCHAR(100) NOT NULL,
      description TEXT,
      norms       JSONB        NOT NULL,
      is_active   BOOLEAN      NOT NULL DEFAULT TRUE,
      created_by  VARCHAR(36),
      created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
      updated_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
    )
  $ddl$;

  -- Seed: EUonQoL 2024 v1 (values from cttNorms.ts)
  INSERT INTO euonqol.ctt_norms_versions (name, description, norms, is_active)
  VALUES (
    'EUonQoL 2024 v1',
    'Initial normative reference values from the EUonQoL study (2024). Source: cttNorms.ts v1.',
    '{
      "S_Physical Symptoms":          { "average": 41.16635,  "sd": 31.53132 },
      "S_Side Effects":               { "average": 33.94409,  "sd": 30.5314  },
      "S_Partner":                    { "average": 57.9527,   "sd": 36.75481 },
      "S_Employer":                   { "average": 50.8294,   "sd": 41.16623 },
      "S_Lifestyle Changes":          { "average": 43.93582,  "sd": 31.90204 },
      "S_WISP":                       { "average": 86.40959,  "sd": 34.2727  },
      "Individual Cancer Burden":     { "average": 43.37231,  "sd": 22.18087 },
      "Impact of Cancer on Life Role":{ "average": 17.10277,  "sd": 20.93458 },
      "Care and Communication":       { "average": 83.14135,  "sd": 18.08464 }
    }'::jsonb,
    TRUE
  );

  -- ── Step B: Add column (nullable first) and assign seed to all existing surveys
  EXECUTE $ddl$ ALTER TABLE euonqol.surveys ADD COLUMN ctt_norms_version_id INTEGER $ddl$;

  UPDATE euonqol.surveys
  SET ctt_norms_version_id = (SELECT id FROM euonqol.ctt_norms_versions WHERE name = 'EUonQoL 2024 v1');

  -- ── Step C: Add NOT NULL + FK constraint ───────────────────────────────────
  EXECUTE $ddl$ ALTER TABLE euonqol.surveys ALTER COLUMN ctt_norms_version_id SET NOT NULL $ddl$;

  EXECUTE $ddl$
    ALTER TABLE euonqol.surveys
      ADD CONSTRAINT fk_surveys_ctt_norms_version
      FOREIGN KEY (ctt_norms_version_id)
      REFERENCES euonqol.ctt_norms_versions(id)
      ON UPDATE CASCADE
      ON DELETE RESTRICT
  $ddl$;

  EXECUTE $ddl$
    CREATE INDEX idx_surveys_ctt_norms_version_id ON euonqol.surveys(ctt_norms_version_id)
  $ddl$;
END $$;
