import apiClient from '@/api/client';
import { DevnutSelect } from '@/components/DevnutSelect';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { AxiosError } from 'axios';
import { AlertTriangle, Download } from 'lucide-react';
import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { ACCESS_MODE_OPTIONS, type StatusFilter } from './downloadFilters';
import {
  ALL_COLUMN_KEYS,
  COLUMN_GROUPS,
  COLUMN_GROUP_LABELS,
  EXPORT_COLUMNS,
  type ColumnGroup,
} from './exportColumns';
import { StatusToggle } from './StatusToggle';

interface ErrorBody {
  status?: number;
  message: string;
}

/**
 * Reads the error body out of a failed blob download.
 *
 * With `responseType: 'blob'` axios hands back the error body as a Blob too, so
 * the JSON has to be unwrapped by hand — otherwise the "too many rows" guidance
 * never reaches the user.
 */
async function readErrorBody(err: unknown): Promise<ErrorBody> {
  const response = (err as AxiosError)?.response;
  const fallback = { status: response?.status, message: 'Export failed. Please try again.' };
  if (!(response?.data instanceof Blob)) return fallback;
  try {
    const parsed = JSON.parse(await response.data.text());
    return {
      status: response.status,
      message: typeof parsed?.message === 'string' ? parsed.message : fallback.message,
    };
  } catch {
    return fallback; // not JSON
  }
}

/**
 * The dialog's own narrowing, in the Filters tab. Starts empty: by default an
 * export is the whole survey, whatever the dashboard dock is set to. Mostly
 * needed when the whole survey is over the row limit.
 */
interface ExportFilterState {
  questionnaireId: string;
  groupId: string;
  accessMode: string;
  dateFrom: string;
  dateTo: string;
  completionStatus: StatusFilter;
}

const NO_FILTERS: ExportFilterState = {
  questionnaireId: '',
  groupId: '',
  accessMode: '',
  dateFrom: '',
  dateTo: '',
  completionStatus: 'all',
};

/** Query params for the filters actually set; none at all means the whole survey. */
function exportFilterParams(f: ExportFilterState): Record<string, string> {
  const p: Record<string, string> = {};
  if (f.questionnaireId) p.questionnaireId = f.questionnaireId;
  if (f.groupId) p.groupId = f.groupId;
  if (f.accessMode) p.accessMode = f.accessMode;
  if (f.dateFrom) p.dateFrom = f.dateFrom;
  if (f.dateTo) p.dateTo = f.dateTo;
  if (f.completionStatus !== 'all') p.completionStatus = f.completionStatus;
  return p;
}

type ExportTab = 'columns' | 'filters';

/** Pill tabs in the dashboard colours, like the dashboard tab switcher. */
const TAB_TRIGGER_CLASS =
  'cursor-pointer gap-1.5 rounded-full px-4 py-1.5 text-muted-foreground data-[state=active]:bg-primary data-[state=active]:text-white data-[state=active]:shadow-sm';

interface FilterOptions {
  questionnaires: { label: string; value: string }[];
  groups: { label: string; value: string }[];
}

const DATE_INPUT_CLASS =
  'w-full rounded-md border bg-background px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-ring';

function ExportFiltersPanel({
  value,
  onChange,
  options,
}: {
  value: ExportFilterState;
  onChange: (next: ExportFilterState) => void;
  options: FilterOptions | null;
}) {
  // Label ↔ input association for the date fields (WCAG 1.3.1 / 4.1.2).
  const dateFieldId = useId();

  const set = <K extends keyof ExportFilterState>(key: K, v: ExportFilterState[K]) =>
    onChange({ ...value, [key]: v });

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      <DevnutSelect
        label="Questionnaire"
        value={value.questionnaireId}
        onValueChange={(v) => set('questionnaireId', v ?? '')}
        options={options?.questionnaires ?? []}
        placeholder="All"
        allOptionLabel="All"
        triggerClassName="w-full text-xs"
      />
      <DevnutSelect
        label="Group"
        value={value.groupId}
        onValueChange={(v) => set('groupId', v ?? '')}
        options={options?.groups ?? []}
        placeholder="All"
        allOptionLabel="All"
        triggerClassName="w-full text-xs"
      />
      <DevnutSelect
        label="Access Mode"
        value={value.accessMode}
        onValueChange={(v) => set('accessMode', v ?? '')}
        options={ACCESS_MODE_OPTIONS}
        placeholder="All"
        allOptionLabel="All"
        triggerClassName="w-full text-xs"
      />
      <StatusToggle
        label="Assignment status"
        value={value.completionStatus}
        onChange={(v) => set('completionStatus', v)}
      />
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
          value={value.dateFrom}
          onChange={(e) => set('dateFrom', e.target.value)}
          className={DATE_INPUT_CLASS}
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
          value={value.dateTo}
          onChange={(e) => set('dateTo', e.target.value)}
          className={DATE_INPUT_CLASS}
        />
      </div>
    </div>
  );
}

