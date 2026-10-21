import { ChevronRight } from 'lucide-react';
import { useId } from 'react';
import {
  Area,
  AreaChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

const ACCENT = '#6366f1';

export interface SurveyCardData {
  id: number;
  name: string;
  status: string;
  startingDate: string | null;
  endDate: string | null;
  maxCompletions: number | null;
  questionnaireCount: number;
  totalCompletions: number;
  totalInProgress: number;
  totalPatients: number;
  completionSeries: { label: string; value: number }[];
}

const STATUS_STYLES: Record<string, string> = {
  public: 'bg-emerald-100 text-emerald-700',
  draft: 'bg-amber-100 text-amber-700',
  disabled: 'bg-gray-100 text-gray-600',
  completed: 'bg-blue-100 text-blue-700',
};

function StatusBadge({ status }: { status: string }) {
  const cls = STATUS_STYLES[status] ?? 'bg-gray-100 text-gray-600';
  return (
    <span className={`rounded-full px-2 py-0.5 text-xs font-medium capitalize ${cls}`}>
      {status}
    </span>
  );
}

/** `DD/MM/YYYY`, or null when the date is missing or unparsable. */
function formatDate(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString('en-GB');
}

/** Renders the survey period, omitting whichever bound is missing. */
function periodLabel(startingDate: string | null, endDate: string | null): string | null {
  const from = formatDate(startingDate);
  const to = formatDate(endDate);
  if (from && to) return `${from} – ${to}`;
  if (from) return `From ${from}`;
  if (to) return `Until ${to}`;
  return null;
}

/** One sentence saying what the completions chart shows, for screen readers. */
function chartDescription(series: { label: string; value: number }[], target: number | null) {
  const first = series[0];
  const last = series[series.length - 1];
  const reached = last ? `${last.value} completions by ${last.label}` : 'no completions';
  const from = first && first !== last ? `, starting from ${first.value} on ${first.label}` : '';
  const goal = target && target > 0 ? `, against a target of ${target}` : '';
  return `Cumulative completions chart: ${reached}${from}${goal}.`;
}

/**
 * Cumulative completions across the selected period, with the survey target as a
 * dashed reference line.
 *
 * The curve is cumulative *within the filtered range*, so its last point matches
 * the completions figure shown below it on the card.
 */
function CompletionsChart({
  series,
  target,
}: {
  series: { label: string; value: number }[];
  target: number | null;
}) {
  // One card per survey, all rendering this chart: the gradient id has to be
  // unique per instance or every area would reference the first one defined.
  // Declared before the early return, since hooks must run on every render.
  const rawId = useId();
  const gradientId = `completions-${rawId.replace(/:/g, '')}`;

  if (series.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center text-xs text-muted-foreground">
        No completions in the selected period
      </div>
    );
  }

  const peak = series[series.length - 1]?.value ?? 0;
  // Keep the target line inside the plot when it is within reach, but do not let
  // a far-off target flatten the curve into nothing.
  const domainMax =
    target && target > 0 && target <= peak * 3 ? Math.max(target, peak) : Math.max(peak, 1);

  return (
    <div className="flex min-h-[136px] flex-1 flex-col gap-1">
      {/* Says what the Y axis counts — "cumulative" is not readable off the curve */}
      <span className="text-xs font-medium text-muted-foreground">Cumulative completions</span>

      {/* A concrete minimum height: with `min-h-0` the flex child can measure 0
          during layout (notably inside the carousel), and recharts then warns
          about a -1 × -1 chart and draws nothing. */}
      <div
        className="min-h-[110px] flex-1"
        // The chart is drawn, not written: this is its text alternative.
        role="img"
        aria-label={chartDescription(series, target)}
      >
        <ResponsiveContainer width="100%" height="100%" minWidth={0}>
          {/* accessibilityLayer off: the wrapper is the image, the SVG must not take focus */}
          <AreaChart
            data={series}
            margin={{ top: 6, right: 6, bottom: 0, left: 0 }}
            accessibilityLayer={false}
          >
            <defs>
              <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={ACCENT} stopOpacity={0.35} />
                <stop offset="100%" stopColor={ACCENT} stopOpacity={0.02} />
              </linearGradient>
            </defs>

            <XAxis
              dataKey="label"
              tick={{ fontSize: 9 }}
              tickLine={false}
              axisLine={false}
              interval="preserveStartEnd"
              minTickGap={24}
            />
            <YAxis
              tick={{ fontSize: 9 }}
              tickLine={false}
              axisLine={false}
              allowDecimals={false}
              width={26}
              domain={[0, domainMax]}
            />
            <Tooltip
              formatter={(value) => [`${value ?? 0} completions`, '']}
              labelFormatter={(label) => `By ${label}`}
              contentStyle={{ fontSize: 11, borderRadius: 8 }}
            />

            {target && target > 0 && (
              <ReferenceLine
                y={target}
                // slate-600: >= 3:1 for the line, >= 4.5:1 for its label
                stroke="#475569"
                strokeDasharray="4 4"
                label={{
                  value: `Target ${target}`,
                  position: 'insideTopRight',
                  fontSize: 9,
                  fill: '#475569',
                }}
              />
            )}

            <Area
              type="monotone"
              dataKey="value"
              stroke={ACCENT}
              strokeWidth={2}
              fill={`url(#${gradientId})`}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

function Metric({ value, label }: { value: number | string; label: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-2xl font-bold text-foreground">{value}</span>
      <span className="text-xs text-muted-foreground">{label}</span>
    </div>
  );
}

export function SurveyCard({ survey, onSelect }: { survey: SurveyCardData; onSelect: () => void }) {
  const period = periodLabel(survey.startingDate, survey.endDate);

  return (
    // La card non e' piu' cliccabile per intero: il solo punto che porta al
    // download e' il link in alto a destra, cosi' leggere i dati della survey e
    // navigare altrove restano due gesti distinti.
    <div className="flex h-full min-h-72 w-full flex-col gap-4 rounded-xl border bg-card p-6 text-left shadow-sm">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        {/* h2: the next level under the page's h1, no level skipped */}
        <h2 className="line-clamp-2 text-base font-semibold text-foreground" title={survey.name}>
          {survey.name}
        </h2>

        <button
          type="button"
          onClick={onSelect}
          title={`Open download data for ${survey.name}`}
          // Every card has one of these: the visible "Download" alone does not
          // say which survey it opens.
          aria-label={`Open download data for ${survey.name}`}
          className="-mr-1 -mt-1 inline-flex shrink-0 cursor-pointer items-center gap-1 rounded-full px-2 py-1 text-xs font-medium text-primary transition-colors hover:bg-[#ececec] focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none"
        >
          Download
          <ChevronRight className="size-3.5" aria-hidden="true" />
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <StatusBadge status={survey.status} />
        <span className="text-xs text-muted-foreground">
          {survey.questionnaireCount}{' '}
          {survey.questionnaireCount === 1 ? 'questionnaire' : 'questionnaires'}
        </span>
      </div>

      {period && <span className="text-xs text-muted-foreground">{period}</span>}

      {/* Cumulative completions towards the target */}
      <CompletionsChart series={survey.completionSeries} target={survey.maxCompletions} />

      {/* Metrics */}
      <div className="grid grid-cols-3 gap-3 border-t pt-4">
        <Metric value={survey.totalCompletions} label="Completed" />
        <Metric value={survey.totalInProgress} label="In progress" />
        <Metric value={survey.totalPatients} label="Enrolled patients" />
      </div>
    </div>
  );
}
