import { useMemo } from 'react';

/** Access modes a survey can have, as offered by the dock and the export dialog. */
export const ACCESS_MODE_OPTIONS = [
  { label: 'TRACED', value: 'traced' },
  { label: 'ANONYMOUS ON INVITATION', value: 'anonymous_on_invitation' },
  { label: 'ANONYMOUS SPONTANEOUS', value: 'anonymous_spontaneous' },
];

/**
 * One status filter value, used at three levels: survey, questionnaire and
 * patient assignment. For surveys and questionnaires "in progress" means
 * started and not closed (public or paused); drafts never match. The backend
 * mapping lives in `backend/src/helpers/statusFilters.ts`.
 */
export type StatusFilter = 'completed' | 'in_progress' | 'all';

export const DEFAULT_STATUS: StatusFilter = 'all';

export const STATUS_OPTIONS: { label: string; value: StatusFilter }[] = [
  { label: 'All', value: 'all' },
  { label: 'Completed', value: 'completed' },
  { label: 'In progress', value: 'in_progress' },
];

/** Whether a survey or questionnaire `status` passes the filter. */
export function matchesLifecycle(status: string, filter: StatusFilter): boolean {
  if (filter === 'completed') return status === 'completed';
  if (filter === 'in_progress') return status === 'public' || status === 'disabled';
  return status === 'public' || status === 'disabled' || status === 'completed';
}

/**
 * What the counted assignments are called in KPI labels and table headers, so
 * a figure never reads "Completions" while in-progress ones are in it.
 */
export const RESPONSES_LABEL: Record<StatusFilter, string> = {
  completed: 'Completed',
  in_progress: 'In progress',
  all: 'Completed + in progress',
};

/** Dashboard dock filters, shared by every dashboard tab and the survey export. */
export interface Filters {
  surveyId?: number;
  questionnaireId?: number;
  groupId?: number;
  accessMode?: string;
  dateFrom?: string;
  dateTo?: string;
  surveyStatus?: StatusFilter;
  questionnaireStatus?: StatusFilter;
  /** Status of the patient assignment. */
  completionStatus?: StatusFilter;
}

/** Serialises the dock filters into query params, omitting the empty ones. */
export function filtersToParams(filters: Filters): Record<string, string> {
  const p: Record<string, string> = {};
  if (filters.surveyId) p.surveyId = String(filters.surveyId);
  if (filters.questionnaireId) p.questionnaireId = String(filters.questionnaireId);
  if (filters.groupId) p.groupId = String(filters.groupId);
  if (filters.accessMode) p.accessMode = filters.accessMode;
  if (filters.dateFrom) p.dateFrom = filters.dateFrom;
  if (filters.dateTo) p.dateTo = filters.dateTo;
  p.surveyStatus = filters.surveyStatus ?? DEFAULT_STATUS;
  p.questionnaireStatus = filters.questionnaireStatus ?? DEFAULT_STATUS;
  p.completionStatus = filters.completionStatus ?? DEFAULT_STATUS;
  return p;
}

/**
 * The filters as query params, as a value that only changes when one of them
 * does. The dock rebuilds the `filters` object on every render, so depending on
 * it directly would refetch continuously.
 */
export function useFilterParams(filters: Filters): Record<string, string> {
  const key = JSON.stringify(filtersToParams(filters));
  return useMemo(() => JSON.parse(key) as Record<string, string>, [key]);
}
