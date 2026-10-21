import apiClient from '@/api/client';
import { Button } from '@/components/ui/button';
import { ChevronLeft, Download } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { PaginationControls } from '@/components/data-table/pagination-controls';
import { DEFAULT_STATUS, RESPONSES_LABEL, useFilterParams, type Filters } from './downloadFilters';
import { SurveyLongExportModal } from './SurveyLongExportModal';

// ─── Types ────────────────────────────────────────────────────────────────────

interface SurveyRow {
  id: number;
  name: string;
  status: string;
  questionnaireCount: number;
  totalCompletions: number;
}

interface QuestionnaireRow {
  id: number;
  surveyQuestionnaireId: number;
  title: string;
  type: string;
  patientGroup: string | null;
  totalAssigned: number;
  totalCompletions: number;
}

type NavigationLevel = { level: 1 } | { level: 2; surveyId: number; surveyName: string };

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Shared styling for the icon-only row actions in the listings below. */
// Stessi colori dei bottoni icona della navbar (vedi NavbarIconItem).
const ROW_ACTION_CLASS =
  'inline-flex size-7 cursor-pointer items-center justify-center rounded-full bg-[#F9F9F9] text-primary transition-colors hover:bg-[#ececec]';

/**
 * The whole row opens the detail view on click, as a mouse convenience. The
 * accessible way in is the name button in its first cell: a `role="button"` on
 * the <tr> would erase the row from the table's semantics, and put the export
 * button inside another button.
 */
const CLICKABLE_ROW_CLASS = 'cursor-pointer transition-colors hover:bg-muted/20';

/** The row's name, as the button that opens its detail view. */
const ROW_NAME_BUTTON_CLASS =
  'cursor-pointer rounded text-left font-medium hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary';

/** Wraps a row-name click so it does not also fire the row's own handler. */
function stop(activate: () => void) {
  return (e: React.MouseEvent) => {
    e.stopPropagation();
    activate();
  };
}

