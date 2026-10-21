-- Migration: assignment email logs (send/bounce history) + scheduler job run log

CREATE TABLE IF NOT EXISTS euonqol.assignment_email_logs (
  id            SERIAL PRIMARY KEY,
  assignment_id INT NOT NULL REFERENCES euonqol.survey_questionnaire_patients_assignment(id) ON DELETE CASCADE,
  status        VARCHAR(20) NOT NULL,
  error_message TEXT,
  attempted_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_email_log_assignment ON euonqol.assignment_email_logs(assignment_id);

CREATE TABLE IF NOT EXISTS euonqol.scheduler_job_runs (
  id              SERIAL PRIMARY KEY,
  job_name        VARCHAR(50) NOT NULL,
  started_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  finished_at     TIMESTAMPTZ,
  total_due       INT NOT NULL DEFAULT 0,
  sent_count      INT NOT NULL DEFAULT 0,
  failed_count    INT NOT NULL DEFAULT 0,
  remaining_count INT NOT NULL DEFAULT 0,
  error           TEXT
);

CREATE INDEX IF NOT EXISTS idx_job_runs_name_started ON euonqol.scheduler_job_runs(job_name, started_at);
