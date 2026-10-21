-- Migration: Add versioning columns to privacy_policies
-- Date: 2026-05-25

SET search_path TO euonqol;

ALTER TABLE euonqol.privacy_policies
    ADD COLUMN IF NOT EXISTS version    INTEGER NOT NULL DEFAULT 1,
    ADD COLUMN IF NOT EXISTS is_current BOOLEAN NOT NULL DEFAULT TRUE;

CREATE INDEX IF NOT EXISTS idx_pp_lang_current ON euonqol.privacy_policies (language_id, is_current);
