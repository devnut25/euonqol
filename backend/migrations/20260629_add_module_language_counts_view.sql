CREATE OR REPLACE VIEW euonqol.module_language_counts AS
SELECT
  mq.module_id,
  COUNT(DISTINCT
    CASE
      WHEN m.type = 'static'     THEN sq.language_id
      WHEN m.type = 'dynamic'    THEN cq.language_id
      WHEN m.type = 'socio-demo' THEN sdq.language_id
      WHEN m.type = 'feedback'   THEN fqt.language_id
    END
  ) AS language_count,
  COALESCE(
    json_agg(
      DISTINCT jsonb_build_object('id', c.id, 'language', c.language)
    ) FILTER (WHERE c.id IS NOT NULL),
    '[]'::json
  ) AS languages
FROM euonqol.modules_questions mq
JOIN euonqol.modules m ON m.id = mq.module_id
LEFT JOIN euonqol.static_questions sq
  ON sq.question_id = mq.question_id AND m.type = 'static'
LEFT JOIN euonqol.cat_questions cq
  ON cq.question_id = mq.question_id AND m.type = 'dynamic'
LEFT JOIN euonqol.socio_demo_questions sdq
  ON sdq.question_id = mq.question_id AND m.type = 'socio-demo'
LEFT JOIN euonqol.feedback_question_translations fqt
  ON fqt.question_id = mq.question_id AND m.type = 'feedback'
LEFT JOIN euonqol.eu_countries c ON c.id = CASE
  WHEN m.type = 'static'     THEN sq.language_id
  WHEN m.type = 'dynamic'    THEN cq.language_id
  WHEN m.type = 'socio-demo' THEN sdq.language_id
  WHEN m.type = 'feedback'   THEN fqt.language_id
END
WHERE mq.is_active = true
GROUP BY mq.module_id;
