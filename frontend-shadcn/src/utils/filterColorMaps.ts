import {
  STATUS_DOT_STYLES as SURVEY_STATUS_DOT_STYLES,
  STATUS_STYLES as SURVEY_STATUS_STYLES,
} from '@/containers/survey/_components/status-badge';

export interface FilterColorMap {
  colorMap?: Record<string, string>;
  dotColorMap?: Record<string, string>;
}

/**
 * Registry: valueEnum key -> color maps used by select/multi-select filters.
 * Add an entry here when a new filterEnum needs colored options/dots —
 * no changes needed in data-table-filters.tsx.
 */
export const FILTER_COLOR_MAPS: Record<string, FilterColorMap> = {
  surveyStatus: {
    colorMap: SURVEY_STATUS_STYLES,
    dotColorMap: SURVEY_STATUS_DOT_STYLES,
  },
};
