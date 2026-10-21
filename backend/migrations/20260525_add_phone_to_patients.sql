-- Add phone_prefix and phone columns to patients table

ALTER TABLE euonqol.patients
  ADD COLUMN IF NOT EXISTS phone_prefix VARCHAR(10) NULL,
  ADD COLUMN IF NOT EXISTS phone        VARCHAR(30) NULL;
