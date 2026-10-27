import type { DevnutSelectOption } from '@/components/DevnutSelect';
import { STATUS_DOT_STYLES } from '@/containers/survey/_components/status-badge';
import type { SurveyOption } from './filterState';

/**
 * Survey names alone are ambiguous: duplicated surveys keep the same name. The
 * picker lists them as a small table — name, access mode, status in aligned
 * columns — so the eye reads down a column instead of across coloured badges.
 */

const ACCESS_MODE_LABELS: Record<string, string> = {
  traced: 'Traced',
  anonymous_on_invitation: 'On invitation',
  anonymous_spontaneous: 'Spontaneous',
};

const STATUS_LABELS: Record<string, string> = {
  draft: 'Draft',
  public: 'Public',
  disabled: 'Disabled',
  completed: 'Completed',
};

/** The picker's columns, shared by its header and its rows so they line up. */
const COLUMNS = 'grid w-full grid-cols-[minmax(0,1fr)_6rem_5.5rem] items-baseline gap-3';

export function accessModeLabel(mode: string | null | undefined): string {
  return mode ? (ACCESS_MODE_LABELS[mode] ?? mode) : '';
}

export function surveyStatusLabel(status: string): string {
  return STATUS_LABELS[status] ?? status;
}

function StatusDot({ status }: { status: string }) {
  return (
    <span
      className={`inline-block size-2 shrink-0 rounded-full ${
        STATUS_DOT_STYLES[status] ?? 'bg-gray-400'
      }`}
      aria-hidden="true"
    />
  );
}

/** The survey's name, with its access mode and status on a muted line below. */
export function SurveyName({ survey }: { survey: SurveyOption }) {
  return (
    <span className="flex min-w-0 flex-col">
      {/* Wraps rather than being cut: names differ mostly at the end. */}
      <span className="whitespace-normal break-words">{survey.name}</span>
      <span className="flex items-center gap-1.5 text-xs font-normal text-muted-foreground">
        {survey.accessMode && (
          <>
            <span>{accessModeLabel(survey.accessMode)}</span>
            <span aria-hidden="true">·</span>
          </>
        )}
        <StatusDot status={survey.status} />
        <span>{surveyStatusLabel(survey.status)}</span>
      </span>
    </span>
  );
}

/**
 * Column titles above the picker's rows. Indented by the width of the check
 * mark each row starts with, so the titles sit over their columns.
 */
export function SurveyListHeader() {
  return (
    <div
      className={`${COLUMNS} py-1.5 pl-9 pr-3 text-[11px] font-medium uppercase tracking-wide text-muted-foreground`}
    >
      <span>Name</span>
      <span>Access</span>
      <span>Status</span>
    </div>
  );
}

/** One row of the picker: name, access mode and status in their columns. */
function SurveyOptionRow({ survey }: { survey: SurveyOption }) {
  return (
    <span className={COLUMNS}>
      <span className="min-w-0 whitespace-normal break-words">{survey.name}</span>
      <span className="text-xs text-muted-foreground">{accessModeLabel(survey.accessMode)}</span>
      <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <StatusDot status={survey.status} />
        {surveyStatusLabel(survey.status)}
      </span>
    </span>
  );
}

/** Survey options for a select, searchable by name, access mode and status. */
export function surveySelectOptions(surveys: SurveyOption[]): DevnutSelectOption[] {
  return surveys.map((s) => ({
    value: String(s.id),
    label: <SurveyOptionRow survey={s} />,
    // Once picked, the trigger only has room for the name.
    selectedLabel: s.name,
    textLabel: [s.name, accessModeLabel(s.accessMode), surveyStatusLabel(s.status)]
      .filter(Boolean)
      .join(' · '),
  }));
}
