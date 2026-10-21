-- Migration: introduce reusable CAT Item Banks, decouple CAT questions from
--   kit_version_id, map ScaleCode -> cat_settings per bank, and let a single
--   dynamic module drive multiple concurrent/sequential CAT sessions (one per
--   scale) instead of exactly one session per module.
--
-- Context: dynamic (CAT) kit-version uploads today create ONE ungrouped
-- module tied to ONE cat_setting_id. Going forward, a dynamic upload is
-- structured exactly like a static one (Questions/Answers/Languages sheets,
-- 4 patient-group columns, one module per group) plus a new "CatSettings"
-- sheet mapping ScaleCode -> setting_key. CAT items become a reusable
-- "CAT Item Bank" library (not owned by a single kit_version), and each
-- scale within a bank maps to the cat_settings row that drives its CAT
-- session at runtime.
--
-- Safe to run on a fresh/empty dynamic dataset (no existing cat_module_sessions
-- or question_kind='cat' rows) — the backfill blocks below are no-ops in that
-- case. If real in-flight patient CAT data exists, verify row counts first:
--   SELECT count(*) FROM euonqol.cat_module_sessions;
--   SELECT count(*) FROM euonqol.questions WHERE question_kind = 'cat';
--
-- NOTE on ordering: each backfill step only references columns/tables created
-- by an EARLIER step in this same file (modules.cat_item_bank_id must exist
-- and be populated before cat_item_bank_scales' backfill can join against it,
-- etc.) — do not reorder sections without re-checking this dependency chain.

BEGIN;

-- ================================================
-- 1. cat_item_banks (new table) — reusable library of CAT items
-- ================================================
CREATE TABLE IF NOT EXISTS euonqol.cat_item_banks (
  id          SERIAL PRIMARY KEY,
  name        VARCHAR(120) NOT NULL UNIQUE,
  description TEXT,
  is_active   BOOLEAN NOT NULL DEFAULT true,
  created_by  VARCHAR(36),
  created_at  TIMESTAMPTZ(6) DEFAULT NOW(),
  updated_at  TIMESTAMPTZ(6) DEFAULT NOW()
);

-- ================================================
-- 2. questions: decouple CAT rows from kit_version_id, own them via a bank
-- ================================================
ALTER TABLE euonqol.questions
  ADD COLUMN IF NOT EXISTS cat_item_bank_id INTEGER;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_questions_cat_item_bank') THEN
    ALTER TABLE euonqol.questions
      ADD CONSTRAINT fk_questions_cat_item_bank
        FOREIGN KEY (cat_item_bank_id) REFERENCES euonqol.cat_item_banks(id)
        ON DELETE CASCADE;
  END IF;
END $$;

ALTER TABLE euonqol.questions
  ALTER COLUMN kit_version_id DROP NOT NULL;

-- 2a. Backfill: give every pre-existing CAT question (owned by a kit_version
-- today) a "Legacy Bank" named after its kit_version, and repoint it there.
-- No-op if there are no question_kind='cat' rows yet.
INSERT INTO euonqol.cat_item_banks (name, description)
SELECT DISTINCT 'Legacy Bank - ' || kv.name, 'Auto-created while migrating to reusable CAT Item Banks'
FROM euonqol.questions q
JOIN euonqol.kit_versions kv ON kv.id = q.kit_version_id
WHERE q.question_kind = 'cat'
ON CONFLICT (name) DO NOTHING;

UPDATE euonqol.questions q
SET cat_item_bank_id = cib.id
FROM euonqol.kit_versions kv
JOIN euonqol.cat_item_banks cib ON cib.name = 'Legacy Bank - ' || kv.name
WHERE q.kit_version_id = kv.id AND q.question_kind = 'cat';

UPDATE euonqol.questions
SET kit_version_id = NULL
WHERE question_kind = 'cat' AND cat_item_bank_id IS NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'questions_kit_or_bank_scope_check') THEN
    ALTER TABLE euonqol.questions
      ADD CONSTRAINT questions_kit_or_bank_scope_check
      CHECK (
        (question_kind = 'cat' AND cat_item_bank_id IS NOT NULL AND kit_version_id IS NULL)
        OR
        (question_kind <> 'cat' AND kit_version_id IS NOT NULL AND cat_item_bank_id IS NULL)
      );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'questions_bank_kind_code_key') THEN
    ALTER TABLE euonqol.questions
      ADD CONSTRAINT questions_bank_kind_code_key
        UNIQUE (cat_item_bank_id, question_kind, question_code);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_q_bank_kind
  ON euonqol.questions (cat_item_bank_id, question_kind);

-- ================================================
-- 3. modules: attach a dynamic module to the bank it was populated from
-- (must run BEFORE cat_item_bank_scales' backfill below, which joins on
-- modules.cat_item_bank_id)
-- ================================================
ALTER TABLE euonqol.modules
  ADD COLUMN IF NOT EXISTS cat_item_bank_id INTEGER;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_modules_cat_item_bank') THEN
    ALTER TABLE euonqol.modules
      ADD CONSTRAINT fk_modules_cat_item_bank
        FOREIGN KEY (cat_item_bank_id) REFERENCES euonqol.cat_item_banks(id) ON DELETE RESTRICT;
  END IF;
