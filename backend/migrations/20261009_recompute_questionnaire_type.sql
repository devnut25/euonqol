-- Migration: recompute_questionnaire_type
-- Date: 2026-10-09
-- Description: questionnaires.type was only set on create, so swapping the kit module
-- (static <-> dynamic) while editing left a stale type. Realign it with the kit module.

SET search_path TO euonqol;

UPDATE euonqol.questionnaires q
  SET type = m.type
  FROM euonqol.questionnaires_modules qm
  JOIN euonqol.modules m ON m.id = qm.module_id
  WHERE qm.questionnaire_id = q.id
    AND m.type IN ('static', 'dynamic')
    AND q.type <> m.type;
