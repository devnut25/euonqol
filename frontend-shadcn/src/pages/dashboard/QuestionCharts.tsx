import { DevnutSelect } from '@/components/DevnutSelect';
import { ChartColumnBig, ChartPie } from 'lucide-react';
import { useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

/**
 * The answer-distribution charts shared by the Demographics, Static, Dynamic and
 * Feedback tabs: one card per question, with a bar/donut switch, and a picker
 * that shows one question at a time.
 */

// ─── Types ────────────────────────────────────────────────────────────────────

export interface DataPoint {
  label: string;
  count: number;
  percentage: number;
}

export type ChartType = 'donut' | 'horizontal_bar' | 'histogram';

export interface ChartQuestion {
  /** Stable identifier of the question, for the picker. */
  key: string;
  text: string;
  /** The shape the API picked for the data; the card's switch can override it. */
  chartType: ChartType;
  totalResponses: number;
  data: DataPoint[];
}

// ─── Palette ──────────────────────────────────────────────────────────────────

/**
 * Categorical palette for the donut slices, in fixed order: eight distinct hues
 * validated for colour-vision deficiencies, where shades of one purple could no
 * longer be told apart past four or five options.
 */
const CATEGORICAL = [
  '#2a78d6',
  '#eb6834',
  '#1baf7a',
  '#eda100',
  '#e87ba4',
  '#008300',
  '#4a3aa7',
  '#e34948',
];

/** Bars carry their label on the axis, so they share one colour. */
const BAR_COLOR = '#6366f1';

/** Up to this count the axis shows every integer; past it, ticks thin out. */
const MAX_UNIT_TICKS = 20;

/**
 * Ticks for a count axis: one per unit (0, 1, 2…) while that stays readable,
 * so every chart reads on the same step.
 */
function countAxis(data: DataPoint[]) {
  const max = Math.max(1, ...data.map((d) => d.count));
  return max <= MAX_UNIT_TICKS
    ? { ticks: Array.from({ length: max + 1 }, (_, i) => i), domain: [0, max] as [number, number] }
    : { domain: [0, 'auto'] as [number, string] };
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function SectionCard({
  title,
  sub,
  action,
  children,
}: {
  title: string;
  sub?: string;
  /** Rendered top-right, beside the title. */
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border bg-card shadow-sm px-5 py-4">
      <div className="mb-0.5 flex items-start justify-between gap-3">
        {/* text-primary, not #6366f1: that one is 4.46:1 on white, under AA */}
        <h2 className="text-sm font-semibold text-primary">{title}</h2>
        {action && <div className="shrink-0">{action}</div>}
      </div>
      {sub && <p className="text-xs text-muted-foreground mb-3">{sub} responses</p>}
      {children}
    </div>
  );
}

type ChartMode = 'bar' | 'donut';

/** Bar/donut switch shown in the top-right corner of each question card. */
function ChartModeToggle({
  mode,
  onChange,
}: {
  mode: ChartMode;
  onChange: (mode: ChartMode) => void;
}) {
  const options: { value: ChartMode; label: string; Icon: typeof ChartPie }[] = [
    { value: 'bar', label: 'Bar chart', Icon: ChartColumnBig },
    { value: 'donut', label: 'Donut chart', Icon: ChartPie },
  ];

  return (
    <div role="group" aria-label="Chart type" className="flex items-center gap-1">
      {options.map(({ value, label, Icon }) => (
        <button
          key={value}
          type="button"
          onClick={() => onChange(value)}
          title={label}
          aria-label={label}
          aria-pressed={mode === value}
          // Same colours as the navbar icon buttons (see NavbarIconItem).
          className={`inline-flex size-7 cursor-pointer items-center justify-center rounded-full transition-colors ${
            mode === value
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

// ─── Custom tooltip ───────────────────────────────────────────────────────────

function ChartTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload as DataPoint;
  return (
    <div className="bg-white border rounded-lg shadow-md px-3 py-2 text-xs">
      <p className="font-semibold text-foreground">{d.label}</p>
      <p className="text-primary">
        {d.count} ({d.percentage}%)
      </p>
    </div>
  );
}

// ─── Donut chart ──────────────────────────────────────────────────────────────

function DonutChart({ data }: { data: DataPoint[] }) {
  return (
    <div className="flex flex-wrap items-center gap-4 sm:gap-6">
      <ResponsiveContainer width={180} height={180}>
        <PieChart accessibilityLayer={false}>
          <Pie
            data={data}
            dataKey="count"
            nameKey="label"
            cx="50%"
            cy="50%"
            innerRadius={50}
            outerRadius={80}
            paddingAngle={2}
            stroke="#ffffff"
            strokeWidth={2}
          >
            {data.map((_, i) => (
              <Cell key={i} fill={CATEGORICAL[i]} />
            ))}
          </Pie>
          <Tooltip content={<ChartTooltip />} />
        </PieChart>
      </ResponsiveContainer>
      <div className="flex flex-col gap-1.5">
        {data.map((d, i) => (
          <div key={d.label} className="flex items-center gap-2 text-xs">
            <span
              className="inline-block size-3 rounded-full shrink-0"
              style={{ backgroundColor: CATEGORICAL[i] }}
            />
            <span className="text-foreground">{d.label}</span>
            <span className="text-muted-foreground ml-1">
              {d.count} ({d.percentage}%)
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Horizontal bar chart ─────────────────────────────────────────────────────

function HorizontalBarChart({ data }: { data: DataPoint[] }) {
  return (
    <ResponsiveContainer width="100%" height={Math.max(120, data.length * 36)}>
      <BarChart
        data={data}
        layout="vertical"
        margin={{ left: 8, right: 32, top: 4, bottom: 4 }}
        accessibilityLayer={false}
      >
        <CartesianGrid horizontal={false} strokeDasharray="3 3" stroke="#f0f0f0" />
        <XAxis
          type="number"
          allowDecimals={false}
          {...countAxis(data)}
          tick={{ fontSize: 11 }}
          tickLine={false}
          axisLine={false}
        />
        <YAxis
          type="category"
          dataKey="label"
          width={130}
          tick={{ fontSize: 11 }}
          tickLine={false}
          axisLine={false}
        />
        <Tooltip content={<ChartTooltip />} />
        <Bar dataKey="count" radius={[0, 4, 4, 0]} fill={BAR_COLOR}>
          <LabelList dataKey="count" position="right" fontSize={11} fill="#334155" />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

// ─── Histogram (vertical bar with bucket labels) ──────────────────────────────

function HistogramChart({ data }: { data: DataPoint[] }) {
  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart
        data={data}
        margin={{ left: 0, right: 8, top: 16, bottom: 4 }}
        accessibilityLayer={false}
      >
        <CartesianGrid vertical={false} strokeDasharray="3 3" stroke="#f0f0f0" />
        <XAxis dataKey="label" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
        <YAxis
          allowDecimals={false}
          {...countAxis(data)}
          tick={{ fontSize: 11 }}
          tickLine={false}
          axisLine={false}
        />
        <Tooltip content={<ChartTooltip />} />
        <Bar dataKey="count" radius={[4, 4, 0, 0]} fill={BAR_COLOR}>
          <LabelList dataKey="count" position="top" fontSize={11} fill="#334155" />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

// ─── Question card ────────────────────────────────────────────────────────────

export function QuestionChartCard({ question }: { question: ChartQuestion }) {
  // The backend still picks the shape that suits the data; the toggle only lets
  // the user override it per card.
  const [pickedMode, setMode] = useState<ChartMode>(
    question.chartType === 'donut' ? 'donut' : 'bar'
  );
  // Past the palette's eight hues a donut could not give each slice its own
  // colour, so those questions stay as bars.
  const donutFits = question.data.length <= CATEGORICAL.length;
  const mode = donutFits ? pickedMode : 'bar';

  // Nothing to draw: no answers yet, or an open question, whose answers are
  // free text with no options to count.
  if (question.data.length === 0) {
    return (
      <SectionCard title={question.text} sub={String(question.totalResponses)}>
        <p className="text-xs italic text-muted-foreground">
          {question.totalResponses === 0
            ? 'No answers in the selected data.'
            : 'Free-text answers: no distribution to chart.'}
        </p>
      </SectionCard>
    );
  }

  return (
    <SectionCard
      title={question.text}
      sub={String(question.totalResponses)}
      action={donutFits ? <ChartModeToggle mode={mode} onChange={setMode} /> : undefined}
    >
      {/* The chart itself is hidden from screen readers, which get the same
          figures as the list below instead. */}
      {/* `inert` rather than aria-hidden alone: recharts makes the chart
          focusable, and a hidden element must not take focus. */}
      <div aria-hidden="true" inert>
        {mode === 'donut' ? (
          <DonutChart data={question.data} />
        ) : question.chartType === 'histogram' ? (
          // Numeric buckets keep the vertical form, which preserves their order.
          <HistogramChart data={question.data} />
        ) : (
          <HorizontalBarChart data={question.data} />
        )}
      </div>
      <ul className="sr-only">
        {question.data.map((d) => (
          <li key={d.label}>
            {d.label}: {d.count} ({d.percentage}%)
          </li>
        ))}
      </ul>
    </SectionCard>
  );
}

// ─── Question picker + cards ──────────────────────────────────────────────────

/**
 * One question at a time by default: there are many, and scrolling through all
 * of them to find one was the main complaint. "All" brings the grid back.
 */
export function QuestionChartBrowser({
  questions,
  label,
  allLabel,
  loading = false,
}: {
  questions: ChartQuestion[];
  /** Picker label: "Variable" for demographics, "Question" elsewhere. */
  label: string;
  allLabel: string;
  /** Dims the cards while newer data loads, instead of unmounting them. */
  loading?: boolean;
}) {
  /**
   * Question shown, by key: undefined until the user picks one (the first
   * question then), '' for all of them at once.
   */
  const [picked, setPicked] = useState<string | undefined>(undefined);

  if (questions.length === 0) return null;

  const current = picked === undefined ? questions[0] : questions.find((q) => q.key === picked);
  const shown = picked === '' ? questions : [current ?? questions[0]];

  return (
    <div className="flex flex-col gap-4">
      <div className="w-full sm:max-w-xl">
        <DevnutSelect
          label={label}
          searchable
          searchPlaceholder={`Search ${label.toLowerCase()}…`}
          value={picked === '' ? '' : (current ?? questions[0]).key}
          onValueChange={(v) => setPicked(v ?? '')}
          options={questions.map((q) => ({ label: q.text, value: q.key }))}
          showAllOption
          allOptionLabel={allLabel}
          placeholder={allLabel}
          triggerClassName="w-full text-xs"
        />
      </div>

      <div
        aria-busy={loading}
        className={`grid grid-cols-1 gap-4 transition-opacity ${
          shown.length > 1 ? 'md:grid-cols-2' : ''
        } ${loading ? 'opacity-50' : ''}`}
      >
        {shown.map((q) => (
          <QuestionChartCard key={q.key} question={q} />
        ))}
      </div>
    </div>
  );
}
