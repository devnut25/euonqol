import apiClient from '@/api/client';
import { useEffect, useState } from 'react';
import { useFilterParams, type Filters } from './downloadFilters';
import { QuestionChartBrowser, type ChartType, type DataPoint } from './QuestionCharts';

// ─── Types ────────────────────────────────────────────────────────────────────

interface SocioDemoQuestion {
  question_id: number;
  question_code: string;
  question_text: string;
  answer_type: string;
  chart_type: ChartType;
  total_responses: number;
  data: DataPoint[];
}

interface SocioData {
  totalRespondents: number;
  questions: SocioDemoQuestion[];
}

interface Props {
  filters: Filters;
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function Skeleton({ className }: { className?: string }) {
  return <div className={`animate-pulse bg-muted rounded ${className ?? ''}`} />;
}

// ─── Main component ───────────────────────────────────────────────────────────

export function SocioTab({ filters }: Props) {
  const [data, setData] = useState<SocioData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const { surveyId } = filters;
  const params = useFilterParams(filters);

  useEffect(() => {
    // Nothing to load until a survey is picked: see the prompt below.
    if (!params.surveyId) return;

    // `cancelled` drops the answer of a request the filters have since moved past:
    // without it a slower, older response could land last and overwrite the
    // current one (typing a date fires one request per intermediate value).
    let cancelled = false;
    setLoading(true);
    setError(null);

    apiClient
      .get('/dashboard/socio', { params })
      .then((r) => {
        if (!cancelled) setData(r.data.data);
      })
      .catch(() => {
        if (!cancelled) setError('Failed to load demographic data');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [params]);

  // ── No survey chosen ───────────────────────────────────────────────────────
  if (!surveyId) {
    return (
      <div className="rounded-xl border bg-card shadow-sm px-6 py-12 text-center text-muted-foreground text-sm">
        Pick a survey in the filters on the left to see its demographic data.
      </div>
    );
  }

  // ── Loading ────────────────────────────────────────────────────────────────
  // The skeleton only covers the first load. On a reload the current cards stay
  // (dimmed, below): unmounting them would reset every card's bar/donut choice.
  if (loading && !data?.questions.length) {
    return (
      <div className="flex flex-col gap-6" role="status" aria-busy="true">
        <span className="sr-only">Loading demographic data…</span>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="rounded-xl border bg-card shadow-sm px-5 py-4">
              <Skeleton className="h-4 w-48 mb-4" />
              <Skeleton className="h-40 w-full" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  // ── Error ──────────────────────────────────────────────────────────────────
  if (error && !loading) {
    return (
      <div
        role="alert"
        className="rounded-xl border bg-card shadow-sm px-6 py-12 text-center text-destructive text-sm"
      >
        {error}
      </div>
    );
  }

  // ── Empty ──────────────────────────────────────────────────────────────────
  if (!data || data.questions.length === 0) {
    return (
      <div className="rounded-xl border bg-card shadow-sm px-6 py-12 text-center text-muted-foreground text-sm">
        No demographic data available for the selected filters.
      </div>
    );
  }

  // ── Content ────────────────────────────────────────────────────────────────
  return (
    <QuestionChartBrowser
      label="Variable"
      allLabel="All variables"
      loading={loading}
      questions={data.questions.map((q) => ({
        key: q.question_code,
        text: q.question_text,
        chartType: q.chart_type,
        totalResponses: q.total_responses,
        data: q.data,
      }))}
    />
  );
}
