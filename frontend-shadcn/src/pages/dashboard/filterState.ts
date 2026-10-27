import {
  DEFAULT_STATUS,
  type Filters,
  type LifecycleFilter,
  type StatusFilter,
} from './downloadFilters';

/**
 * The dashboard filters as the filters dialog edits them and the side column
 * lists them: every field a plain value, '' meaning "no restriction".
 */
export interface FilterState {
  surveyId: string;
  questionnaireId: string;
  groupId: string;
  accessMode: string;
  dateFrom: string;
  dateTo: string;
  surveyStatus: LifecycleFilter;
  questionnaireStatus: LifecycleFilter;
  completionStatus: StatusFilter;
}

/** A survey as the filters offer it. */
export interface SurveyOption {
  id: number;
  name: string;
  status: string;
  accessMode: string | null;
  questionnaires: {
    id: number;
    title: string;
    status: string;
    /** The patient group the questionnaire targets. */
    patientGroupId: number | null;
  }[];
}

export interface GroupOption {
  id: number;
  name: string;
}

/** The last six months, the window every tab opens on. */
export const DEFAULT_DATE_FROM = (() => {
  const d = new Date();
  d.setMonth(d.getMonth() - 6);
  return d.toISOString().split('T')[0];
})();

export const DEFAULT_DATE_TO = new Date().toISOString().split('T')[0];

/** In the order the filters are listed: the status switches lead, as in the dialog. */
export const DEFAULT_FILTERS: FilterState = {
  surveyStatus: DEFAULT_STATUS,
  questionnaireStatus: DEFAULT_STATUS,
  completionStatus: DEFAULT_STATUS,
  surveyId: '',
  questionnaireId: '',
  groupId: '',
  accessMode: '',
  dateFrom: DEFAULT_DATE_FROM,
  dateTo: DEFAULT_DATE_TO,
};

/** The filters in the shape the tabs and the API read. */
export function toFilters(state: FilterState): Filters {
  return {
    surveyId: state.surveyId ? parseInt(state.surveyId) : undefined,
    questionnaireId: state.questionnaireId ? parseInt(state.questionnaireId) : undefined,
    groupId: state.groupId ? parseInt(state.groupId) : undefined,
    accessMode: state.accessMode || undefined,
    dateFrom: state.dateFrom || undefined,
    dateTo: state.dateTo || undefined,
    surveyStatus: state.surveyStatus,
    questionnaireStatus: state.questionnaireStatus,
    completionStatus: state.completionStatus,
  };
}

/** The fields that differ from their defaults: the filters actually applied. */
export function changedFields(state: FilterState): (keyof FilterState)[] {
  return (Object.keys(DEFAULT_FILTERS) as (keyof FilterState)[]).filter(
    (key) => state[key] !== DEFAULT_FILTERS[key]
  );
}
