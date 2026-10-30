-- Migration: Lock eu_countries (append-only, unique language name, aligned id sequence)
-- Date: 2026-10-24
--
-- Language ids are referenced by every translation table, so they must never change:
--   * unique (case/space-insensitive) language name
--   * UPDATE and DELETE on eu_countries are rejected by a trigger (languages can only be added)
--   * the id sequence is aligned with MAX(id): the seed rows have explicit ids and never advanced it
-- Languages are added from Settings > Languages (POST /languages); module uploads never write them.
--
-- To correct a language on purpose, a migration must disable the trigger explicitly:
--   ALTER TABLE euonqol.eu_countries DISABLE TRIGGER trg_eu_countries_append_only;

SET search_path TO euonqol;

BEGIN;

-- Fail loudly on existing duplicates: merging them needs a human decision
-- (see 20260601_remove_duplicate_eu_countries.sql for how it was done once).
DO $$
DECLARE
  dups TEXT;
BEGIN
  SELECT string_agg(k || ' (ids ' || ids || ')', ', ')
    INTO dups
  FROM (
    SELECT lower(btrim(language)) AS k, string_agg(id::text, ',' ORDER BY id) AS ids
    FROM euonqol.eu_countries
    GROUP BY lower(btrim(language))
    HAVING count(*) > 1
  ) d;

  IF dups IS NOT NULL THEN
    RAISE EXCEPTION 'eu_countries has duplicate language names, resolve them first: %', dups;
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS uq_eu_countries_language_ci
  ON euonqol.eu_countries (lower(btrim(language)));

SELECT setval(
  pg_get_serial_sequence('euonqol.eu_countries', 'id'),
  GREATEST((SELECT COALESCE(MAX(id), 1) FROM euonqol.eu_countries), 1)
);

CREATE OR REPLACE FUNCTION euonqol.eu_countries_append_only() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'eu_countries is append-only: languages cannot be updated or deleted (id %)', OLD.id;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_eu_countries_append_only ON euonqol.eu_countries;
CREATE TRIGGER trg_eu_countries_append_only
  BEFORE UPDATE OR DELETE ON euonqol.eu_countries
  FOR EACH ROW EXECUTE FUNCTION euonqol.eu_countries_append_only();

COMMIT;
