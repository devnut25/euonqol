import { ServiceError } from './ServiceError.js';

export type SurveyStatus = 'draft' | 'public' | 'disabled' | 'completed';
export type QuestionnaireStatus = 'draft' | 'public' | 'disabled' | 'completed';

/** Transitions a human can request via PATCH/PUT (status in the request body). */
export const MANUAL_SURVEY_TRANSITIONS: Record<SurveyStatus, SurveyStatus[]> = {
  draft: [], // draft->public only via SurveyService.publish()
  public: ['disabled'],
  disabled: ['public'],
  completed: [], // terminal
};

export const MANUAL_QUESTIONNAIRE_TRANSITIONS: Record<QuestionnaireStatus, QuestionnaireStatus[]> = {
  draft: [], // draft->public is always automatic (assignment-driven)
  public: ['disabled'],
  disabled: ['public'], // subject to extra conditions checked by the caller
  completed: [], // terminal
};

/** Throws unless `from -> to` is an allowed manual transition (or a no-op). */
export function assertManualTransition(
  entity: 'survey' | 'questionnaire',
  from: string,
  to: string
): void {
  if (from === to) return;
  const table = entity === 'survey' ? MANUAL_SURVEY_TRANSITIONS : MANUAL_QUESTIONNAIRE_TRANSITIONS;
  const allowed = table[from as SurveyStatus] ?? [];
  if (!allowed.includes(to as SurveyStatus)) {
    throw new ServiceError(`Cannot transition ${entity} status from '${from}' to '${to}'`, 409);
  }
}
