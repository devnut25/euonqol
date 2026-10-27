import { DevnutButton } from '@/components/DevnutButton';
import { DevnutSelect } from '@/components/DevnutSelect';
import { SectionInfoModal } from '@/components/SectionInfoModal';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useState } from 'react';
import { ACCESS_MODE_OPTIONS, LIFECYCLE_OPTIONS, matchesLifecycle } from './downloadFilters';
import {
  DEFAULT_FILTERS,
  type FilterState,
  type GroupOption,
  type SurveyOption,
} from './filterState';
import { StatusToggle } from './StatusToggle';
import { SurveyListHeader, surveySelectOptions } from './SurveyBadges';

/** What the status switches do, shown behind the info icon. */
const STATUS_FILTER_INFO = [
  {
    heading: 'Survey status',
    description:
      'The survey status column: Public for running surveys, Disabled for paused ones, Completed for closed ones. All: the three of them. Surveys still in draft are never shown, as they hold no data yet.',
  },
  {
    heading: 'Questionnaire status',
    description: 'Same values, read off the status column of the questionnaires of each survey.',
  },
  {
    heading: 'Assignment status',
    description:
      'Completed: questionnaires a patient has submitted, placed in the date range by their submission date. Pending: started but not submitted yet, placed by their last activity. Assignments nobody has started are never counted.',
  },
  {
    heading: 'How they combine',
    description:
      'The rows apply together, from the top: each status narrows the list beside it, and a picked survey narrows the questionnaires, groups and access modes offered below it. A survey or questionnaire you pick is not filtered again by its own status, so the Scores tab and the export only apply the levels below it.',
  },
];

/**
 * The patient groups a survey targets (or only its picked questionnaire), or
 * null when no survey is picked and every group is on offer.
 */
function groupsOf(
  survey: SurveyOption | undefined,
  draft: Pick<FilterState, 'questionnaireId' | 'questionnaireStatus'>
): Set<number> | null {
  if (!survey) return null;
  const questionnaires = draft.questionnaireId
    ? survey.questionnaires.filter((q) => String(q.id) === draft.questionnaireId)
    : survey.questionnaires.filter((q) => matchesLifecycle(q.status, draft.questionnaireStatus));
  return new Set(
    questionnaires.map((q) => q.patientGroupId).filter((id): id is number => id != null)
  );
}

/**
 * The "everything" choice of a list, naming the status picked beside it: with
 * Completed on, "All surveys" would read as more than the list offers. When the
 * list is empty it says so instead, on a field that is then disabled.
 */
function allLabel(noun: string, count: number, status = 'all'): string {
  const which = status === 'all' ? '' : `${status} `;
  return count === 0 ? `No ${which}${noun}` : `All ${which}${noun}`;
}

/** Shared by the column headings and every row, so the three columns line up. */
const GRID = 'grid gap-2 sm:grid-cols-[7.5rem_18rem_minmax(0,1fr)] sm:items-center sm:gap-4';

/**
 * One row of the filters: what it filters, its status switch, and the pick.
 * Below sm the three stack, the name reading as the row's heading.
 */
function FilterRow({
  label,
  status,
  children,
}: {
  label: string;
  /** Absent on the period row, which has no status of its own. */
  status?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div role="group" aria-label={label} className={GRID}>
      <span className="text-sm font-medium text-foreground">{label}</span>
      {status ?? <span className="hidden sm:block" aria-hidden="true" />}
      <div className="min-w-0">{children}</div>
    </div>
  );
}

/**
 * The form inside the dialog. Mounted on every opening, so it always starts
 * from the filters currently applied and a cancelled edit leaves nothing behind.
 */
