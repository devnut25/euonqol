-- Migration: users_surveys_access_type_edit
-- Date: 2026-10-09
-- Description: Managers a survey is shared with now get 'edit' access instead of 'view'.
-- Change the column default and promote every existing 'view' share to 'edit'.

SET search_path TO euonqol;

ALTER TABLE euonqol.users_surveys
  ALTER COLUMN access_type SET DEFAULT 'edit';

UPDATE euonqol.users_surveys
  SET access_type = 'edit'
  WHERE access_type = 'view';
