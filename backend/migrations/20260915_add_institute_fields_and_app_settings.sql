-- Migration: institute branding fields + generic app_settings key/value store
--
-- Backs the new admin "Settings" sections for:
--   1. Institute info (the single institution running this installation)
--   2. Outgoing service email configuration (provider/SMTP/from)
--   3. CAT external API credentials (url + api key, rotated periodically)
--
-- `institutes` existed already but was unused; this migration turns it into a proper
-- singleton (row id=1 enforced by CHECK) and adds the extra branding fields.
-- `app_settings` is a new generic key/value table: `value` holds ciphertext (AES-256-GCM,
-- see backend/src/helpers/crypto.ts) when `is_encrypted` is true, so secrets (CAT API key,
-- SMTP password, Resend API key) are never stored in plaintext.

BEGIN;

ALTER TABLE euonqol.institutes
  ADD COLUMN IF NOT EXISTS email VARCHAR(255),
  ADD COLUMN IF NOT EXISTS phone VARCHAR(30),
  ADD COLUMN IF NOT EXISTS referent_name VARCHAR(255),
  ADD COLUMN IF NOT EXISTS logo_url TEXT;

ALTER TABLE euonqol.institutes
  ADD CONSTRAINT institutes_singleton_check CHECK (id = 1);

CREATE TABLE IF NOT EXISTS euonqol.app_settings (
  id           SERIAL PRIMARY KEY,
  key          VARCHAR(120) NOT NULL UNIQUE,
  value        TEXT,
  is_encrypted BOOLEAN NOT NULL DEFAULT false,
  updated_by   VARCHAR(36),
  created_at   TIMESTAMPTZ DEFAULT now(),
  updated_at   TIMESTAMPTZ DEFAULT now()
);

COMMIT;
