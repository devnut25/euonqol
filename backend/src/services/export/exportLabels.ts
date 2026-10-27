/**
 * The words the export shows for values stored as codes in the database, the
 * same the admin UI shows for them (frontend-shadcn/src/locales/en/valueEnum.json):
 * a file read next to the dashboard must not speak another vocabulary.
 *
 * A code with no label here is written as it is, so a new value shows up in the
 * file rather than as an empty cell.
 */

export const ACCESS_MODE_LABELS: Record<string, string> = {
  traced: 'Traced',
  anonymous_on_invitation: 'Anonymous On Invitation',
  anonymous_spontaneous: 'Anonymous Spontaneous',
};

/** A survey's or questionnaire's status column. */
export const LIFECYCLE_STATUS_LABELS: Record<string, string> = {
  draft: 'Draft',
  public: 'Public',
  disabled: 'Disabled',
  completed: 'Completed',
};

/**
 * A patient assignment's progress. Started and not submitted reads "Pending",
 * as on the dashboard; on an anonymous spontaneous survey it is "Not completed",
 * since an abandoned questionnaire there cannot be resumed.
 */
export const COMPLETION_STATUS_LABELS: Record<string, string> = {
  completed: 'Completed',
  in_progress: 'Pending',
  not_completed: 'Not completed',
  pending: 'Not started',
};

export const MODULE_TYPE_LABELS: Record<string, string> = {
  static: 'Static',
  dynamic: 'Dynamic',
  'socio-demo': 'Additional Information',
  feedback: 'Feedback',
};

/** A question's kind: an adaptive (`cat`) item is a Dynamic one, as in the kit. */
export const QUESTION_KIND_LABELS: Record<string, string> = {
  static: 'Static',
  cat: 'Dynamic',
  'socio-demo': 'Additional Information',
  feedback: 'Feedback',
};

/** The label of `code` in `labels`, or the code itself when it has none. */
export function labelOf(labels: Record<string, string>, code: string | null | undefined): string {
  if (!code) return '';
  return labels[code] ?? code;
}

export const yesNo = (value: boolean) => (value ? 'Yes' : 'No');