function ColumnGroupSection({
  group,
  selected,
  onToggleColumn,
  onToggleGroup,
}: {
  group: ColumnGroup;
  selected: Set<string>;
  onToggleColumn: (key: string) => void;
  onToggleGroup: (group: ColumnGroup, checked: boolean) => void;
}) {
  const columns = useMemo(() => EXPORT_COLUMNS.filter((c) => c.group === group), [group]);
  const selectedCount = columns.filter((c) => selected.has(c.key)).length;
  const allSelected = selectedCount === columns.length;

  return (
    <div className="space-y-2">
      <label className="flex cursor-pointer items-center gap-2 text-sm font-medium">
        <input
          type="checkbox"
          className="size-4 accent-[#6366f1]"
          checked={allSelected}
          ref={(el) => {
            if (el) el.indeterminate = selectedCount > 0 && !allSelected;
          }}
          onChange={(e) => onToggleGroup(group, e.target.checked)}
        />
        {COLUMN_GROUP_LABELS[group]}
        <span className="text-xs font-normal text-muted-foreground">
          {selectedCount}/{columns.length}
        </span>
      </label>

      <div className="grid grid-cols-1 gap-x-4 gap-y-1 pl-6 sm:grid-cols-2">
        {columns.map((c) => (
          <label
            key={c.key}
            className="flex cursor-pointer items-center gap-2 text-sm text-muted-foreground"
          >
            <input
              type="checkbox"
              className="size-3.5 accent-[#6366f1]"
              checked={selected.has(c.key)}
              onChange={() => onToggleColumn(c.key)}
            />
            {c.label}
          </label>
        ))}
      </div>
    </div>
  );
}

