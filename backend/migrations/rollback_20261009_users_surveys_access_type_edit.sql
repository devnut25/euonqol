-- Rollback: users_surveys_access_type_edit
-- Date: 2026-10-09
-- Only the column default is restored: the shares promoted from 'view' to 'edit'
-- cannot be told apart from the ones created as 'edit', so the data is left as is.

SET search_path TO euonqol;

ALTER TABLE euonqol.users_surveys
  ALTER COLUMN access_type SET DEFAULT 'view';
