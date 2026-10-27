import apiClient from '@/api/client';
import { DevnutButton } from '@/components/DevnutButton';
import { AppliedFilters } from '@/pages/dashboard/AppliedFilters';
import { DistributionsTab } from '@/pages/dashboard/DistributionsTab';
import { DownloadTab } from '@/pages/dashboard/DownloadTab';
import {
  changedFields,
  DEFAULT_FILTERS,
  toFilters,
  type FilterState,
  type GroupOption,
  type SurveyOption,
} from '@/pages/dashboard/filterState';
import { FiltersDialog } from '@/pages/dashboard/FiltersDialog';
import { OverallTab } from '@/pages/dashboard/OverallTab';
import { ScoresTab } from '@/pages/dashboard/ScoresTab';
import { SocioTab } from '@/pages/dashboard/SocioTab';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import { RotateCcw, SlidersHorizontal } from 'lucide-react';
import React, { useEffect, useRef, useState } from 'react';

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

/** How far a fade at either end of the tab row reaches. */
const EDGE_FADE = '1.5rem';

/**
 * Which ends of a horizontally scrolling element still hide content, so a fade
 * can say so on that side only: the scrollbar itself is hidden.
 */
function useScrollEdges(ref: React.RefObject<HTMLElement | null>) {
  const [edges, setEdges] = useState({ start: false, end: false });

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = () =>
      setEdges({
        start: el.scrollLeft > 1,
        end: el.scrollLeft + el.clientWidth < el.scrollWidth - 1,
      });
    update();
    el.addEventListener('scroll', update, { passive: true });
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => {
      el.removeEventListener('scroll', update);
      observer.disconnect();
    };
  }, [ref]);

  return edges;
}

/** A mask fading out whichever ends of the row have more tabs past them. */
function edgeMask({ start, end }: { start: boolean; end: boolean }): React.CSSProperties {
  if (!start && !end) return {};
  const mask = `linear-gradient(to right, ${start ? 'transparent' : 'black'}, black ${EDGE_FADE}, black calc(100% - ${EDGE_FADE}), ${end ? 'transparent' : 'black'})`;
  return { maskImage: mask, WebkitMaskImage: mask };
}

// ─── Main component ───────────────────────────────────────────────────────────

