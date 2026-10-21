-- Migration: Update survey status lifecycle
-- Adds 'draft' and 'completed' statuses; changes default from 'active' to 'draft'
-- Migrates existing data to the new lifecycle

-- 1. Update the CHECK constraint to allow new values (already applied manually)
-- ALTER TABLE euonqol.surveys DROP CONSTRAINT surveys_status_check;
-- ALTER TABLE euonqol.surveys ADD CONSTRAINT surveys_status_check
--   CHECK (status::text = ANY(ARRAY['draft', 'in_progress', 'completed', 'disabled', 'active']::text[]));

-- 2. Change column default
ALTER TABLE euonqol.surveys ALTER COLUMN status SET DEFAULT 'draft';

-- 3. Migrate existing surveys:
--    active + starting_date in the past (or null) → in_progress (already started)
UPDATE euonqol.surveys
SET status = 'in_progress'
WHERE status = 'active'
  AND (starting_date IS NULL OR starting_date <= NOW());

--    active + starting_date in the future → draft (not started yet)
UPDATE euonqol.surveys
SET status = 'draft'
WHERE status = 'active'
  AND starting_date > NOW();

-- 4. Migrate in_progress surveys where end_date has already passed → completed
UPDATE euonqol.surveys
SET status = 'completed'
WHERE status = 'in_progress'
  AND end_date IS NOT NULL
  AND end_date <= NOW();
