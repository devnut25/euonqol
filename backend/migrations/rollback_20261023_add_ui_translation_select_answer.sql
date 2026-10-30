-- Rollback: 20261023_add_ui_translation_select_answer.sql

SET search_path TO euonqol;

DELETE FROM euonqol.ui_translations
WHERE key = 'selectAnswer';