export function SurveyLongExportModal({
  open,
  onClose,
  surveyId,
  surveyName,
}: {
  open: boolean;
  onClose: () => void;
  surveyId: number;
  surveyName: string;
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set(ALL_COLUMN_KEYS));
  const [busy, setBusy] = useState(false);

  const [tab, setTab] = useState<ExportTab>('columns');
  const [filters, setFilters] = useState<ExportFilterState>(NO_FILTERS);
  const [filterOptions, setFilterOptions] = useState<FilterOptions | null>(null);

  const filterParams = exportFilterParams(filters);
  const filterKey = JSON.stringify(filterParams);
  const activeFilterCount = Object.keys(filterParams).length;

  /**
   * Rows the export would have with the current filters, tagged with the filters
   * it was counted for: while it does not match `filterKey` a new count is on
   * its way, and the figure on screen is stale.
   */
  const [count, setCount] = useState<{
    /** null when the count could not be fetched: no preview, download allowed. */
    rowCount: number | null;
    maxRows: number | null;
    key: string;
  } | null>(null);
  const countFresh = count?.key === filterKey;
  const overLimit =
    count?.rowCount != null && count.maxRows != null && count.rowCount > count.maxRows;
  const noRows = count?.rowCount === 0;

  /** Opening on the Filters tab only happens once, on the first over-limit count. */
  const autoOpenedFilters = useRef(false);

  /** Questionnaires of this survey and patient groups, loaded on first need. */
  const loadFilterOptions = async () => {
    if (filterOptions) return;
    try {
      const r = await apiClient.get('/dashboard/filters');
      const survey = (r.data.data.surveys ?? []).find((s: { id: number }) => s.id === surveyId);
      setFilterOptions({
        questionnaires: (survey?.questionnaires ?? []).map((q: { id: number; title: string }) => ({
          label: q.title,
          value: String(q.id),
        })),
        groups: (r.data.data.groups ?? []).map((g: { id: number; name: string }) => ({
          label: g.name,
          value: String(g.id),
        })),
      });
    } catch {
      // The selects just stay empty; dates, access mode and status still work.
    }
  };

  const openTab = (next: ExportTab) => {
    setTab(next);
    if (next === 'filters') void loadFilterOptions();
  };

  // Live row count. Debounced, since typing a date changes the filters on every
  // keystroke; `cancelled` drops the answer of a count the filters moved past.
  useEffect(() => {
    let cancelled = false;
    const timer = setTimeout(() => {
      apiClient
        .get(`/dashboard/download/surveys/${surveyId}/export/count`, {
          params: JSON.parse(filterKey),
        })
        .then((r) => {
          if (cancelled) return;
          const { rowCount, maxRows } = r.data.data as { rowCount: number; maxRows: number };
          setCount({ rowCount, maxRows, key: filterKey });
          // Too large as it stands: take the user straight to where it can be fixed.
          if (rowCount > maxRows && !autoOpenedFilters.current) {
            autoOpenedFilters.current = true;
            openTab('filters');
          }
        })
        .catch(() => {
          // No preview then; the download itself still reports any problem.
          if (!cancelled) setCount({ rowCount: null, maxRows: null, key: filterKey });
        });
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
    // openTab only reads state setters and the options cache.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [surveyId, filterKey]);

  const toggleColumn = (key: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const toggleGroup = (group: ColumnGroup, checked: boolean) =>
    setSelected((prev) => {
      const next = new Set(prev);
      for (const c of EXPORT_COLUMNS) {
        if (c.group !== group) continue;
        if (checked) next.add(c.key);
        else next.delete(c.key);
      }
      return next;
    });

  const handleDownload = async () => {
    setBusy(true);
    try {
      const resp = await apiClient.get(`/dashboard/download/surveys/${surveyId}/export`, {
        params: {
          // The dashboard dock filters are deliberately not sent: by default the
          // download is the whole survey. Only the dialog's own filters narrow it.
          ...filterParams,
          // Send the selection only when it is a real subset, so the default
          // request stays a plain "everything".
          ...(selected.size === ALL_COLUMN_KEYS.length
            ? {}
            : { columns: ALL_COLUMN_KEYS.filter((k) => selected.has(k)).join(',') }),
        },
        responseType: 'blob',
        // The client default is 10s; a large export takes much longer than that.
        timeout: 0,
      });

      const disposition = resp.headers['content-disposition'] as string | undefined;
      const match = disposition?.match(/filename="?([^"]+)"?/);

      const href = URL.createObjectURL(resp.data as Blob);
      const a = document.createElement('a');
      a.href = href;
      a.download = match?.[1] ?? `survey_${surveyId}_long.xlsx`;
      a.click();
      URL.revokeObjectURL(href);
      onClose();
    } catch (err) {
      // The live count normally prevents this; data can still change in between.
      toast.error((await readErrorBody(err)).message);
    } finally {
      setBusy(false);
    }
  };

  const rows = count?.rowCount != null ? count.rowCount.toLocaleString('en-US') : null;
  const limit = count?.maxRows != null ? count.maxRows.toLocaleString('en-US') : null;
  const countLabel = !count
    ? 'Counting rows…'
    : rows === null
      ? 'Row count unavailable'
      : `${rows} rows (limit ${limit})`;

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) onClose();
      }}
    >
      {/* Capped to the viewport: header, tabs and footer stay put and only the
          tab body scrolls. */}
      <DialogContent className="flex max-h-[90vh] max-w-2xl flex-col rounded-2xl border-0 p-5 shadow-xl sm:p-8">
        <DialogHeader>
          <DialogTitle className="text-lg font-semibold">Export survey data</DialogTitle>
        </DialogHeader>

        <p className="text-sm text-muted-foreground">
          Long format (one row per answer) as XLSX, for <strong>{surveyName}</strong>. By default it
          contains the whole survey, regardless of the filters selected in the dashboard.
        </p>

        <Tabs
          value={tab}
          onValueChange={(v) => openTab(v as ExportTab)}
          className="flex min-h-0 flex-1 flex-col gap-4"
        >
          <TabsList className="h-auto shrink-0 rounded-full bg-muted p-1">
            <TabsTrigger value="columns" className={TAB_TRIGGER_CLASS}>
              Columns
              <span className="text-xs">
                {selected.size}/{ALL_COLUMN_KEYS.length}
              </span>
            </TabsTrigger>
            <TabsTrigger value="filters" className={TAB_TRIGGER_CLASS}>
              Filters
              {activeFilterCount > 0 && <span className="text-xs">{activeFilterCount}</span>}
              {(overLimit || noRows) && (
                <>
                  {/* White on the active (primary) pill, where amber would lack contrast */}
                  <AlertTriangle
                    className="size-3.5 text-amber-700 in-data-[state=active]:text-white"
                    aria-hidden="true"
                  />
                  <span className="sr-only">
                    {overLimit ? '(export over the row limit)' : '(no rows to export)'}
                  </span>
                </>
              )}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="columns" className="-mr-2 min-h-0 overflow-y-auto pr-2">
            <div className="mb-3 flex justify-end gap-3 text-xs">
              <button
                type="button"
                className="cursor-pointer text-primary hover:underline"
                onClick={() => setSelected(new Set(ALL_COLUMN_KEYS))}
              >
                Select all
              </button>
              <button
                type="button"
                className="cursor-pointer text-muted-foreground hover:underline"
                onClick={() => setSelected(new Set())}
              >
                Clear all
              </button>
            </div>
            <div className="space-y-4">
              {COLUMN_GROUPS.map((group) => (
                <ColumnGroupSection
                  key={group}
                  group={group}
                  selected={selected}
                  onToggleColumn={toggleColumn}
                  onToggleGroup={toggleGroup}
                />
              ))}
            </div>
          </TabsContent>

          <TabsContent
            value="filters"
            className="-mr-2 flex min-h-0 flex-col gap-4 overflow-y-auto pr-2"
          >
            {overLimit ? (
              <p className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
                <AlertTriangle className="mt-0.5 size-4 shrink-0" />
                <span>
                  {activeFilterCount > 0
                    ? 'With these filters the export has'
                    : 'The whole survey has'}{' '}
                  <strong>{rows}</strong> rows, over the {limit} row limit. Narrow it down to
                  download it.
                </span>
              </p>
            ) : noRows ? (
              <p className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
                <AlertTriangle className="mt-0.5 size-4 shrink-0" />
                <span>No answers match these filters: there is nothing to export.</span>
              </p>
            ) : (
              <p className="text-sm text-muted-foreground">
                Optional. Leave them empty to export the whole survey.
              </p>
            )}
            <ExportFiltersPanel value={filters} onChange={setFilters} options={filterOptions} />
            {activeFilterCount > 0 && (
              <button
                type="button"
                className="cursor-pointer self-start text-xs text-muted-foreground hover:underline"
                onClick={() => setFilters(NO_FILTERS)}
              >
                Clear filters
              </button>
            )}
          </TabsContent>
        </Tabs>

        <div className="flex shrink-0 flex-col gap-3 border-t pt-4 sm:flex-row sm:items-center sm:justify-between">
          {/* Live, so a changed count is announced; staleness is said in words
              rather than by fading the text (which would break its contrast). */}
          <span
            role="status"
            aria-live="polite"
            className={`text-xs ${
              overLimit || noRows ? 'font-medium text-amber-700' : 'text-muted-foreground'
            }`}
          >
            {countLabel}
            {count && !countFresh ? ' (updating…)' : ''} · {selected.size} of{' '}
            {ALL_COLUMN_KEYS.length} columns
            {activeFilterCount > 0
              ? ` · ${activeFilterCount} filter${activeFilterCount === 1 ? '' : 's'}`
              : ''}
          </span>
          <Button
            onClick={handleDownload}
            // Disabled while the count is being refreshed too, so a click cannot
            // go out on filters the figure on screen does not describe.
            disabled={busy || selected.size === 0 || !countFresh || overLimit || noRows}
            aria-busy={busy || !countFresh}
            className="cursor-pointer rounded-full bg-[#4d7c0f] px-8 font-semibold text-white hover:opacity-90"
          >
            <Download className="mr-2 size-4" />
            {busy ? 'Preparing…' : 'Download'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