function TypeBadge({ type }: { type: string }) {
  const map: Record<string, { label: string; cls: string }> = {
    dynamic: { label: 'Dynamic', cls: 'bg-violet-100 text-violet-700' },
    static: { label: 'Static', cls: 'bg-blue-100 text-blue-700' },
    'socio-demo': { label: 'Demographics', cls: 'bg-emerald-100 text-emerald-700' },
  };
  const { label, cls } = map[type] ?? { label: type, cls: 'bg-gray-100 text-gray-600' };
  return <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${cls}`}>{label}</span>;
}

// ─── Level 1: Survey list ─────────────────────────────────────────────────────

function SurveyList({
  filters,
  onSelect,
  onDownload,
}: {
  filters: Filters;
  onSelect: (id: number, name: string) => void;
  onDownload: (id: number, name: string) => void;
}) {
  const [loading, setLoading] = useState(true);
  const [surveys, setSurveys] = useState<SurveyRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(10);
  const params = useFilterParams(filters);

  useEffect(() => {
    // `cancelled` drops the answer of a request the filters have since moved past:
    // without it a slower, older response could land last and overwrite the
    // current one (typing a date fires one request per intermediate value).
    let cancelled = false;
    setLoading(true);
    setError(null);
    apiClient
      .get('/dashboard/download/surveys', { params })
      .then((r) => {
        if (cancelled) return;
        setSurveys(r.data.data ?? []);
        // A new filter result is a new list: go back to the first page.
        setPage(0);
      })
      .catch(() => {
        if (!cancelled) setError('Failed to load surveys.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [params]);

  if (loading)
    return (
      <div role="status" className="text-sm text-muted-foreground py-8 text-center">
        Loading…
      </div>
    );
  if (error)
    return (
      <div role="alert" className="text-sm text-destructive py-8 text-center">
        {error}
      </div>
    );
  if (surveys.length === 0)
    return <div className="text-sm text-muted-foreground py-8 text-center">No surveys found.</div>;

  // Clamped rather than synced through an effect, so a shrinking list cannot
  // leave the view stranded on a page that no longer exists.
  const pageCount = Math.max(1, Math.ceil(surveys.length / pageSize));
  const safePage = Math.min(page, pageCount - 1);
  const visible = surveys.slice(safePage * pageSize, (safePage + 1) * pageSize);

  return (
    <div>
      <div className="rounded-xl border bg-card shadow-sm overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-muted/40 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">
              <th scope="col" className="px-3 py-3 sm:px-5">
                Survey
              </th>
              <th scope="col" className="px-3 py-3 sm:px-5 text-center">
                Questionnaires
              </th>
              <th scope="col" className="px-3 py-3 sm:px-5 text-center">
                {RESPONSES_LABEL[filters.completionStatus ?? DEFAULT_STATUS]}
              </th>
              {/* Visually empty, but named: an empty <th> reads as a header with no text */}
              <th scope="col" className="px-3 py-3 sm:px-5">
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {visible.map((s) => (
              <tr key={s.id} onClick={() => onSelect(s.id, s.name)} className={CLICKABLE_ROW_CLASS}>
                <th scope="row" className="px-3 py-4 sm:px-5 text-left font-normal">
                  <button
                    type="button"
                    onClick={stop(() => onSelect(s.id, s.name))}
                    className={ROW_NAME_BUTTON_CLASS}
                  >
                    <span className="sr-only">View details of </span>
                    {s.name}
                  </button>
                </th>
                <td className="px-3 py-4 sm:px-5 text-center text-muted-foreground">
                  {s.questionnaireCount}
                </td>
                <td className="px-3 py-4 sm:px-5 text-center text-muted-foreground">
                  {s.totalCompletions}
                </td>
                <td className="px-3 py-4 sm:px-5">
                  <div className="flex items-center justify-end">
                    <button
                      type="button"
                      onClick={(e) => {
                        // Without this the row's own click would navigate away
                        // instead of opening the export dialog.
                        e.stopPropagation();
                        onDownload(s.id, s.name);
                      }}
                      className={ROW_ACTION_CLASS}
                      title={`Export data of ${s.name}`}
                      aria-label={`Export data of ${s.name}`}
                    >
                      <Download className="size-4" aria-hidden="true" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <PaginationControls
        pageIndex={safePage}
        pageSize={pageSize}
        total={surveys.length}
        onPageChange={setPage}
        onPageSizeChange={(size) => {
          setPageSize(size);
          setPage(0);
        }}
      />
    </div>
  );
}

// ─── Level 2: Questionnaire list inside a survey ──────────────────────────────

/**
 * The questionnaires of one survey, as a summary next to its export. Their answer
 * distributions live in the Static, Dynamic and Feedback tabs.
 */
function QuestionnaireList({ surveyId, filters }: { surveyId: number; filters: Filters }) {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<QuestionnaireRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const params = useFilterParams(filters);

  useEffect(() => {
    // Same guard as the survey list above.
    let cancelled = false;
    setLoading(true);
    setError(null);
    apiClient
      .get(`/dashboard/download/surveys/${surveyId}/questionnaires`, { params })
      .then((r) => {
        if (!cancelled) setData(r.data.data?.questionnaires ?? []);
      })
      .catch(() => {
        if (!cancelled) setError('Failed to load questionnaires.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [surveyId, params]);

  if (loading)
    return (
      <div role="status" className="text-sm text-muted-foreground py-8 text-center">
        Loading…
      </div>
    );
  if (error)
    return (
      <div role="alert" className="text-sm text-destructive py-8 text-center">
        {error}
      </div>
    );
  if (data.length === 0)
    return (
      <div className="text-sm text-muted-foreground py-8 text-center">No questionnaires found.</div>
    );

  return (
    <div className="rounded-xl border bg-card shadow-sm overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-muted/40 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">
            <th scope="col" className="px-3 py-3 sm:px-5">
              Questionnaire
            </th>
            <th scope="col" className="px-3 py-3 sm:px-5">
              Group
            </th>
            <th scope="col" className="px-3 py-3 sm:px-5">
              Type
            </th>
            <th scope="col" className="px-3 py-3 sm:px-5 text-center">
              Assigned
            </th>
            <th scope="col" className="px-3 py-3 sm:px-5 text-center">
              {RESPONSES_LABEL[filters.completionStatus ?? DEFAULT_STATUS]}
            </th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {data.map((q) => (
            <tr key={q.id}>
              <th scope="row" className="px-3 py-4 sm:px-5 text-left font-medium">
                {q.title}
              </th>
              <td className="px-3 py-4 sm:px-5 text-muted-foreground">{q.patientGroup ?? '—'}</td>
              <td className="px-3 py-4 sm:px-5">
                <TypeBadge type={q.type} />
              </td>
              <td className="px-3 py-4 sm:px-5 text-center text-muted-foreground">
                {q.totalAssigned}
              </td>
              <td className="px-3 py-4 sm:px-5 text-center text-muted-foreground">
                {q.totalCompletions}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ─── Root component ───────────────────────────────────────────────────────────

interface Props {
  filters: Filters;
  /**
   * Survey to open on mount, when arriving from an Overall tab card.
   *
   * Read once as the initial navigation state: after that the tab owns its own
   * navigation, so going back to the survey list with the breadcrumb sticks.
   */
  initialSurvey?: { id: number; name: string } | null;
}

export function DownloadTab({ filters, initialSurvey }: Props) {
  const [nav, setNav] = useState<NavigationLevel>(() =>
    initialSurvey
      ? { level: 2, surveyId: initialSurvey.id, surveyName: initialSurvey.name }
      : { level: 1 }
  );
  const [exportTarget, setExportTarget] = useState<{ id: number; name: string } | null>(null);

  // Drilling down (or back) unmounts the button that had focus: move focus to
  // the new level's heading so keyboard and screen reader users are not
  // dropped at the top of the page. Skipped on mount, when nothing moved.
  const headingRef = useRef<HTMLHeadingElement>(null);
  const prevNav = useRef(nav);
  useEffect(() => {
    if (prevNav.current === nav) return;
    prevNav.current = nav;
    headingRef.current?.focus();
  }, [nav]);

  return (
    <div className="flex flex-col h-full gap-4">
      {/* Breadcrumb */}
      {nav.level > 1 && (
        <nav aria-label="Breadcrumb" className="flex items-center gap-2 text-sm">
          <button
            type="button"
            onClick={() => setNav({ level: 1 })}
            className="flex items-center gap-1 text-muted-foreground hover:text-foreground transition-colors"
          >
            <ChevronLeft className="w-4 h-4" aria-hidden="true" />
            <span className="sr-only">Back to </span>
            Surveys
          </button>
        </nav>
      )}

      {/* Page title */}
      {nav.level === 1 && (
        <h2 ref={headingRef} tabIndex={-1} className="text-lg font-semibold text-foreground">
          Surveys
        </h2>
      )}
      {nav.level === 2 && (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 ref={headingRef} tabIndex={-1} className="text-lg font-semibold text-foreground">
            {nav.surveyName}
          </h2>
          <Button
            variant="outline"
            size="sm"
            className="cursor-pointer gap-1.5 rounded-full"
            onClick={() => setExportTarget({ id: nav.surveyId, name: nav.surveyName })}
          >
            <Download className="size-3.5" aria-hidden="true" />
            Export survey data
          </Button>
        </div>
      )}

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {nav.level === 1 && (
          <SurveyList
            filters={filters}
            onSelect={(id, name) => setNav({ level: 2, surveyId: id, surveyName: name })}
            onDownload={(id, name) => setExportTarget({ id, name })}
          />
        )}
        {nav.level === 2 && <QuestionnaireList surveyId={nav.surveyId} filters={filters} />}
      </div>

      {exportTarget && (
        <SurveyLongExportModal
          open
          onClose={() => setExportTarget(null)}
          surveyId={exportTarget.id}
          surveyName={exportTarget.name}
        />
      )}
    </div>
  );
}