END $$;

-- 3a. Backfill: repoint legacy dynamic modules to the bank their questions moved to.
UPDATE euonqol.modules m
SET cat_item_bank_id = cib.id
FROM euonqol.modules_questions mq
JOIN euonqol.questions q ON q.id = mq.question_id
JOIN euonqol.cat_item_banks cib ON cib.id = q.cat_item_bank_id
WHERE mq.module_id = m.id AND m.type = 'dynamic' AND m.cat_item_bank_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_modules_cat_item_bank
  ON euonqol.modules(cat_item_bank_id);

-- NOTE: modules.cat_setting_id is left in place but is DEPRECATED for
-- type='dynamic' going forward — the import pipeline no longer writes it for
-- new dynamic modules; per-scale cat_setting resolution now goes through
-- cat_item_bank_scales instead.

-- ================================================
-- 4. cat_item_bank_scales: ScaleCode -> cat_settings mapping, per bank
-- ================================================
CREATE TABLE IF NOT EXISTS euonqol.cat_item_bank_scales (
  id               SERIAL PRIMARY KEY,
  cat_item_bank_id INTEGER NOT NULL,
  scale_code       VARCHAR(50) NOT NULL,
  display_name     VARCHAR(120),
  cat_setting_id   INTEGER NOT NULL,
  created_at       TIMESTAMPTZ(6) DEFAULT NOW(),
  updated_at       TIMESTAMPTZ(6) DEFAULT NOW(),

  CONSTRAINT fk_cibs_bank
    FOREIGN KEY (cat_item_bank_id) REFERENCES euonqol.cat_item_banks(id) ON DELETE CASCADE,
  CONSTRAINT fk_cibs_cat_setting
    FOREIGN KEY (cat_setting_id) REFERENCES euonqol.cat_settings(id) ON DELETE RESTRICT,
  CONSTRAINT cat_item_bank_scales_bank_scale_key UNIQUE (cat_item_bank_id, scale_code)
);

CREATE INDEX IF NOT EXISTS idx_cibs_cat_setting
  ON euonqol.cat_item_bank_scales(cat_setting_id);

-- 4a. Backfill: for every legacy dynamic module (single cat_setting_id today),
-- map each distinct scale used by its questions to that same cat_setting, so
-- getScalesForModule() resolves correctly for data imported under the old flow.
-- Requires modules.cat_item_bank_id to already be populated (section 3a above).
INSERT INTO euonqol.cat_item_bank_scales (cat_item_bank_id, scale_code, cat_setting_id)
SELECT DISTINCT m.cat_item_bank_id, COALESCE(q.scale, '__legacy__'), m.cat_setting_id
FROM euonqol.modules m
JOIN euonqol.modules_questions mq ON mq.module_id = m.id
JOIN euonqol.questions q ON q.id = mq.question_id
WHERE m.type = 'dynamic' AND m.cat_setting_id IS NOT NULL AND m.cat_item_bank_id IS NOT NULL
ON CONFLICT (cat_item_bank_id, scale_code) DO NOTHING;

-- ================================================
-- 5. cat_module_sessions: one session per (assignment, module, scale)
-- ================================================
ALTER TABLE euonqol.cat_module_sessions
  ADD COLUMN IF NOT EXISTS scale VARCHAR(50),
  ADD COLUMN IF NOT EXISTS cat_setting_id INTEGER;

-- 5a. Backfill existing single-session-per-module rows: assign them the
-- module's own cat_setting_id and an arbitrary (but stable) scale it owns,
-- preserving old single-scale behavior for in-flight patients.
UPDATE euonqol.cat_module_sessions cms
SET scale = sub.scale_code, cat_setting_id = sub.cat_setting_id
FROM (
  SELECT DISTINCT ON (cibs.cat_item_bank_id) cibs.cat_item_bank_id, cibs.scale_code, cibs.cat_setting_id
  FROM euonqol.cat_item_bank_scales cibs
) sub
JOIN euonqol.modules m ON m.cat_item_bank_id = sub.cat_item_bank_id
WHERE cms.module_id = m.id AND cms.scale IS NULL;

ALTER TABLE euonqol.cat_module_sessions
  ALTER COLUMN scale SET NOT NULL,
  ALTER COLUMN cat_setting_id SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_cat_session_setting') THEN
    ALTER TABLE euonqol.cat_module_sessions
      ADD CONSTRAINT fk_cat_session_setting
        FOREIGN KEY (cat_setting_id) REFERENCES euonqol.cat_settings(id) ON DELETE RESTRICT;
  END IF;
END $$;

ALTER TABLE euonqol.cat_module_sessions
  DROP CONSTRAINT IF EXISTS cat_module_sessions_assignment_module_unique;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'cat_module_sessions_assignment_module_scale_unique') THEN
    ALTER TABLE euonqol.cat_module_sessions
      ADD CONSTRAINT cat_module_sessions_assignment_module_scale_unique
        UNIQUE (assignment_id, module_id, scale);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_cat_session_setting
  ON euonqol.cat_module_sessions(cat_setting_id);

COMMIT;
