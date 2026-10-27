-- Rollback: 20261019_add_ui_translation_resume.sql

SET search_path TO euonqol;

DELETE FROM euonqol.ui_translations
WHERE key = 'responsesAlreadySaved';
