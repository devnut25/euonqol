import { X } from 'lucide-react';
import { ACCESS_MODE_OPTIONS, LIFECYCLE_OPTIONS, STATUS_OPTIONS } from './downloadFilters';
import {
  changedFields,
  DEFAULT_FILTERS,
  type FilterState,
  type GroupOption,
  type SurveyOption,
} from './filterState';
import { SurveyName } from './SurveyBadges';

const FIELD_LABELS: Record<keyof FilterState, string> = {
  surveyStatus: 'Survey status',
  questionnaireStatus: 'Questionnaire status',
  completionStatus: 'Assignment status',
  surveyId: 'Survey',
  questionnaireId: 'Questionnaire',
  groupId: 'Group',
  accessMode: 'Access mode',
  dateFrom: 'From',
  dateTo: 'To',
};

/** `DD/MM/YYYY`, the way dates read elsewhere in the dashboard. */
function formatDay(iso: string): string {
  const [y, m, d] = iso.split('-');
  return y && m && d ? `${d}/${m}/${y}` : iso;
}

/**
 * The filters currently applied, one removable chip each. Only the ones that
 * differ from the defaults are listed: the last six months and every status are
 * what the dashboard shows with nothing applied.
 */
export function AppliedFilters({
  applied,
  surveys,
  groups,
  onChange,
  layout = 'column',
}: {
  applied: FilterState;
  surveys: SurveyOption[];
  groups: GroupOption[];
  onChange: (next: FilterState) => void;
  /** A column in the side panel, a wrapping row above the tabs on small screens. */
  layout?: 'column' | 'row';
}) {
  const fields = changedFields(applied);
  const survey = surveys.find((s) => String(s.id) === applied.surveyId);

  const value = (field: keyof FilterState): React.ReactNode => {
    const raw = applied[field];
    switch (field) {
      case 'surveyId':
        return survey ? <SurveyName survey={survey} /> : `#${raw}`;
      case 'questionnaireId':
        return survey?.questionnaires.find((q) => String(q.id) === raw)?.title ?? `#${raw}`;
      case 'groupId':
        return groups.find((g) => String(g.id) === raw)?.name ?? `#${raw}`;
      case 'accessMode':
        return ACCESS_MODE_OPTIONS.find((o) => o.value === raw)?.label ?? raw;
      case 'dateFrom':
      case 'dateTo':
        return formatDay(raw);
      case 'completionStatus':
        return STATUS_OPTIONS.find((o) => o.value === raw)?.label ?? raw;
      default:
        return LIFECYCLE_OPTIONS.find((o) => o.value === raw)?.label ?? raw;
    }
  };

  /** Back to the default; a survey takes its questionnaire with it. */
  const remove = (field: keyof FilterState) =>
    onChange({
      ...applied,
      [field]: DEFAULT_FILTERS[field],
      ...(field === 'surveyId' ? { questionnaireId: '' } : {}),
    });

  if (fields.length === 0) {
    return (
      <p className="text-xs text-muted-foreground">
        No filters applied: the last six months, every status.
      </p>
    );
  }

  return (
    <ul
      aria-label="Applied filters"
      className={layout === 'row' ? 'flex flex-wrap gap-2' : 'flex flex-col gap-2'}
    >
      {fields.map((field) => (
        <li
          key={field}
          className="flex min-w-0 items-start gap-1 rounded-lg border bg-card px-2.5 py-1.5 text-xs shadow-sm"
        >
          <div className="flex min-w-0 flex-1 flex-col">
            <span className="text-[11px] text-muted-foreground">{FIELD_LABELS[field]}</span>
            <span className="min-w-0 break-words font-medium text-foreground">{value(field)}</span>
          </div>
          <button
            type="button"
            onClick={() => remove(field)}
            aria-label={`Remove filter ${FIELD_LABELS[field]}`}
            title="Remove filter"
            className="-mr-1 inline-flex size-6 shrink-0 cursor-pointer items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            <X className="size-3.5" aria-hidden="true" />
          </button>
        </li>
      ))}
    </ul>
  );
}
