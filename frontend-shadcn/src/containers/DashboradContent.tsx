import apiClient from '@/api/client';
import { DevnutButton } from '@/components/DevnutButton';
import { DevnutSelect } from '@/components/DevnutSelect';
import { SectionInfoModal } from '@/components/SectionInfoModal';
import {
  ACCESS_MODE_OPTIONS,
  DEFAULT_STATUS,
  matchesLifecycle,
  type Filters,
  type StatusFilter,
} from '@/pages/dashboard/downloadFilters';
import { DistributionsTab } from '@/pages/dashboard/DistributionsTab';
import { DownloadTab } from '@/pages/dashboard/DownloadTab';
import { OverallTab } from '@/pages/dashboard/OverallTab';
import { ScoresTab } from '@/pages/dashboard/ScoresTab';
import { SocioTab } from '@/pages/dashboard/SocioTab';
import { StatusToggle } from '@/pages/dashboard/StatusToggle';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import { ChevronDown, Filter, RotateCcw } from 'lucide-react';
import React, { useEffect, useId, useState } from 'react';

// ─── Filter data types ────────────────────────────────────────────────────────

interface SurveyOption {
  id: number;
  name: string;
  status: string;
  questionnaires: { id: number; title: string; status: string }[];
}

interface GroupOption {
  id: number;
  name: string;
}

// ─── Constants ────────────────────────────────────────────────────────────────

type DashboardTab = 'overall' | 'socio' | 'static' | 'dynamic' | 'feedback' | 'scores' | 'download';

const DASHBOARD_TABS: DashboardTab[] = [
  'overall',
  'socio',
  'static',
  'dynamic',
  'feedback',
  'scores',
  'download',
];

const TAB_LABELS: Record<DashboardTab, string> = {
  overall: 'Completion trends',
  socio: 'Demographics',
  static: 'Static',
  dynamic: 'Dynamic',
  feedback: 'Feedback',
  scores: 'Scores',
  download: 'Download',
};

/**
 * Survey options for the dock. Duplicated surveys can share a name, which made
 * the list show the same entry twice with no way to tell which is which: those
 * get their status and id appended.
 */
function toSurveyOptions(surveys: SurveyOption[]) {
  const nameCount = new Map<string, number>();
  for (const s of surveys) nameCount.set(s.name, (nameCount.get(s.name) ?? 0) + 1);

  return surveys.map((s) => ({
    label: (nameCount.get(s.name) ?? 0) > 1 ? `${s.name} (${s.status} · #${s.id})` : s.name,
    value: String(s.id),
  }));
}

/** What the dock's status switches do, shown behind the info icon. */
const STATUS_FILTER_INFO = [
  {
    heading: 'Survey status',
    description:
      'Completed: surveys that have been closed. In progress: surveys that are running or paused. All: both. Surveys still in draft are never shown, as they hold no data yet.',
  },
  {
    heading: 'Questionnaire status',
    description:
      'Same rule, applied to the questionnaires of each survey: Completed for closed ones, In progress for running or paused ones.',
  },
  {
    heading: 'Assignment status',
    description:
      'Completed: questionnaires a patient has submitted, placed in the date range by their submission date. In progress: started but not submitted yet, placed by their last activity. Assignments nobody has started are never counted.',
  },
  {
    heading: 'How they combine',
    description:
      'The three switches apply together, and also narrow the Survey and Questionnaire lists above. A survey or questionnaire you pick there is not filtered again, so the Scores tab and the export only apply the levels below it.',
  },
];

const DEFAULT_DATE_FROM = (() => {
  const d = new Date();
  d.setMonth(d.getMonth() - 6);
  return d.toISOString().split('T')[0];
})();

const DEFAULT_DATE_TO = new Date().toISOString().split('T')[0];

// ─── Main component ───────────────────────────────────────────────────────────

