-- Migration: canonical 4-state lifecycle (draft/public/disabled/completed) for
-- surveys and questionnaires + tracking column for cascade disable/restore.
-- Must be deployed atomically with the backend code that stops reading/writing
-- the old literals ('in_progress'/'active'/'archived') — once the CHECK
-- constraints below are tightened, any code still writing those values fails.
--
-- Order matters: questionnaires are migrated first so the "all questionnaires
-- completed -> survey completed" fixup below reads already-consolidated states.

BEGIN;
SET search_path TO euonqol;

-- ── QUESTIONNAIRES ───────────────────────────────────────────────────────────

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'questionnaires_status_check') THEN
    ALTER TABLE questionnaires DROP CONSTRAINT questionnaires_status_check;
  END IF;
END $$;

UPDATE questionnaires SET status = 'public' WHERE status = 'active';
-- 'archived' -> 'disabled': closest semantic match, no ARCHIVED state in the new
-- spec. disabled_by_survey stays false (default), so these will NOT auto-restore
-- when their survey goes back PUBLIC — manual reactivation required.
UPDATE questionnaires SET status = 'disabled' WHERE status = 'archived';

ALTER TABLE questionnaires
  ADD COLUMN IF NOT EXISTS disabled_by_survey BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN questionnaires.disabled_by_survey IS
  'true when this questionnaire was auto-disabled because its survey went DISABLED (as opposed to a manual disable) — only these auto-restore when the survey goes back PUBLIC';

-- Fixup (a): questionnaires already past max_completions but never marked completed
-- (the automatic transition did not exist before this change).
UPDATE questionnaires q
SET status = 'completed'
WHERE q.status IN ('public', 'disabled')
  AND q.max_completions IS NOT NULL
  AND (
    SELECT COUNT(*) FROM survey_questionnaire_patients_assignment a
    JOIN surveys_questionnaires sq ON sq.id = a.survey_questionnaire_id
    WHERE sq.questionnaire_id = q.id AND a.completion_status = 'completed'
  ) >= q.max_completions;

-- Fixup (b): 'public' questionnaires with no tracked assignment and no public_link
-- (i.e. not anonymous_spontaneous) -> draft (the "PUBLIC without assignments -> DRAFT"
-- rule did not exist before this change, so stale data may violate it).
UPDATE questionnaires q
SET status = 'draft'
WHERE q.status = 'public'
  AND NOT EXISTS (
    SELECT 1 FROM surveys_questionnaires sq
    WHERE sq.questionnaire_id = q.id AND sq.public_link IS NOT NULL
  )
  AND NOT EXISTS (
    SELECT 1 FROM survey_questionnaire_patients_assignment a
    JOIN surveys_questionnaires sq ON sq.id = a.survey_questionnaire_id
    WHERE sq.questionnaire_id = q.id AND a.access_mode <> 'anonymous_spontaneous'
  );

ALTER TABLE questionnaires ALTER COLUMN status SET DEFAULT 'draft';

ALTER TABLE questionnaires ADD CONSTRAINT questionnaires_status_check
  CHECK (status::text = ANY (ARRAY['draft', 'public', 'disabled', 'completed']::text[]));

-- ── SURVEYS ──────────────────────────────────────────────────────────────────

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'surveys_status_check') THEN
    ALTER TABLE surveys DROP CONSTRAINT surveys_status_check;
  END IF;
END $$;

UPDATE surveys SET status = 'public' WHERE status = 'in_progress';

-- Legacy 'active' rows (pre-20260526 data that never got migrated): same
-- heuristic as 20260526_update_survey_status_lifecycle.sql.
UPDATE surveys SET status = 'public' WHERE status = 'active' AND (starting_date IS NULL OR starting_date <= NOW());
UPDATE surveys SET status = 'draft'  WHERE status = 'active' AND starting_date > NOW();

-- Fixup (a): end_date already passed for a public/disabled survey -> completed.
UPDATE surveys
SET status = 'completed'
WHERE status IN ('public', 'disabled') AND end_date IS NOT NULL AND end_date <= NOW();

-- Fixup (b): all linked questionnaires already completed -> survey completed
-- (reads the questionnaire states already consolidated above).
UPDATE surveys s
SET status = 'completed'
WHERE s.status IN ('public', 'disabled')
  AND EXISTS (SELECT 1 FROM surveys_questionnaires sq WHERE sq.survey_id = s.id)
  AND NOT EXISTS (
    SELECT 1 FROM surveys_questionnaires sq
    JOIN questionnaires q ON q.id = sq.questionnaire_id
    WHERE sq.survey_id = s.id AND q.status <> 'completed'
  );

ALTER TABLE surveys ADD CONSTRAINT surveys_status_check
  CHECK (status::text = ANY (ARRAY['draft', 'public', 'disabled', 'completed']::text[]));

COMMIT;
