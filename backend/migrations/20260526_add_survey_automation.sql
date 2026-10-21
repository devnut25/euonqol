-- Migration: Add survey automation (send mode + reminders)
-- Date: 2026-05-26

-- 1. Add automation columns to surveys table
ALTER TABLE euonqol.surveys
  ADD COLUMN IF NOT EXISTS send_mode VARCHAR(20) NOT NULL DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS send_delay_hours INT NULL,
  ADD COLUMN IF NOT EXISTS send_scheduled_at TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS reminder_max_count INT NULL;

COMMENT ON COLUMN euonqol.surveys.send_mode IS 'manual | immediate | after_delay | scheduled';
COMMENT ON COLUMN euonqol.surveys.send_delay_hours IS 'Hours to delay initial send (used when send_mode = after_delay)';
COMMENT ON COLUMN euonqol.surveys.send_scheduled_at IS 'Absolute datetime for initial send (used when send_mode = scheduled)';
COMMENT ON COLUMN euonqol.surveys.reminder_max_count IS 'Maximum number of reminders to send (NULL = unlimited)';

-- 2. Add automation tracking columns to assignments table
ALTER TABLE euonqol.survey_questionnaire_patients_assignment
  ADD COLUMN IF NOT EXISTS scheduled_send_at TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS reminder_count INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS next_reminder_at TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS email_language_id INT NULL REFERENCES euonqol.eu_countries(id);

COMMENT ON COLUMN euonqol.survey_questionnaire_patients_assignment.scheduled_send_at IS 'When to automatically send the initial email (computed at assignment time)';
COMMENT ON COLUMN euonqol.survey_questionnaire_patients_assignment.reminder_count IS 'Number of reminder emails already sent';
COMMENT ON COLUMN euonqol.survey_questionnaire_patients_assignment.next_reminder_at IS 'When to send the next reminder (NULL = no reminder pending)';
COMMENT ON COLUMN euonqol.survey_questionnaire_patients_assignment.email_language_id IS 'Language used for email sending (preserved for automated reminders)';

-- 3. Indexes for scheduler queries
CREATE INDEX IF NOT EXISTS idx_assign_scheduled_send
  ON euonqol.survey_questionnaire_patients_assignment(scheduled_send_at)
  WHERE scheduled_send_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_assign_next_reminder
  ON euonqol.survey_questionnaire_patients_assignment(next_reminder_at)
  WHERE next_reminder_at IS NOT NULL;
