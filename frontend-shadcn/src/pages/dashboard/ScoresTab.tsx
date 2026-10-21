import apiClient from '@/api/client';
import { DevnutSelect } from '@/components/DevnutSelect';
import { Grid3x3, Radar as RadarIcon } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { ScoresHeatmap } from './ScoresHeatmap';
import { ScoresRadar } from './ScoresRadar';
import {
  ALL_SCORE_METRICS,
  METRIC_PILL_LABEL,
  METRIC_SELECTIONS,
  METRIC_SHORT_LABEL,
  OVERALL_VARIABLE,
  scaleFullName,
  type ChartKind,
  type CrossOptions,
  type CrossTabData,
  type MetricSelection,
} from './scoresTypes';
import { useFilterParams, type Filters } from './downloadFilters';

function Skeleton({ className }: { className?: string }) {
  return <div className={`animate-pulse bg-muted rounded ${className ?? ''}`} />;
}

function Panel({ children }: { children: React.ReactNode }) {
  return <div className="rounded-xl border bg-card p-5 shadow-sm">{children}</div>;
}

/** Same colours as the navbar icon buttons, like the other dashboard toggles. */
function IconToggle<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: { value: T; label: string; Icon: typeof Grid3x3 }[];
  onChange: (value: T) => void;
}) {
  return (
    <div role="group" aria-label="Chart type" className="flex items-center gap-1">
      {options.map(({ value: v, label, Icon }) => (
        <button
          key={v}
          type="button"
          onClick={() => onChange(v)}
          title={label}
          aria-label={label}
          aria-pressed={value === v}
          className={`inline-flex size-7 cursor-pointer items-center justify-center rounded-full transition-colors ${
            value === v
              ? 'bg-primary text-white hover:bg-[#554fa3] hover:text-white'
              : 'bg-[#F9F9F9] text-primary hover:bg-[#ececec]'
          }`}
        >
          <Icon className="size-4" aria-hidden="true" />
        </button>
      ))}
    </div>
  );
}