export const DashboradContent: React.FC = () => {
  const [activeTab, setActiveTab] = useState<DashboardTab>('overall');

  const tabListRef = useRef<HTMLDivElement>(null);
  const tabEdges = useScrollEdges(tabListRef);

  // When the row scrolls, the open tab is brought into view, wherever it was
  // opened from (a card's Download link, the arrow keys).
  useEffect(() => {
    document
      .getElementById(`dashboard-tab-${activeTab}`)
      ?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }, [activeTab]);

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

  /** The filters every tab reads. Edited in the dialog, removed from the list. */
  const [applied, setApplied] = useState<FilterState>(DEFAULT_FILTERS);
  const [dialogOpen, setDialogOpen] = useState(false);

  /**
   * Every change of filters goes through here: a survey opened from a Completion
   * trends card belongs to the old filters, and the Download tab must follow the
   * new ones instead.
   */
  const applyFilters = (next: FilterState) => {
    setDownloadSurvey(null);
    setApplied(next);
  };

  // Below lg the side column would squeeze the content: the applied filters
  // move into a row above the tabs instead.
  const isDesktop = useMediaQuery('(min-width: 1024px)');

  useEffect(() => {
    apiClient
      .get('/dashboard/filters')
      .then((r) => {
        setSurveys(r.data.data.surveys ?? []);
        setGroups(r.data.data.groups ?? []);
      })
      .catch(() => {});
  }, []);

  const filters = toFilters(applied);
  const activeFilterCount = changedFields(applied).length;

  /** The survey the filters narrow to, which the Download tab opens on. */
  const filteredSurvey = surveys.find((s) => String(s.id) === applied.surveyId);

  const editButton = (
    <DevnutButton
      variant="outline"
      onClick={() => setDialogOpen(true)}
      aria-haspopup="dialog"
      className="gap-1.5 rounded-full px-4 text-sm"
    >
      <SlidersHorizontal className="size-4" aria-hidden="true" />
      {isDesktop ? 'Edit filters' : 'Filters'}
      {!isDesktop && activeFilterCount > 0 && (
        <span className="rounded-full bg-primary px-1.5 text-xs font-medium text-white">
          {activeFilterCount}
          <span className="sr-only"> active</span>
        </span>
      )}
    </DevnutButton>
  );

  const resetButton = activeFilterCount > 0 && (
    <button
      type="button"
      onClick={() => applyFilters(DEFAULT_FILTERS)}
      aria-label="Reset filters"
      className="flex cursor-pointer items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
    >
      <RotateCcw className="size-3" aria-hidden="true" />
      Reset
    </button>
  );

  const appliedList = (layout: 'column' | 'row') => (
    <AppliedFilters
      applied={applied}
      surveys={surveys}
      groups={groups}
      onChange={applyFilters}
      layout={layout}
    />
  );

  return (
    // Desktop: side column + main, each scrolling on its own inside the screen.
    // Below lg the page simply flows and scrolls as a whole.
    <div className="flex bg-background lg:h-screen lg:overflow-hidden">
      {/* ── Applied filters (desktop) ───────────────────────────────────── */}
      {isDesktop && (
        <aside
          aria-label="Dashboard filters"
          // `relative`: what this column scrolls must be positioned inside it,
          // or it escapes the scrolling and stretches the page.
          className="relative flex h-full w-60 shrink-0 flex-col gap-4 overflow-y-auto border-r bg-muted/20 px-4 py-6"
        >
          {/* No visible title: the button says what the column is for, and the
              aside is labelled for screen readers. */}
          {editButton}
          {resetButton && <div className="-mb-2 flex justify-end">{resetButton}</div>}
          {appliedList('column')}
        </aside>
      )}

      {/* ── Main content ────────────────────────────────────────────────── */}
      <main className="flex min-w-0 flex-1 flex-col px-4 py-4 sm:px-6 sm:py-6 lg:overflow-hidden">
        {/* Header + tabs: the seven tabs only fit beside the title on the widest
            screens; below that they take a row of their own. */}
        <div className="mb-6 flex shrink-0 flex-col gap-3 2xl:flex-row 2xl:items-center 2xl:justify-between">
          <div className="flex items-center justify-between gap-3">
            <h1 className="font-semibold text-foreground text-2xl lg:text-4xl">Dashboard</h1>
            {!isDesktop && editButton}
          </div>

          {!isDesktop && activeFilterCount > 0 && (
            <section aria-label="Dashboard filters" className="flex flex-col gap-2">
              <div className="flex justify-end">{resetButton}</div>
              {appliedList('row')}
            </section>
          )}

          <div
            ref={tabListRef}
            role="tablist"
            aria-label="Dashboard sections"
            // Still scrolls when even a row of its own is too narrow, but with no
            // scrollbar: a fade on the side that hides tabs says there are more.
            // Same look as the survey page tabs (components/ui/tabs).
            className="flex w-full items-center overflow-x-auto rounded-lg bg-muted p-[3px] [scrollbar-width:none] 2xl:w-auto [&::-webkit-scrollbar]:hidden"
            style={edgeMask(tabEdges)}
          >
            {DASHBOARD_TABS.map((tab) => (
              <button
                key={tab}
                type="button"
                id={`dashboard-tab-${tab}`}
                role="tab"
                aria-selected={activeTab === tab}
                aria-controls="dashboard-tabpanel"
                // Roving focus: only the open tab is in the Tab order.
                tabIndex={activeTab === tab ? 0 : -1}
                onKeyDown={(e) => handleTabKeyDown(e, tab)}
                // The open tab: white, primary text and a 2px primary underline, as
                // on the survey page — not the white background alone (WCAG 1.4.11).
                // Equal share of their row, natural width beside the title.
                className={`inline-flex flex-1 shrink-0 cursor-pointer items-center justify-center whitespace-nowrap rounded-md border border-transparent px-3 py-1.5 text-sm font-medium transition-[color,box-shadow] focus-visible:ring-[3px] focus-visible:ring-ring focus-visible:outline-1 sm:px-4 2xl:flex-none ${
                  activeTab === tab
                    ? 'bg-background text-primary shadow-[inset_0_-2px_0_0_var(--color-primary)]'
                    : 'text-foreground hover:text-primary'
                }`}
                onClick={() => goToTab(tab)}
              >
                {TAB_LABELS[tab]}
              </button>
            ))}
          </div>
        </div>

        {/* Tab content — scrollable area. `relative` keeps what it scrolls inside
            it: the charts' screen-reader lists are positioned absolutely, and
            with the nearest positioned ancestor further up they escaped the
            scrolling and stretched the page with blank space. */}
        <div
          id="dashboard-tabpanel"
          role="tabpanel"
          aria-labelledby={`dashboard-tab-${activeTab}`}
          className="relative flex-1 lg:overflow-y-auto"
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
            <DownloadTab
              // Remounted when the filtered survey changes: its navigation is its
              // own, and would otherwise stay on the survey opened before.
              key={applied.surveyId || 'all'}
              filters={filters}
              initialSurvey={
                downloadSurvey ??
                (filteredSurvey ? { id: filteredSurvey.id, name: filteredSurvey.name } : null)
              }
            />
          )}
        </div>
      </main>

      <FiltersDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        applied={applied}
        surveys={surveys}
        groups={groups}
        onApply={applyFilters}
      />
    </div>
  );
};
