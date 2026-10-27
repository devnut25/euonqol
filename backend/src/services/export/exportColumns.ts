/**
 * Column catalogue for the survey long-format export.
 *
 * Headers, the frontend's group checkboxes and the row builder all derive from
 * this single ordered array, so they cannot drift apart. The order here is the
 * order of the columns in the produced file.
 *
 * `survey_id` / `survey_name` are deliberately absent: that information lives in
 * the file name.
 */

export type ColumnGroup = 'patient' | 'questionnaire' | 'question' | 'answer' | 'score';

export interface ExportColumn {
  key: string;
  header: string;
  group: ColumnGroup;
  /** Written as a number rather than text, so stats tools read a numeric column. */
  numeric?: boolean;
  /** What the column means, for the Columns sheet of the workbook. */
  description: string;
}

export const EXPORT_COLUMNS: ExportColumn[] = [
  // Patient — patient_code first, it is the column analysts scan by.
  {
    key: 'patient_code',
    header: 'Patient code',
    group: 'patient',
    description:
      "Patient identifier. Anonymous respondents appear as ANON_<number>, where the number is the platform's internal patient id: it follows the order in which the patient was created (at invitation for anonymous-on-invitation surveys, when the questionnaire is started for spontaneous ones), not the completion order. Gaps belong to patients of other surveys.",
  },
  {
    key: 'is_anonymous',
    header: 'Is anonymous',
    group: 'patient',
    description: 'Yes if the respondent is anonymous, No otherwise.',
  },
  {
    key: 'access_mode',
    header: 'Access mode',
    group: 'patient',
    description:
      'How the questionnaire was administered: Traced, Anonymous On Invitation or Anonymous Spontaneous.',
  },
  {
    key: 'patient_group',
    header: 'Patient group',
    group: 'patient',
    description: 'Patient group the questionnaire is meant for.',
  },
  {
    key: 'completion_status',
    header: 'Completion status',
    group: 'patient',
    description:
      'State of this questionnaire for the patient: Completed (submitted), Pending (started, not submitted yet) or, for anonymous spontaneous access, Not completed (started and not submitted: an abandoned questionnaire cannot be resumed). Questionnaires not started have no answers and do not appear in this sheet. Anonymous-on-invitation surveys only export completed questionnaires: the others still belong to a patient not yet anonymized.',
  },
  {
    key: 'response_language',
    header: 'Response language',
    group: 'patient',
    description: 'Language the answer was given in.',
  },

  // Questionnaire
  {
    key: 'questionnaire_title',
    header: 'Questionnaire title',
    group: 'questionnaire',
    description: 'Title of the questionnaire the answer belongs to.',
  },

  // Module & question
  {
    key: 'module_name',
    header: 'Module name',
    group: 'question',
    description:
      'Module of the questionnaire the question belongs to. Empty if the question is no longer part of the questionnaire.',
  },
  {
    key: 'module_type',
    header: 'Module type',
    group: 'question',
    description:
      'Type of that module: Static, Dynamic (adaptive), Additional Information (socio-demographic) or Feedback.',
  },
  {
    key: 'question_code',
    header: 'Question code',
    group: 'question',
    description: 'Code identifying the question in the kit.',
  },
  {
    key: 'question_kind',
    header: 'Question type',
    group: 'question',
    description:
      'Type of the question itself: Static, Dynamic (adaptive item), Additional Information (socio-demographic) or Feedback.',
  },
  {
    key: 'question_text_en',
    header: 'Question text (EN)',
    group: 'question',
    description: 'Question wording in English, whatever language it was answered in.',
  },
  // Full name, then the canonical short code (`PF`), whatever spelling the
  // question itself stores (`PF_S`, `Physical functioning`).
  {
    key: 'scale_name',
    header: 'Scale name',
    group: 'question',
    description:
      'Full name of the scale the question measures. Empty for unscored questions, such as socio-demographic and feedback ones.',
  },
  {
    key: 'scale_code',
    header: 'Scale code',
    group: 'question',
    description:
      'Short code of that scale, e.g. PF for Physical functioning. Empty for socio-demographic and feedback questions.',
  },
  {
    key: 'score_system',
    header: 'Score system',
    group: 'question',
    description:
      'Scoring system of the question: CTT or IRT. Adaptive (CAT) questions are always IRT. Empty for socio-demographic and feedback questions.',
  },

  // Answer
  {
    key: 'answer_value',
    header: 'Answer value',
    group: 'answer',
    numeric: true,
    description:
      'Numeric value of the chosen option. Negative values are skips: -1 skipped by the patient, -2 skipped by the system (question not shown). Socio-demographic and feedback options have no numeric value, so only their skips have one. Empty for disclaimers.',
  },
  {
    key: 'answer_label_en',
    header: 'Answer label (EN)',
    group: 'answer',
    description:
      'Wording of the chosen option in English, or Skipped by patient / Skipped by system for a skipped question. Multiple-choice answers list every selected option, separated by "; ". Empty for disclaimers, which have nothing to answer.',
  },
  {
    key: 'answer_text',
    header: 'Answer text',
    group: 'answer',
    description:
      'Only text typed by the respondent: the answer to an open question, or the text attached to an "Other, please specify" option.',
  },

  // Score — the CTT/IRT distinction is already carried by `score_system` above.
  // Only computed scores are written (see scoreResolver), so no status column.
  {
    key: 'score',
    header: 'Score',
    group: 'score',
    numeric: true,
    description:
      "The patient's score on the question's scale (T-score for CTT, IRT score for IRT), repeated on every question of that scale. Empty when it could not be computed, and for socio-demographic and feedback questions.",
  },

  {
    key: 'question_order',
    header: 'Question order',
    group: 'answer',
    numeric: true,
    description:
      'Position of the answer in the order the patient gave them: 1, 2, 3… within each questionnaire. Orders answers saved within the same instant too.',
  },

  // Date-times last, by request. The first three are per answer — the view time
  // is inferred, not recorded, see questionViewTime.ts. The last one is per
  // questionnaire and belongs to the patient group in the column picker. All in
  // UTC, to the millisecond.
  {
    key: 'question_viewed_at',
    header: 'Question viewed at',
    group: 'answer',
    description:
      'When the question was shown. Estimated, not recorded: the moment the previous answer was saved, or when the session opened for the first question. Off when the patient went back to change answers.',
  },
  {
    key: 'answered_at',
    header: 'Answered at',
    group: 'answer',
    description: 'When the answer was first saved.',
  },
  {
    key: 'answer_updated_at',
    header: 'Answer last saved at',
    group: 'answer',
    description:
      'When the answer was last saved. Also changes when the patient confirms it again without changing it.',
  },
  {
    key: 'completed_at',
    header: 'Questionnaire completed at',
    group: 'patient',
    description:
      'When the patient submitted the questionnaire. The same on every row of it; empty while in progress or not completed (questionnaires not started do not appear in this sheet).',
  },
];

