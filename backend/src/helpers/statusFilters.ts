/**
 * The dashboard dock's status filters, shared by every dashboard endpoint and
 * the survey export so they all count the same things.
 *
 * There are three, one per level, and each takes the same three values:
 *
 *   surveyStatus         the survey's lifecycle
 *   questionnaireStatus  the questionnaire's lifecycle
 *   completionStatus     the patient assignment's progress
 *
 * `completed` / `in_progress` / `all` mean the same thing at every level, but
 * map onto different columns: see {@link lifecycleStatuses} and
 * {@link completionWhere}.
 */

export type StatusFilter = 'completed' | 'in_progress' | 'all';

export const DEFAULT_STATUS_FILTER: StatusFilter = 'all';

export interface StatusFilters {
  survey: StatusFilter;
  questionnaire: StatusFilter;
  completion: StatusFilter;
}

export interface DateRange {
  gte?: Date;
  lte?: Date;
}

/** Reads one filter param, falling back to the default (all) for anything else. */
export function parseStatusFilter(value: unknown): StatusFilter {
  return value === 'completed' || value === 'in_progress' || value === 'all'
    ? value
    : DEFAULT_STATUS_FILTER;
}

/** Reads all three filters off a request's query string. */
export function readStatusFilters(query: Record<string, unknown>): StatusFilters {
  return {
    survey: parseStatusFilter(query.surveyStatus),
    questionnaire: parseStatusFilter(query.questionnaireStatus),
    completion: parseStatusFilter(query.completionStatus),
  };
}

/**
 * `status` values of a survey or questionnaire matching the filter.
 *
 * In progress means started and not closed, so a paused (`disabled`) one
 * counts. `draft` never matches: nothing has been collected yet.
 */
export function lifecycleStatuses(filter: StatusFilter): string[] {
  if (filter === 'completed') return ['completed'];
  if (filter === 'in_progress') return ['public', 'disabled'];
  return ['public', 'disabled', 'completed'];
}

/** `where` fragment on a survey or questionnaire row. */
export function lifecycleWhere(filter: StatusFilter): { status: { in: string[] } } {
  return { status: { in: lifecycleStatuses(filter) } };
}

/**
 * `where` fragment on a questionnaire: its lifecycle status and, when given, the
 * dock's patient group.
 *
 * The group is read off the questionnaire, which targets exactly one group, not
 * off the patient: `patients.group_id` is only a copy of it, written at
 * creation, and patients created before every path wrote it have none.
 */
export function questionnaireScope(
  filter: StatusFilter,
  groupId?: number
): { status: { in: string[] }; patient_group_id?: number } {
  return {
    ...lifecycleWhere(filter),
    ...(groupId && Number.isFinite(groupId) ? { patient_group_id: groupId } : {}),
  };
}

/**
 * Turns the dock's `dateFrom` / `dateTo` strings into a Prisma range, or
 * undefined when neither is set. The upper bound is pushed to end of day so
 * answers given on the selected day are included.
 */
export function buildDateRange(dateFrom?: string, dateTo?: string): DateRange | undefined {
  if (!dateFrom && !dateTo) return undefined;
  const range: DateRange = {};
  if (dateFrom) range.gte = new Date(dateFrom);
  if (dateTo) {
    const to = new Date(dateTo);
    to.setHours(23, 59, 59, 999);
    range.lte = to;
  }
  return range;
}

/**
 * Assignment `where` fragment for the chosen completion status and date range.
 *
 * `completed_at` only exists once a questionnaire is finished, so in-progress
 * ones are placed on the timeline by their last activity (`updated_at`) instead;
 * filtering both on `completed_at` would silently drop every unfinished one.
 *
 * The `all` case returns a top-level `OR`: spread it into a where that has no
 * `OR` of its own.
 */
export function completionWhere(
  filter: StatusFilter,
  dateRange?: DateRange
): Record<string, unknown> {
  const completed = {
    completion_status: 'completed',
    ...(dateRange ? { completed_at: dateRange } : {}),
  };
  const inProgress = {
    completion_status: 'in_progress',
    ...(dateRange ? { updated_at: dateRange } : {}),
  };

  if (filter === 'completed') return completed;
  if (filter === 'in_progress') return inProgress;
  return { OR: [completed, inProgress] };
}
