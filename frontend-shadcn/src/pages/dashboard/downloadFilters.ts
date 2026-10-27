import { useMemo } from 'react';

/** Access modes a survey can have, as offered by the dock and the export dialog. */
export const ACCESS_MODE_OPTIONS = [
  { label: 'TRACED', value: 'traced' },
  { label: 'ANONYMOUS ON INVITATION', value: 'anonymous_on_invitation' },
  { label: 'ANONYMOUS SPONTANEOUS', value: 'anonymous_spontaneous' },
];

/**
 * The patient assignment's status filter. `in_progress` (started, not submitted
 * yet) reads "Pending", as assignments not completed do on the participants
 * page. The backend mapping lives in `backend/src/helpers/statusFilters.ts`.
 */
export type StatusFilter = 'completed' | 'in_progress' | 'all';

/**
 * A survey's or questionnaire's status filter: the values of their status
 * column. Drafts never match, as they hold no data yet.
 */
export type LifecycleFilter = 'public' | 'disabled' | 'completed' | 'all';

/** "All", the default at every level. */
export const DEFAULT_STATUS = 'all' as const;

export const STATUS_OPTIONS: { label: string; value: StatusFilter }[] = [
  { label: 'All', value: 'all' },
  { label: 'Completed', value: 'completed' },
  { label: 'Pending', value: 'in_progress' },
];

export const LIFECYCLE_OPTIONS: { label: string; value: LifecycleFilter }[] = [
  { label: 'All', value: 'all' },
  { label: 'Completed', value: 'completed' },
  { label: 'Public', value: 'public' },
  { label: 'Disabled', value: 'disabled' },
];

/** Whether a survey or questionnaire `status` passes the filter. */
export function matchesLifecycle(status: string, filter: LifecycleFilter): boolean {
  if (filter === 'all')
    return status === 'public' || status === 'disabled' || status === 'completed';
  return status === filter;
}

/**
 * What the counted assignments are called in KPI labels and table headers, so
 * a figure never reads "Completions" while pending ones are in it.
 */
export const RESPONSES_LABEL: Record<StatusFilter, string> = {
  completed: 'Completed',
  in_progress: 'Pending',
  all: 'Completed + pending',
};

/** Dashboard dock filters, shared by every dashboard tab and the survey export. */
export interface Filters {
  surveyId?: number;
  questionnaireId?: number;
  groupId?: number;
  accessMode?: string;
  dateFrom?: string;
  dateTo?: string;
  surveyStatus?: LifecycleFilter;
  questionnaireStatus?: LifecycleFilter;
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