export function ScoresTab({ filters }: { filters: Filters }) {
  const { surveyId } = filters;

  const [options, setOptions] = useState<CrossOptions | null>(null);
  const [data, setData] = useState<CrossTabData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loadingOptions, setLoadingOptions] = useState(false);
  const [loadingChart, setLoadingChart] = useState(false);

  // Chart configuration
  const [questionId, setQuestionId] = useState<string>('');
  const [metric, setMetric] = useState<MetricSelection>('all');
  const [chart, setChart] = useState<ChartKind>('heatmap');

  /**
   * User's scale picks, or null while they have not narrowed anything down.
   *
   * Kept as an override instead of being synced to the available scales through
   * an effect: switching metric simply clears it, and the effective set is
   * derived below.
   */
  const [scaleOverride, setScaleOverride] = useState<Set<string> | null>(null);

  const dockParams = useFilterParams(filters);

  // ── What this survey can be crossed by ─────────────────────────────────────
  useEffect(() => {
    if (!surveyId) {
      setOptions(null);
      setData(null);
      return;
    }

    // `cancelled` guards against a slow response overwriting a newer one when
    // the filters change in quick succession.
    let cancelled = false;

    const load = async () => {
      setLoadingOptions(true);
      setError(null);
      try {
        const r = await apiClient.get('/dashboard/scores/options', {
          params: { surveyId, ...dockParams },
        });
        if (cancelled) return;

        const opts: CrossOptions = r.data.data;
        setOptions(opts);
        // The whole sample first: a breakdown is a refinement of it.
        setQuestionId(OVERALL_VARIABLE);
        // All by default: it covers whichever system the survey scores with.
        setMetric('all');
        setScaleOverride(null);
      } catch {
        if (!cancelled) setError('Failed to load the options for this survey');
      } finally {
        if (!cancelled) setLoadingOptions(false);
      }
    };

    load();
    return () => {
      cancelled = true;
    };
  }, [surveyId, dockParams]);

  const availableScales = useMemo(() => options?.scalesByMetric?.[metric] ?? [], [options, metric]);

  // Derived rather than stored: no effect needed to keep them in range.
  const selectedScales = useMemo(
    () => scaleOverride ?? new Set(availableScales),
    [scaleOverride, availableScales]
  );

  /** Switching metric invalidates the scale picks, which belong to the old one. */
  const handleMetricChange = (next: MetricSelection) => {
    setMetric(next);
    setScaleOverride(null);
  };

  const toggleScale = (scale: string) =>
    setScaleOverride((prev) => {
      const next = new Set(prev ?? availableScales);
      if (next.has(scale)) next.delete(scale);
      else next.add(scale);
      return next;
    });

  // ── The cross-tab itself ───────────────────────────────────────────────────
  const scalesQuery = [...selectedScales].sort().join(',');
  // The Scales row can be emptied through its All pill; there is nothing to draw
  // then, and an empty `scales` param would mean "every scale" to the API.
  const noScalesPicked = selectedScales.size === 0;
  const allScalesSelected =
    availableScales.length > 0 && availableScales.every((s) => selectedScales.has(s));

  useEffect(() => {
    if (!surveyId || !questionId || noScalesPicked) {
      setData(null);
      return;
    }

    let cancelled = false;

    const load = async () => {
      setLoadingChart(true);
      setError(null);
      try {
        const r = await apiClient.get('/dashboard/scores/cross', {
          params: {
            surveyId,
            questionId,
            metric,
            ...(scalesQuery ? { scales: scalesQuery } : {}),
            ...dockParams,
          },
        });
        if (!cancelled) setData(r.data.data);
      } catch {
        if (!cancelled) setError('Failed to load the score distribution');
      } finally {
        if (!cancelled) setLoadingChart(false);
      }
    };

    load();
    return () => {
      cancelled = true;
    };
  }, [surveyId, questionId, metric, scalesQuery, noScalesPicked, dockParams]);

  // ── No survey chosen ───────────────────────────────────────────────────────
  if (!surveyId) {
    return (
      <div className="rounded-xl border bg-card px-6 py-12 text-center text-sm text-muted-foreground shadow-sm">
        Pick a survey in the filters on the left to build a score chart.
      </div>
    );
  }

  if (loadingOptions) {
    return (
      <div className="flex flex-col gap-6" role="status" aria-busy="true">
        <span className="sr-only">Loading score options…</span>
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-80 w-full" />
      </div>
    );
  }

  if (error) {
    return (
      <div
        role="alert"
        className="rounded-xl border bg-destructive/10 px-6 py-8 text-center text-sm text-destructive"
      >
        {error}
      </div>
    );
  }

  if (!options) return null;

  if (availableScales.length === 0) {
    return (
      <div className="rounded-xl border bg-card px-6 py-12 text-center text-sm text-muted-foreground shadow-sm">
        This survey has no computed scores yet.
      </div>
    );
  }

  const unavailableMetrics = ALL_SCORE_METRICS.filter(
    (m) => (options.scalesByMetric?.[m] ?? []).length === 0
  );

  return (
    <div className="flex flex-col gap-6">
      {/* ── Chart builder ───────────────────────────────────────────────────── */}
      <Panel>
        <div className="flex flex-col gap-5">
          {/* Variable and score sit side by side: they are the two axes of the
              cross-tab and are always chosen together. */}
          <div className="flex flex-wrap items-end gap-6">
            <div className="w-full min-w-0 sm:w-auto sm:min-w-64 sm:flex-1">
              <DevnutSelect
                label="Demographic variable"
                searchable
                searchPlaceholder="Search variable…"
                value={questionId}
                onValueChange={(v) => setQuestionId(v ?? OVERALL_VARIABLE)}
                options={[
                  { label: 'All respondents (no breakdown)', value: OVERALL_VARIABLE },
                  ...options.questions.map((q) => ({ label: q.text, value: String(q.id) })),
                ]}
                placeholder="Select a variable"
                showAllOption={false}
                triggerClassName="w-full text-xs"
              />
            </div>

            <div className="flex w-full flex-col gap-1 sm:w-auto">
              {/* mx-1 matches the label DevnutSelect draws, so the three align */}
              <span id="scores-metric-label" className="mx-1 text-sm font-medium">
                Score
              </span>
              {/* Segmented, like the dashboard tabs: one choice among three */}
              <div
                role="group"
                aria-labelledby="scores-metric-label"
                className="flex w-full items-center rounded-full bg-muted p-0.5 sm:w-auto"
              >
                {METRIC_SELECTIONS.map((m) => {
                  const count = (options.scalesByMetric?.[m] ?? []).length;
                  const skipped = options.skippedByMetric?.[m] ?? 0;
                  const unavailable = count === 0;
                  // "All" names no single system, so it gets its own wording.
                  const what = m === 'all' ? 'CTT or IRT' : METRIC_PILL_LABEL[m];

                  return (
                    <button
                      key={m}
                      type="button"
                      aria-pressed={metric === m}
                      disabled={unavailable}
                      onClick={() => handleMetricChange(m)}
                      // neutral-600: muted-foreground on the muted track is under
                      // WCAG AA's 4.5:1.
                      className={`flex-1 whitespace-nowrap rounded-full px-4 py-1 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary sm:flex-none ${
                        unavailable
                          ? 'cursor-not-allowed text-muted-foreground/50'
                          : metric === m
                            ? 'cursor-pointer bg-primary text-white shadow-sm hover:bg-[#554fa3]'
                            : 'cursor-pointer text-neutral-600 hover:text-foreground'
                      }`}
                      title={
                        unavailable
                          ? skipped > 0
                            ? `No ${what} scores available: ${skipped} value${
                                skipped === 1 ? '' : 's'
                              } exist but were never computed`
                            : `No ${what} score has been computed for this survey yet`
                          : `${METRIC_SHORT_LABEL[m]} · ${count} scale${count === 1 ? '' : 's'}`
                      }
                    >
                      {METRIC_PILL_LABEL[m]}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Why a metric cannot be picked, rather than just greying it out */}
          {unavailableMetrics.map((m) => {
            const skipped = options.skippedByMetric?.[m] ?? 0;
            return (
              <p key={m} className="-mt-3 text-xs text-muted-foreground">
                {METRIC_SHORT_LABEL[m]} unavailable:{' '}
                {skipped > 0
                  ? `${skipped} value${skipped === 1 ? '' : 's'} present but not computed (scoring did not complete).`
                  : 'no scores of this kind in the selected data.'}
              </p>
            );
          })}

          {/* Scales */}
          <div className="flex flex-col gap-2 border-t pt-4">
            <div className="mx-1 flex items-baseline justify-between gap-3">
              <span id="scores-scales-label" className="text-sm font-medium">
                Scales
                <span className="ml-2 text-xs font-normal text-muted-foreground">
                  {selectedScales.size} of {availableScales.length} selected
                </span>
              </span>
              {/* One action that flips: select every scale, or clear them all
                    once they already are. */}
              <button
                type="button"
                onClick={() => setScaleOverride(allScalesSelected ? new Set() : null)}
                className="cursor-pointer rounded text-xs font-medium text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              >
                {allScalesSelected ? 'Clear all' : 'Select all'}
              </button>
            </div>
            <div
              role="group"
              aria-labelledby="scores-scales-label"
              className="flex flex-wrap items-center gap-1.5"
            >
              {availableScales.map((scale) => {
                const on = selectedScales.has(scale);
                return (
                  <button
                    key={scale}
                    type="button"
                    aria-pressed={on}
                    title={scaleFullName(options.scaleNames, scale)}
                    onClick={() => toggleScale(scale)}
                    // Unselected ones are outlined, so on/off reads at a glance.
                    className={`min-w-11 cursor-pointer rounded-full border px-3 py-1 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-1 ${
                      on
                        ? 'border-primary bg-primary text-white hover:bg-[#554fa3]'
                        : 'border-primary/40 bg-card text-primary hover:bg-primary/5'
                    }`}
                  >
                    {scale}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </Panel>

      {/* ── Chart ───────────────────────────────────────────────────────────── */}
      <Panel>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-col">
            <h2 className="text-sm font-semibold text-primary">
              {data?.question?.text ?? 'Score distribution'}
            </h2>
            <span className="text-xs text-muted-foreground">
              {METRIC_SHORT_LABEL[metric]}
              {data?.respondents != null && ` · ${data.respondents} respondents`}
            </span>
          </div>

          <div className="flex items-center gap-4">
            <IconToggle
              value={chart}
              onChange={setChart}
              options={[
                { value: 'heatmap', label: 'Heatmap', Icon: Grid3x3 },
                { value: 'radar', label: 'Radar (profile per group)', Icon: RadarIcon },
              ]}
            />
          </div>
        </div>

        {noScalesPicked ? (
          <p className="py-10 text-center text-sm text-muted-foreground">
            Pick at least one scale to draw the chart.
          </p>
        ) : loadingChart ? (
          <div role="status" aria-busy="true">
            <span className="sr-only">Loading chart…</span>
            <Skeleton className="h-72 w-full" />
          </div>
        ) : !data || data.categories.length === 0 ? (
          <p className="py-10 text-center text-sm text-muted-foreground">
            No respondents match the current filters for this variable.
          </p>
        ) : chart === 'heatmap' ? (
          <ScoresHeatmap data={data} scaleNames={options.scaleNames} />
        ) : (
          <ScoresRadar data={data} scaleNames={options.scaleNames} />
        )}
      </Panel>
    </div>
  );
}