function FiltersForm({
  applied,
  surveys,
  groups,
  onApply,
  onCancel,
}: {
  applied: FilterState;
  surveys: SurveyOption[];
  groups: GroupOption[];
  onApply: (next: FilterState) => void;
  onCancel: () => void;
}) {
  const [draft, setDraft] = useState<FilterState>(applied);

  /**
   * Applies a change, then drops every pick a level above has ruled out: the
   * levels run survey → questionnaire → assignment, and each one narrows the
   * choices of the ones below it.
   */
  const update = (patch: Partial<FilterState>) =>
    setDraft((current) => {
      const d = { ...current, ...patch };

      const survey = surveys.find((s) => String(s.id) === d.surveyId);
      if (d.surveyId && (!survey || !matchesLifecycle(survey.status, d.surveyStatus))) {
        d.surveyId = '';
      }
      const kept = d.surveyId ? survey : undefined;

      const questionnaire = kept?.questionnaires.find((q) => String(q.id) === d.questionnaireId);
      if (
        d.questionnaireId &&
        (!questionnaire || !matchesLifecycle(questionnaire.status, d.questionnaireStatus))
      ) {
        d.questionnaireId = '';
      }

      const allowedGroups = groupsOf(kept, d);
      if (d.groupId && allowedGroups && !allowedGroups.has(Number(d.groupId))) d.groupId = '';

      if (kept?.accessMode && d.accessMode && d.accessMode !== kept.accessMode) d.accessMode = '';

      return d;
    });

  const selectedSurvey = surveys.find((s) => String(s.id) === draft.surveyId);
  const surveyOptions = surveySelectOptions(
    surveys.filter((s) => matchesLifecycle(s.status, draft.surveyStatus))
  );
  const questionnaireOptions = (selectedSurvey?.questionnaires ?? [])
    .filter((q) => matchesLifecycle(q.status, draft.questionnaireStatus))
    .map((q) => ({ label: q.title, value: String(q.id) }));

  // Without a survey there is nothing to list yet, rather than nothing at all.
  const questionnaireAll = selectedSurvey
    ? allLabel('questionnaires', questionnaireOptions.length, draft.questionnaireStatus)
    : 'Pick a survey first';

  const allowedGroups = groupsOf(selectedSurvey, draft);
  const groupOptions = groups
    .filter((g) => !allowedGroups || allowedGroups.has(g.id))
    .map((g) => ({ label: g.name, value: String(g.id) }));
  // A survey has one access mode: once it is picked, that is the only one left.
  const accessModeOptions = selectedSurvey?.accessMode
    ? ACCESS_MODE_OPTIONS.filter((o) => o.value === selectedSurvey.accessMode)
    : ACCESS_MODE_OPTIONS;

  return (
    <>
      <div className="flex min-h-0 flex-col gap-4 overflow-y-auto pr-1">
        {/* Column headings: what each column of the rows below holds */}
        <div
          className={`${GRID} hidden text-[11px] font-medium uppercase tracking-wide text-muted-foreground sm:grid`}
        >
          <span />
          <span className="flex items-center gap-1">
            Status
            <SectionInfoModal title="Status filters" items={STATUS_FILTER_INFO} />
          </span>
          <span>Selection</span>
        </div>

        <FilterRow
          label="Survey"
          status={
            <StatusToggle
              hideLabel
              label="Survey status"
              options={LIFECYCLE_OPTIONS}
              value={draft.surveyStatus}
              onChange={(v) => update({ surveyStatus: v })}
            />
          }
        >
          <DevnutSelect
            aria-label="Survey"
            searchable
            searchPlaceholder="Search survey…"
            listHeader={<SurveyListHeader />}
            value={draft.surveyId}
            onValueChange={(v) => update({ surveyId: v ?? '', questionnaireId: '' })}
            options={surveyOptions}
            disabled={surveyOptions.length === 0}
            placeholder={allLabel('surveys', surveyOptions.length, draft.surveyStatus)}
            showAllOption
            allOptionLabel={allLabel('surveys', surveyOptions.length, draft.surveyStatus)}
            triggerClassName="w-full text-xs"
          />
        </FilterRow>

        <FilterRow
          label="Questionnaire"
          status={
            <StatusToggle
              hideLabel
              label="Questionnaire status"
              options={LIFECYCLE_OPTIONS}
              value={draft.questionnaireStatus}
              onChange={(v) => update({ questionnaireStatus: v })}
            />
          }
        >
          <DevnutSelect
            aria-label="Questionnaire"
            searchable
            searchPlaceholder="Search questionnaire…"
            value={draft.questionnaireId}
            onValueChange={(v) => update({ questionnaireId: v ?? '' })}
            options={questionnaireOptions}
            placeholder={questionnaireAll}
            showAllOption
            allOptionLabel={questionnaireAll}
            disabled={!selectedSurvey || questionnaireOptions.length === 0}
            triggerClassName="w-full text-xs"
          />
        </FilterRow>

        <FilterRow
          label="Assignment"
          status={
            <StatusToggle
              hideLabel
              label="Assignment status"
              value={draft.completionStatus}
              onChange={(v) => update({ completionStatus: v })}
            />
          }
        >
          <div className="grid gap-2 sm:grid-cols-2">
            <DevnutSelect
              aria-label="Group"
              searchable
              searchPlaceholder="Search group…"
              value={draft.groupId}
              onValueChange={(v) => update({ groupId: v ?? '' })}
              options={groupOptions}
              disabled={groupOptions.length === 0}
              placeholder={allLabel('groups', groupOptions.length)}
              showAllOption
              allOptionLabel={allLabel('groups', groupOptions.length)}
              triggerClassName="w-full text-xs"
            />
            <DevnutSelect
              aria-label="Access mode"
              searchable
              searchPlaceholder="Search access mode…"
              value={draft.accessMode}
              onValueChange={(v) => update({ accessMode: v ?? '' })}
              options={accessModeOptions}
              disabled={accessModeOptions.length === 0}
              placeholder={allLabel('access modes', accessModeOptions.length)}
              showAllOption
              allOptionLabel={allLabel('access modes', accessModeOptions.length)}
              triggerClassName="w-full text-xs"
            />
          </div>
        </FilterRow>

        <FilterRow label="Period">
          <div className="flex items-center gap-2">
            <input
              aria-label="From"
              name="dateFrom"
              type="date"
              value={draft.dateFrom}
              onChange={(e) => update({ dateFrom: e.target.value })}
              className="min-w-0 flex-1 rounded-full border bg-white px-3 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-primary"
            />
            <span className="text-xs text-muted-foreground" aria-hidden="true">
              →
            </span>
            <input
              aria-label="To"
              name="dateTo"
              type="date"
              value={draft.dateTo}
              onChange={(e) => update({ dateTo: e.target.value })}
              className="min-w-0 flex-1 rounded-full border bg-white px-3 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>
        </FilterRow>
      </div>

      <DialogFooter className="flex-row items-center justify-between gap-2 border-t pt-4 sm:justify-between">
        <button
          type="button"
          onClick={() => setDraft(DEFAULT_FILTERS)}
          className="cursor-pointer rounded text-sm text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          Reset all
        </button>
        <div className="flex items-center gap-2">
          <DevnutButton variant="outline" className="rounded-full px-5" onClick={onCancel}>
            Cancel
          </DevnutButton>
          <DevnutButton className="rounded-full px-6" onClick={() => onApply(draft)}>
            Apply
          </DevnutButton>
        </div>
      </DialogFooter>
    </>
  );
}

/** Where the dashboard filters are edited; the side column only lists them. */
export function FiltersDialog({
  open,
  onOpenChange,
  applied,
  surveys,
  groups,
  onApply,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  applied: FilterState;
  surveys: SurveyOption[];
  groups: GroupOption[];
  onApply: (next: FilterState) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[90vh] max-w-5xl flex-col sm:max-w-5xl gap-4 rounded-2xl border-0 p-5 shadow-xl sm:p-8">
        <DialogHeader>
          <DialogTitle className="text-lg font-semibold">Filters</DialogTitle>
          <DialogDescription>
            Choose what the dashboard shows. Changes apply to every tab once you press Apply.
          </DialogDescription>
        </DialogHeader>
        {open && (
          <FiltersForm
            applied={applied}
            surveys={surveys}
            groups={groups}
            onCancel={() => onOpenChange(false)}
            onApply={(next) => {
              onApply(next);
              onOpenChange(false);
            }}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