export const DashboradContent: React.FC = () => {
  const [activeTab, setActiveTab] = useState<DashboardTab>('overall');

  /**
   * Survey the Download tab should open on, set by clicking a card in Overall.
   *
   * Cleared whenever a tab is picked from the header, so coming back to Download
   * later lands on the survey list rather than silently reopening the last card.
   */
  const [downloadSurvey, setDownloadSurvey] = useState<{ id: number; name: string } | null>(null);

  const goToTab = (tab: DashboardTab) => {
    setDownloadSurvey(null);
    setActiveTab(tab);
  };

  /**
   * Arrow keys, Home and End move between the tabs and open them, as the
   * WAI-ARIA tabs pattern expects; Tab then leaves the tab list for the panel.
   */
  const handleTabKeyDown = (e: React.KeyboardEvent<HTMLButtonElement>, tab: DashboardTab) => {
    const i = DASHBOARD_TABS.indexOf(tab);
    const last = DASHBOARD_TABS.length - 1;
    const target =
      e.key === 'ArrowRight'
        ? DASHBOARD_TABS[i === last ? 0 : i + 1]
        : e.key === 'ArrowLeft'
          ? DASHBOARD_TABS[i === 0 ? last : i - 1]
          : e.key === 'Home'
            ? DASHBOARD_TABS[0]
            : e.key === 'End'
              ? DASHBOARD_TABS[last]
              : null;
    if (!target) return;
    e.preventDefault();
    goToTab(target);
    document.getElementById(`dashboard-tab-${target}`)?.focus();
  };

  const openSurveyDownload = (id: number, name: string) => {
    setDownloadSurvey({ id, name });
    setActiveTab('download');
  };

  // Filter options loaded from backend
  const [surveys, setSurveys] = useState<SurveyOption[]>([]);
  const [groups, setGroups] = useState<GroupOption[]>([]);

  // Active filter state
  const [surveyId, setSurveyId] = useState<string>('');
  const [questionnaireId, setQuestionnaireId] = useState<string>('');
  const [groupId, setGroupId] = useState<string>('');
  const [accessMode, setAccessMode] = useState<string>('');
  const [dateFrom, setDateFrom] = useState<string>(DEFAULT_DATE_FROM);
  const [dateTo, setDateTo] = useState<string>(DEFAULT_DATE_TO);
  const [surveyStatus, setSurveyStatus] = useState<StatusFilter>(DEFAULT_STATUS);
  const [questionnaireStatus, setQuestionnaireStatus] = useState<StatusFilter>(DEFAULT_STATUS);
  const [completionStatus, setCompletionStatus] = useState<StatusFilter>(DEFAULT_STATUS);

  // Ties each date label to its input (WCAG 1.3.1 / 4.1.2). Generated rather
  // than fixed, so the export dialog's own date fields cannot clash with these.
  const dateFieldId = useId();

  // Below lg the side column would squeeze the content: filters move into a
  // collapsible panel above the tabs instead.
  const isDesktop = useMediaQuery('(min-width: 1024px)');
  const [filtersOpen, setFiltersOpen] = useState(false);

  useEffect(() => {
    apiClient
      .get('/dashboard/filters')
      .then((r) => {
        setSurveys(r.data.data.surveys ?? []);
        setGroups(r.data.data.groups ?? []);
      })
      .catch(() => {});
  }, []);

  // When survey changes, reset questionnaire
  const handleSurveyChange = (val: string | undefined) => {
    setSurveyId(val ?? '');
    setQuestionnaireId('');
  };

  // A status change can rule out the survey or questionnaire picked below it:
  // drop the pick then, rather than keep filtering on something no longer listed.
  const handleSurveyStatusChange = (next: StatusFilter) => {
    setSurveyStatus(next);
    const picked = surveys.find((s) => String(s.id) === surveyId);
    if (picked && !matchesLifecycle(picked.status, next)) {
      setSurveyId('');
      setQuestionnaireId('');
    }
  };

  const handleQuestionnaireStatusChange = (next: StatusFilter) => {
    setQuestionnaireStatus(next);
    const picked = surveys
      .find((s) => String(s.id) === surveyId)
      ?.questionnaires.find((q) => String(q.id) === questionnaireId);
    if (picked && !matchesLifecycle(picked.status, next)) setQuestionnaireId('');
  };

  const handleReset = () => {
    setSurveyId('');
    setQuestionnaireId('');
    setGroupId('');
    setAccessMode('');
    setDateFrom(DEFAULT_DATE_FROM);
    setDateTo(DEFAULT_DATE_TO);
    setSurveyStatus(DEFAULT_STATUS);
    setQuestionnaireStatus(DEFAULT_STATUS);
    setCompletionStatus(DEFAULT_STATUS);
  };

  // Build questionnaire options from selected survey
  const selectedSurvey = surveys.find((s) => String(s.id) === surveyId);
  const questionnaireOptions = (selectedSurvey?.questionnaires ?? [])
    .filter((q) => matchesLifecycle(q.status, questionnaireStatus))
    .map((q) => ({ label: q.title, value: String(q.id) }));

  const surveyOptions = toSurveyOptions(
    surveys.filter((s) => matchesLifecycle(s.status, surveyStatus))
  );
  const groupOptions = groups.map((g) => ({ label: g.name, value: String(g.id) }));

  const filters: Filters = {
    surveyId: surveyId ? parseInt(surveyId) : undefined,
    questionnaireId: questionnaireId ? parseInt(questionnaireId) : undefined,
    groupId: groupId ? parseInt(groupId) : undefined,
    accessMode: accessMode || undefined,
    dateFrom: dateFrom || undefined,
    dateTo: dateTo || undefined,
    surveyStatus,
    questionnaireStatus,
    completionStatus,
  };

  /** Filters that differ from their defaults, shown on the collapsed toggle. */
  const activeFilterCount =
    [surveyId, questionnaireId, groupId, accessMode].filter(Boolean).length +
    (dateFrom !== DEFAULT_DATE_FROM ? 1 : 0) +
    (dateTo !== DEFAULT_DATE_TO ? 1 : 0) +
    [surveyStatus, questionnaireStatus, completionStatus].filter((s) => s !== DEFAULT_STATUS)
      .length;

  /**
   * The filter controls. Rendered in exactly one place — the side column on
   * desktop, the collapsible panel below it — never both, so their ids and
   * labels stay unique in the page.
   */
  const filterControls = (
    <>
      <div className="flex items-center justify-between mb-1 sm:col-span-2">
        <h2
          className={`text-sm font-semibold flex items-center gap-1.5 text-foreground ${
            isDesktop ? '' : 'sr-only'
          }`}
        >
          <Filter className="size-3.5" aria-hidden="true" />
          Filters
        </h2>
        <button
          type="button"
          onClick={handleReset}
          aria-label="Reset filters"
          className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 min-h-6 px-1"
        >
          <RotateCcw className="size-3" aria-hidden="true" />
          Reset
        </button>
      </div>

      {/* Survey */}
      <DevnutSelect
        label="Survey"
        searchable
        searchPlaceholder="Search survey…"
        value={surveyId}
        onValueChange={handleSurveyChange}
        options={surveyOptions}
        placeholder="All"
        showAllOption
        allOptionLabel="All"
        triggerClassName="w-full text-xs"
      />

      {/* Questionnaire (dependent) */}
      <DevnutSelect
        label="Questionnaire"
        searchable
        searchPlaceholder="Search questionnaire…"
        value={questionnaireId}
        onValueChange={(v) => setQuestionnaireId(v ?? '')}
        options={questionnaireOptions}
        placeholder="All"
        showAllOption
        allOptionLabel="All"
        triggerClassName="w-full text-xs"
      />

      {/* Group */}
      <DevnutSelect
        label="Group"
        searchable
        searchPlaceholder="Search group…"
        value={groupId}
        onValueChange={(v) => setGroupId(v ?? '')}
        options={groupOptions}
        placeholder="All"
        showAllOption
        allOptionLabel="All"
        triggerClassName="w-full text-xs"
      />

      {/* Access mode */}
      <DevnutSelect
        label="Access Mode"
        searchable
        searchPlaceholder="Search access mode…"
        value={accessMode}
        onValueChange={(v) => setAccessMode(v ?? '')}
        options={ACCESS_MODE_OPTIONS}
        placeholder="All"
        triggerClassName="w-full text-xs"
      />

      {/* Date range */}
      <div className="flex flex-col gap-1">
        <label
          htmlFor={`${dateFieldId}-from`}
          className="text-xs font-medium text-muted-foreground"
        >
          Date from
        </label>
        <input
          id={`${dateFieldId}-from`}
          name="dateFrom"
          type="date"
          value={dateFrom}
          onChange={(e) => setDateFrom(e.target.value)}
          className="w-full rounded-md border bg-background px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-ring"
        />
      </div>
      <div className="flex flex-col gap-1">
        <label htmlFor={`${dateFieldId}-to`} className="text-xs font-medium text-muted-foreground">
          Date to
        </label>
        <input
          id={`${dateFieldId}-to`}
          name="dateTo"
          type="date"
          value={dateTo}
          onChange={(e) => setDateTo(e.target.value)}
          className="w-full rounded-md border bg-background px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-ring"
        />
      </div>

      {/* Status, one switch per level. They also narrow the Survey and
          Questionnaire lists above. */}
      <div className="-mb-2 flex items-center gap-1.5 sm:col-span-2">
        <span className="text-xs font-semibold text-foreground">Status</span>
        <SectionInfoModal title="Status filters" items={STATUS_FILTER_INFO} />
      </div>
      <StatusToggle
        label="Survey status"
        value={surveyStatus}
        onChange={handleSurveyStatusChange}
      />
      <StatusToggle
        label="Questionnaire status"
        value={questionnaireStatus}
        onChange={handleQuestionnaireStatusChange}
      />
      <StatusToggle
        label="Assignment status"
        value={completionStatus}
        onChange={setCompletionStatus}
      />
    </>
  );

  return (
    // Desktop: side column + main, each scrolling on its own inside the screen.
    // Below lg the page simply flows and scrolls as a whole.
    <div className="flex bg-background lg:h-screen lg:overflow-hidden">
      {/* ── Sidebar filters (desktop) ───────────────────────────────────── */}
      {isDesktop && (
        <aside
          aria-label="Dashboard filters"
          className="w-56 shrink-0 border-r bg-muted/20 px-4 py-6 flex flex-col gap-4 h-full overflow-y-auto"
        >
          {filterControls}
        </aside>
      )}

      {/* ── Main content ────────────────────────────────────────────────── */}
      <div className="flex min-w-0 flex-1 flex-col px-4 py-4 sm:px-6 sm:py-6 lg:overflow-hidden">
        {/* Header + tabs: stacked below lg, side by side above */}
        <div className="mb-6 flex shrink-0 flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center justify-between gap-3">
            <h1 className="font-semibold text-foreground text-2xl lg:text-4xl">Dashboard</h1>
            {!isDesktop && (
              <DevnutButton
                variant="outline"
                aria-expanded={filtersOpen}
                aria-controls="dashboard-filters-panel"
                onClick={() => setFiltersOpen((open) => !open)}
                className="gap-1.5 rounded-full px-4 text-sm"
              >
                <Filter className="size-4" aria-hidden="true" />
                Filters
                {activeFilterCount > 0 && (
                  <span className="rounded-full bg-primary px-1.5 text-xs font-medium text-white">
                    {activeFilterCount}
                    <span className="sr-only"> active</span>
                  </span>
                )}
                <ChevronDown
                  className={`size-4 transition-transform ${filtersOpen ? 'rotate-180' : ''}`}
                  aria-hidden="true"
                />
              </DevnutButton>
            )}
          </div>

          {/* Collapsible filter panel (tablet / mobile): in the page flow, not an
              overlay, so the selects and the info dialog open above it as usual. */}
          {!isDesktop && filtersOpen && (
            <section
              id="dashboard-filters-panel"
              aria-label="Dashboard filters"
              className="grid gap-4 rounded-xl border bg-muted/20 p-4 sm:grid-cols-2"
            >
              {filterControls}
            </section>
          )}

          <div
            role="tablist"
            aria-label="Dashboard sections"
            className="flex w-full items-center gap-1 overflow-x-auto rounded-full bg-muted px-1 py-1 lg:w-auto"
          >
            {DASHBOARD_TABS.map((tab) => (
              <DevnutButton
                key={tab}
                id={`dashboard-tab-${tab}`}
                role="tab"
                aria-selected={activeTab === tab}
                aria-controls="dashboard-tabpanel"
                // Roving focus: only the open tab is in the Tab order.
                tabIndex={activeTab === tab ? 0 : -1}
                onKeyDown={(e) => handleTabKeyDown(e, tab)}
                variant={activeTab === tab ? 'default' : 'ghost'}
                // Inactive labels use neutral-600: muted-foreground on the muted
                // pill is 4.35:1, under the 4.5:1 WCAG AA needs for this size.
                // Equal share of the row below lg, natural width above.
                className={`flex-1 shrink-0 whitespace-nowrap rounded-full px-2 py-1.5 text-sm sm:px-4 lg:flex-none ${
                  activeTab === tab
                    ? 'bg-primary text-white shadow-sm hover:bg-[#554fa3] hover:text-white'
                    : 'text-neutral-600 hover:text-foreground'
                }`}
                onClick={() => goToTab(tab)}
              >
                {TAB_LABELS[tab]}
              </DevnutButton>
            ))}
          </div>
        </div>

        {/* Tab content — scrollable area */}
        <div
          id="dashboard-tabpanel"
          role="tabpanel"
          aria-labelledby={`dashboard-tab-${activeTab}`}
          className="flex-1 lg:overflow-y-auto"
        >
          {activeTab === 'overall' && (
            <OverallTab filters={filters} onSelectSurvey={openSurveyDownload} />
          )}
          {activeTab === 'socio' && <SocioTab filters={filters} />}
          {(activeTab === 'static' || activeTab === 'dynamic' || activeTab === 'feedback') && (
            // Keyed by tab, so switching between them starts from a clean state.
            <DistributionsTab key={activeTab} filters={filters} moduleType={activeTab} />
          )}
          {activeTab === 'scores' && <ScoresTab filters={filters} />}
          {activeTab === 'download' && (
            <DownloadTab filters={filters} initialSurvey={downloadSurvey} />
          )}
        </div>
      </div>
    </div>
  );
};
