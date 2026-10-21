-- Migration: Remove duplicate eu_countries entries
-- Duplicates to remove: 10, 11, 12, 31, 32, 33, 35
-- For each duplicate, the canonical ID is the MIN(id) with the same language name.
-- All FK references are migrated to the canonical ID before deletion.
-- Rows in child tables that would cause a UNIQUE conflict are deleted (true duplicates).

BEGIN;

DO $$
DECLARE
  dup_ids  INT[] := ARRAY[10, 11, 12, 31, 32, 33, 35];
  dup_id   INT;
  can_id   INT;
BEGIN
  FOREACH dup_id IN ARRAY dup_ids LOOP

    -- Resolve canonical ID: lowest id sharing the same language name
    SELECT MIN(c2.id) INTO can_id
    FROM euonqol.eu_countries c1
    JOIN euonqol.eu_countries c2
      ON LOWER(TRIM(c2.language)) = LOWER(TRIM(c1.language))
     AND c2.id != c1.id
    WHERE c1.id = dup_id;

    IF can_id IS NULL THEN
      RAISE NOTICE 'No canonical ID found for duplicate %, skipping.', dup_id;
      CONTINUE;
    END IF;

    RAISE NOTICE 'Migrating duplicate id=% → canonical id=%', dup_id, can_id;

    -- ── answer_option_i18n (UNIQUE: answer_option_id, language_id) ──────────
    DELETE FROM euonqol.answer_option_i18n
    WHERE language_id = dup_id
      AND (answer_option_id, can_id) IN (
        SELECT answer_option_id, can_id FROM euonqol.answer_option_i18n WHERE language_id = can_id
      );
    UPDATE euonqol.answer_option_i18n SET language_id = can_id WHERE language_id = dup_id;

    -- ── kit_version_files (UNIQUE: kit_version_id, question_kind, language_id) ──
    DELETE FROM euonqol.kit_version_files
    WHERE language_id = dup_id
      AND (kit_version_id, question_kind, can_id) IN (
        SELECT kit_version_id, question_kind, can_id FROM euonqol.kit_version_files WHERE language_id = can_id
      );
    UPDATE euonqol.kit_version_files SET language_id = can_id WHERE language_id = dup_id;

    -- ── static_questions (UNIQUE: question_id, language_id) ─────────────────
    DELETE FROM euonqol.static_questions
    WHERE language_id = dup_id
      AND (question_id, can_id) IN (
        SELECT question_id, can_id FROM euonqol.static_questions WHERE language_id = can_id
      );
    UPDATE euonqol.static_questions SET language_id = can_id WHERE language_id = dup_id;

    -- ── cat_questions (UNIQUE: question_id, language_id) ────────────────────
    DELETE FROM euonqol.cat_questions
    WHERE language_id = dup_id
      AND (question_id, can_id) IN (
        SELECT question_id, can_id FROM euonqol.cat_questions WHERE language_id = can_id
      );
    UPDATE euonqol.cat_questions SET language_id = can_id WHERE language_id = dup_id;

    -- ── socio_demo_questions (UNIQUE: question_id, language_id) ─────────────
    DELETE FROM euonqol.socio_demo_questions
    WHERE language_id = dup_id
      AND (question_id, can_id) IN (
        SELECT question_id, can_id FROM euonqol.socio_demo_questions WHERE language_id = can_id
      );
    UPDATE euonqol.socio_demo_questions SET language_id = can_id WHERE language_id = dup_id;

    -- ── socio_demo_answers (no single UNIQUE on language_id alone) ───────────
    UPDATE euonqol.socio_demo_answers SET language_id = can_id WHERE language_id = dup_id;

    -- ── feedback_question_translations (UNIQUE: question_id, language_id) ───
    DELETE FROM euonqol.feedback_question_translations
    WHERE language_id = dup_id
      AND (question_id, can_id) IN (
        SELECT question_id, can_id FROM euonqol.feedback_question_translations WHERE language_id = can_id
      );
    UPDATE euonqol.feedback_question_translations SET language_id = can_id WHERE language_id = dup_id;

    -- ── feedback_answers (no blocking unique on language_id) ─────────────────
    UPDATE euonqol.feedback_answers SET language_id = can_id WHERE language_id = dup_id;

    -- ── responses (UNIQUE: assignment_id, question_id, language_id) ─────────
    DELETE FROM euonqol.responses
    WHERE language_id = dup_id
      AND (assignment_id, question_id, can_id) IN (
        SELECT assignment_id, question_id, can_id FROM euonqol.responses WHERE language_id = can_id
      );
    UPDATE euonqol.responses SET language_id = can_id WHERE language_id = dup_id;

    -- ── privacy_policies (no unique on language_id alone) ───────────────────
    UPDATE euonqol.privacy_policies SET language_id = can_id WHERE language_id = dup_id;

    -- ── survey_presentations (no unique blocking on language_id alone) ───────
    UPDATE euonqol.survey_presentations SET language_id = can_id WHERE language_id = dup_id;

    -- ── survey_eligibility_question_translations (UNIQUE: question_id, language_id) ──
    DELETE FROM euonqol.survey_eligibility_question_translations
    WHERE language_id = dup_id
      AND (question_id, can_id) IN (
        SELECT question_id, can_id FROM euonqol.survey_eligibility_question_translations WHERE language_id = can_id
      );
    UPDATE euonqol.survey_eligibility_question_translations SET language_id = can_id WHERE language_id = dup_id;

    -- ── surveys_questionnaires_email_templates (UNIQUE: survey_questionnaire_id, language_id) ──
    DELETE FROM euonqol.surveys_questionnaires_email_templates
    WHERE language_id = dup_id
      AND (survey_questionnaire_id, can_id) IN (
        SELECT survey_questionnaire_id, can_id FROM euonqol.surveys_questionnaires_email_templates WHERE language_id = can_id
      );
    UPDATE euonqol.surveys_questionnaires_email_templates SET language_id = can_id WHERE language_id = dup_id;

    -- ── survey_questionnaire_patients_assignment (email_language_id, nullable) ──
    UPDATE euonqol.survey_questionnaire_patients_assignment
    SET email_language_id = can_id
    WHERE email_language_id = dup_id;

  END LOOP;
END $$;

-- Finally, delete the duplicate eu_countries rows
DELETE FROM euonqol.eu_countries WHERE id IN (10, 11, 12, 31, 32, 33, 35);

COMMIT;
