-- Migration: add 'feedback' to type CHECK constraint
-- Affects:
--   euonqol.modules  (modules_type_check)

BEGIN;

-- ── modules ────────────────────────────────────────────────────────────────
ALTER TABLE euonqol.modules
  DROP CONSTRAINT IF EXISTS modules_type_check;

ALTER TABLE euonqol.modules
  ADD CONSTRAINT modules_type_check
    CHECK (type IN ('static', 'dynamic', 'socio-demo', 'feedback'));

COMMIT;
