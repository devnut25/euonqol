-- Rollback: 20261024_lock_eu_countries.sql
-- The sequence is left aligned with MAX(id): harmless.

SET search_path TO euonqol;

BEGIN;

DROP TRIGGER IF EXISTS trg_eu_countries_append_only ON euonqol.eu_countries;
DROP FUNCTION IF EXISTS euonqol.eu_countries_append_only();
DROP INDEX IF EXISTS euonqol.uq_eu_countries_language_ci;

COMMIT;
