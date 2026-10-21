/**
 * Column catalogue for the survey long-format export.
 *
 * Mirrors `backend/src/services/export/exportColumns.ts` — the backend validates
 * the keys it receives and rejects unknown ones with a 400, so a drift between
 * the two lists surfaces immediately rather than silently dropping a column.
 */

export type ColumnGroup = 'patient' | 'questionnaire' | 'question' | 'answer' | 'score';

export interface ExportColumn {
  key: string;
  label: string;
  group: ColumnGroup;
}

export const EXPORT_COLUMNS: ExportColumn[] = [
  { key: 'patient_code', label: 'Patient code', group: 'patient' },
  { key: 'is_anonymous', label: 'Is anonymous', group: 'patient' },
  { key: 'access_mode', label: 'Access mode', group: 'patient' },
  { key: 'patient_group', label: 'Patient group', group: 'patient' },
  { key: 'completion_status', label: 'Completion status', group: 'patient' },
  { key: 'response_language', label: 'Response language', group: 'patient' },

  { key: 'questionnaire_title', label: 'Questionnaire title', group: 'questionnaire' },

  { key: 'module_name', label: 'Module name', group: 'question' },
  { key: 'module_type', label: 'Module type', group: 'question' },
  { key: 'question_code', label: 'Question code', group: 'question' },
  { key: 'question_kind', label: 'Question type', group: 'question' },
  { key: 'question_text_en', label: 'Question text (EN)', group: 'question' },
  { key: 'scale_name', label: 'Scale name', group: 'question' },
  { key: 'scale_code', label: 'Scale code', group: 'question' },
  { key: 'score_system', label: 'Score system', group: 'question' },

  { key: 'answer_value', label: 'Answer value', group: 'answer' },
  { key: 'answer_label_en', label: 'Answer label (EN)', group: 'answer' },
  { key: 'answer_text', label: 'Answer text', group: 'answer' },

  { key: 'score', label: 'Score', group: 'score' },

  { key: 'question_order', label: 'Question order', group: 'answer' },

  // Date-times last in the produced file; the questionnaire one belongs to the
  // patient group here.
  { key: 'question_viewed_at', label: 'Question viewed at', group: 'answer' },
  { key: 'answered_at', label: 'Answered at', group: 'answer' },
  { key: 'answer_updated_at', label: 'Answer last saved at', group: 'answer' },
  { key: 'completed_at', label: 'Questionnaire completed at', group: 'patient' },
];

export const COLUMN_GROUP_LABELS: Record<ColumnGroup, string> = {
  patient: 'Patient',
  questionnaire: 'Questionnaire',
  question: 'Module & question',
  answer: 'Answer',
  score: 'Score',
};

export const COLUMN_GROUPS: ColumnGroup[] = [
  'patient',
  'questionnaire',
  'question',
  'answer',
  'score',
];

export const ALL_COLUMN_KEYS = EXPORT_COLUMNS.map((c) => c.key);
