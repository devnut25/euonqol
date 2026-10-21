-- Migration: Drop answer_type check constraint from socio_demo_answers
-- Date: 2026-05-25
-- Description: The SocioDemo Excel template uses dynamic answer types ('Radio Button',
--              'Radio Button+Text', etc.) that evolve with the template.
--              The rigid check constraint caused import failures; removing it.

ALTER TABLE euonqol.socio_demo_answers
  DROP CONSTRAINT IF EXISTS socio_demo_answers_answer_type_check;
