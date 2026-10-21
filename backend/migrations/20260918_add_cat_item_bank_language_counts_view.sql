-- Mirrors euonqol.module_language_counts (20260629_add_module_language_counts_view.sql)
-- for CAT item banks: distinct languages present among a bank's CAT items.
CREATE OR REPLACE VIEW euonqol.cat_item_bank_language_counts AS
SELECT
  q.cat_item_bank_id,
  COUNT(DISTINCT cq.language_id) AS language_count,
  COALESCE(
    json_agg(DISTINCT jsonb_build_object('id', c.id, 'language', c.language))
      FILTER (WHERE c.id IS NOT NULL),
    '[]'::json
  ) AS languages
FROM euonqol.questions q
JOIN euonqol.cat_questions cq ON cq.question_id = q.id
JOIN euonqol.eu_countries c ON c.id = cq.language_id
WHERE q.cat_item_bank_id IS NOT NULL
GROUP BY q.cat_item_bank_id;