export const COLUMN_GROUPS: ColumnGroup[] = [
  'patient',
  'questionnaire',
  'question',
  'answer',
  'score',
];

const COLUMN_BY_KEY = new Map(EXPORT_COLUMNS.map((c) => [c.key, c]));

export type ExportRow = Record<string, string | number | null>;

export class UnknownColumnError extends Error {
  constructor(public readonly unknownKeys: string[]) {
    super(`Unknown column(s): ${unknownKeys.join(', ')}`);
    this.name = 'UnknownColumnError';
  }
}

/**
 * Turns the `columns` query parameter into the ordered column list to emit.
 *
 * An absent or blank parameter selects every column. Unknown keys are rejected
 * rather than ignored, so a typo surfaces as a 400 instead of a silently missing
 * column. The file order always follows {@link EXPORT_COLUMNS}, never the order
 * the caller happened to list them in.
 */
export function resolveColumns(param: string | undefined): ExportColumn[] {
  if (!param || !param.trim()) return EXPORT_COLUMNS;

  const requested = param
    .split(',')
    .map((k) => k.trim())
    .filter(Boolean);

  if (requested.length === 0) return EXPORT_COLUMNS;

  const unknown = requested.filter((k) => !COLUMN_BY_KEY.has(k));
  if (unknown.length > 0) throw new UnknownColumnError(unknown);

  const selected = new Set(requested);
  return EXPORT_COLUMNS.filter((c) => selected.has(c.key));
}
