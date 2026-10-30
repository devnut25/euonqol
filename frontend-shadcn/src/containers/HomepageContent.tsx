import apiClient from '@/api/client';
import { CreateButton } from '@/components/buttons/create-button';
import { useAuth } from '@/hooks/useAuth';
import { cn } from '@/lib/tailwind/utils';
import {
  Activity,
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  Circle,
  Clock,
  KeyRound,
  PencilLine,
} from 'lucide-react';
import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Cell, Pie, PieChart, ResponsiveContainer } from 'recharts';

// ─── Types ────────────────────────────────────────────────────────────────────

interface HighlightsData {
  activeSurveys: number;
  draftSurveys: number;
  totalQuestionnaires: number;
  questionnairesCompleted: number;
  patientsEnrolled: number;
  newPatients: number;
}

interface AlertItem {
  id: string;
  type: 'cat_key_expiring' | 'ending_soon' | 'draft' | 'closed_zero';
  surveyId?: number;
  title: string;
  subtitle: string;
  action: 'Update' | 'Remind' | 'Publish' | 'Review';
}

interface ActivityItem {
  id: number;
  accessMode: string;
  status: string;
  patientLabel: string;
  questionnaireTitle: string;
  surveyName: string;
  timestamp: string;
}

interface OngoingSurvey {
  id: number;
  name: string;
  starting_date: string;
  end_date: string;
  access_mode?: string;
  status?: string;
  completionRate?: number;
}

function extractFirstName(fullName?: string, email?: string): string {
  const raw = fullName?.trim() || email?.split('@')[0] || 'there';
  // split on space, dot, underscore or hyphen — take the first token
  const first = raw.split(/[\s._-]+/)[0] ?? raw;
  return first.charAt(0).toUpperCase() + first.slice(1).toLowerCase();
}

function getGreeting(name: string) {
  const hour = new Date().getHours();
  if (hour < 12) return `Good morning, ${name}!`;
  if (hour < 18) return `Good afternoon, ${name}!`;
  return `Good evening, ${name}!`;
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  return `${months}mo ago`;
}

// ─── Skeleton ─────────────────────────────────────────────────────────────────

function Sk({ className, style }: { className?: string; style?: React.CSSProperties }) {
  return <div className={cn('animate-pulse bg-muted rounded', className)} style={style} />;
}

// ─── Access mode badge / labels ────────────────────────────────────────────────

const MODE_STYLES: Record<string, string> = {
  traced: 'bg-teal-100 text-teal-800',
  anonymous_on_invitation: 'bg-violet-100 text-violet-800',
  anonymous_spontaneous: 'bg-amber-100 text-amber-800',
};

const MODE_LABELS: Record<string, string> = {
  traced: 'TRACED',
  anonymous_on_invitation: 'ANONYMOUS ON INVITATION',
  anonymous_spontaneous: 'ANONYMOUS SPONTANEOUS',
};

// Nicely-cased (not all-caps) version used as the Gantt row subtitle.
const ACCESS_MODE_TITLE: Record<string, string> = {
  traced: 'Traced',
  anonymous_on_invitation: 'Anonymous On Invitation',
  anonymous_spontaneous: 'Anonymous Spontaneous',
};

function ModeBadge({ mode }: { mode: string }) {
  return (
    <span
      className={cn(
        'inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold capitalize',
        MODE_STYLES[mode] ?? 'bg-gray-100 text-gray-600'
      )}
    >
      * {MODE_LABELS[mode] ?? mode}
    </span>
  );
}

// ─── Completion ring ────────────────────────────────────────────────────────────

function CompletionRing({ percentage, size = 104 }: { percentage: number; size?: number }) {
  const pct = Math.max(0, Math.min(100, Math.round(percentage)));
  const data = [{ value: pct }, { value: 100 - pct }];

  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      {/* Decorative only: the percentage is in the visible text in the centre.
          `inert` + accessibilityLayer={false} keep the recharts SVG out of the tab order. */}
      <div aria-hidden="true" inert>
      <ResponsiveContainer width={size} height={size}>
        <PieChart accessibilityLayer={false}>
          <Pie
            data={data}
            dataKey="value"
            startAngle={90}
            endAngle={-270}
            innerRadius={size * 0.36}
            outerRadius={size * 0.5}
            stroke="none"
            isAnimationActive={false}
          >
            <Cell fill="var(--primary)" />
            <Cell fill="var(--muted)" />
          </Pie>
        </PieChart>
      </ResponsiveContainer>
      </div>
      <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
        <span className="text-3xl font-bold text-foreground">{pct}%</span>
        <span className="text-xs text-muted-foreground">completion</span>
      </div>
    </div>
  );
}

// ─── KPI stat block ─────────────────────────────────────────────────────────────

function KpiStat({ label, value, delta }: { label: string; value: number; delta?: string }) {
  return (
    <div className="flex flex-col items-center text-center gap-1 sm:gap-1.5 min-w-0">
      {/* Wraps on narrow screens; the fixed min-height keeps the values aligned across columns. */}
      <span className="flex items-end justify-center min-h-7 sm:min-h-0 text-[10px] sm:text-xs leading-tight uppercase tracking-normal sm:tracking-wide text-muted-foreground wrap-anywhere sm:whitespace-nowrap">
        {label}
      </span>
      <span className="text-3xl sm:text-4xl font-bold tabular-nums text-foreground">{value}</span>
      {delta && <span className="text-[11px] sm:text-xs text-muted-foreground">{delta}</span>}
    </div>
  );
}

// ─── Hero card ──────────────────────────────────────────────────────────────────

function HeroCard({
  displayName,
  roleLabel,
  highlights,
  highlightsLoading,
  alertsCount,
  onAddSurvey,
  onReviewAlerts,
}: {
  displayName: string;
  roleLabel: string;
  highlights: HighlightsData | null;
  highlightsLoading: boolean;
  alertsCount: number;
  onAddSurvey: () => void;
  onReviewAlerts: () => void;
}) {
  const total = highlights?.totalQuestionnaires ?? 0;
  const completed = highlights?.questionnairesCompleted ?? 0;
  const pct = total > 0 ? Math.round((completed / total) * 100) : 0;

  return (
    <div className="rounded-xl border bg-card shadow-sm p-4 sm:p-6 flex flex-col lg:flex-row items-center gap-6 sm:gap-8">
      <div className="flex flex-col sm:flex-row items-center gap-4 sm:gap-6 flex-1 min-w-0 w-full sm:w-auto text-center sm:text-left">
        {highlightsLoading ? (
          <Sk className="rounded-full shrink-0" style={{ width: 140, height: 140 }} />
        ) : (
          <CompletionRing percentage={pct} size={140} />
        )}

        <div className="flex flex-col gap-3 min-w-0 items-center sm:items-start">
          <div>
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              {roleLabel} · Last month
            </p>
            <h1 className="font-semibold text-black text-xl sm:text-2xl lg:text-3xl text-balance">
              {getGreeting(displayName)}
            </h1>
            <p className="text-sm text-muted-foreground mt-1 max-w-md mx-auto sm:mx-0">
              {highlightsLoading ? (
                <span className="inline-block h-4 w-56 bg-muted animate-pulse rounded" />
              ) : (
                `${completed} of ${total} assigned questionnaires are complete.`
              )}
            </p>
          </div>
          <div className="flex items-center justify-center sm:justify-start gap-2 flex-wrap">
            <CreateButton label="Add survey" onClick={onAddSurvey} />
            {alertsCount > 0 && (
              <button
                type="button"
                onClick={onReviewAlerts}
                className="px-4 py-2 rounded-full border border-border text-sm font-medium text-foreground hover:bg-muted transition-colors"
              >
                Review {alertsCount} alert{alertsCount === 1 ? '' : 's'}
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2 sm:gap-6 lg:gap-14 shrink-0 w-full lg:w-auto justify-center items-start pt-4 border-t sm:pt-0 sm:border-t-0">
        {highlightsLoading
          ? [...Array(3)].map((_, i) => (
              <div key={i} className="flex flex-col items-center gap-2">
                <Sk className="h-3 w-20" />
                <Sk className="h-9 w-12" />
              </div>
            ))
          : [
              {
                label: 'Active surveys',
                value: highlights?.activeSurveys ?? 0,
                delta: highlights?.draftSurveys
                  ? `+${highlights.draftSurveys} draft`
                  : undefined,
              },
              {
                label: 'Active questionnaires',
                value: highlights?.totalQuestionnaires ?? 0,
                delta: highlights?.questionnairesCompleted
                  ? `${highlights.questionnairesCompleted} completed`
                  : undefined,
              },
              {
                label: 'Active patients',
                value: highlights?.patientsEnrolled ?? 0,
                delta: highlights?.newPatients ? `+${highlights.newPatients} this week` : undefined,
              },
            ].map((kpi) => <KpiStat key={kpi.label} {...kpi} />)}
      </div>
    </div>
  );
}

// ─── Needs attention card ───────────────────────────────────────────────────────

const ALERT_ICON: Record<AlertItem['type'], typeof Clock> = {
  cat_key_expiring: KeyRound,
  ending_soon: Clock,
  draft: PencilLine,
  closed_zero: AlertCircle,
};

const ALERT_ICON_STYLE: Record<AlertItem['type'], string> = {
  cat_key_expiring: 'bg-red-50 text-red-600',
  ending_soon: 'bg-red-50 text-red-600',
  draft: 'bg-amber-50 text-amber-700',
  closed_zero: 'bg-amber-50 text-amber-700',
};

function NeedsAttentionCard({
  data,
  loading,
  cardRef,
  headingRef,
}: {
  data: AlertItem[];
  loading: boolean;
  cardRef: React.RefObject<HTMLDivElement | null>;
  headingRef: React.RefObject<HTMLHeadingElement | null>;
}) {
  const navigate = useNavigate();

  return (
    <div ref={cardRef} className="rounded-xl border bg-card shadow-sm p-5 flex flex-col h-96">
      <div className="flex items-center gap-2 mb-4 shrink-0">
        <AlertTriangle size={15} className="text-muted-foreground" />
        <h2
          ref={headingRef}
          tabIndex={-1}
          className="text-base font-semibold text-foreground rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          Needs attention
        </h2>
        {!loading && data.length > 0 && (
          <span className="inline-flex items-center justify-center min-w-5 h-5 px-1.5 rounded-full bg-red-100 text-red-700 text-xs font-semibold">
            {data.length}
          </span>
        )}
      </div>

      <div className="flex-1 overflow-y-auto min-h-0">
        {loading ? (
          <div className="flex flex-col gap-3">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="flex items-center gap-3">
                <Sk className="h-9 w-9 rounded-lg shrink-0" />
                <div className="flex flex-col gap-1 flex-1">
                  <Sk className="h-3 w-40" />
                  <Sk className="h-3 w-56" />
                </div>
              </div>
            ))}
          </div>
        ) : data.length === 0 ? (
          <p className="text-xs text-muted-foreground italic py-2">
            All good — nothing needs attention right now.
          </p>
        ) : (
          <ul className="flex flex-col divide-y divide-border">
            {data.map((item) => {
              const Icon = ALERT_ICON[item.type];
              return (
                <li key={item.id} className="flex items-center gap-3 py-2.5">
                  <span
                    className={cn(
                      'flex items-center justify-center w-9 h-9 rounded-lg shrink-0',
                      ALERT_ICON_STYLE[item.type]
                    )}
                  >
                    <Icon size={16} />
                  </span>
                  <div className="flex flex-col min-w-0 flex-1">
                    <span className="text-sm font-medium text-foreground truncate">
                      {item.title}
                    </span>
                    <span className="text-xs text-muted-foreground truncate">
                      {item.subtitle}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      navigate(
                        item.type === 'cat_key_expiring'
                          ? '/settings?settings_tab=cat-api'
                          : `/survey?surveys_id=${item.surveyId}&surveys_tab=questionnaire`
                      )
                    }
                    aria-label={`${item.action}: ${item.title}`}
                    className="text-xs font-medium text-primary hover:underline shrink-0"
                  >
                    {item.action}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}

// ─── Latest activities card ───────────────────────────────────────────────────

// Distinct shapes, not just colours, tell completed and in-progress apart.
const STATUS_ICON: Record<string, { Icon: typeof Clock; className: string }> = {
  completed: { Icon: CheckCircle2, className: 'text-emerald-700' },
  in_progress: { Icon: Clock, className: 'text-amber-700' },
};

function ActivityStatusIcon({ status }: { status: string }) {
  const { Icon, className } = STATUS_ICON[status] ?? {
    Icon: Circle,
    className: 'text-muted-foreground',
  };
  return <Icon aria-hidden="true" className={cn('mt-0.5 size-3.5 shrink-0', className)} />;
}

function LatestActivitiesCard({ data, loading }: { data: ActivityItem[]; loading: boolean }) {
  const items = data.slice(0, 20);
  return (
    <div className="rounded-xl border bg-card shadow-sm p-5 flex flex-col h-96">
      <div className="flex items-center gap-2 mb-4 shrink-0">
        <Activity size={15} className="text-muted-foreground" />
        <h2 className="text-base font-semibold text-foreground">Latest activities</h2>
      </div>

      <div className="relative flex-1 overflow-y-auto min-h-0">
        {loading ? (
          <div className="flex flex-col gap-4">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="flex items-start gap-2">
                <div className="flex flex-col gap-1.5 flex-1">
                  <div className="flex gap-2">
                    <Sk className="h-3 w-20" />
                    <Sk className="h-3 w-16 rounded-full" />
                  </div>
                  <Sk className="h-3 w-36" />
                </div>
                <Sk className="h-3 w-12 shrink-0" />
              </div>
            ))}
          </div>
        ) : data.length === 0 ? (
          <p className="text-xs text-muted-foreground italic">No recent activity.</p>
        ) : (
          <ul className="flex flex-col gap-3 pr-1">
            {items.map((item) => (
              <li
                key={item.id}
                className="flex items-start justify-between gap-2 pb-2 border-b border-border last:border-0"
              >
                <div className="flex items-start gap-2 min-w-0">
                  <ActivityStatusIcon status={item.status} />
                  <div className="flex flex-col gap-0.5 min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="sr-only">
                        {item.status === 'completed' ? 'Completed: ' : 'In progress: '}
                      </span>
                      <span className="font-medium text-sm truncate">{item.patientLabel}</span>
                      <ModeBadge mode={item.accessMode} />
                    </div>
                    <span className="text-xs text-muted-foreground truncate">
                      {item.questionnaireTitle} · {item.surveyName}
                    </span>
                  </div>
                </div>
                <span className="text-xs text-muted-foreground whitespace-nowrap shrink-0 pt-0.5">
                  {timeAgo(item.timestamp)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

// ─── Gantt timeline ───────────────────────────────────────────────────────────

// Opaque shades (no opacity on the bar, so the label keeps full contrast):
// bar vs track >= 3:1, label vs bar >= 4.5:1.
const GANTT_MODE_COLORS: Record<string, string> = {
  traced: 'bg-teal-600 text-gray-900',
  anonymous_on_invitation: 'bg-violet-600 text-white',
  anonymous_spontaneous: 'bg-amber-600 text-gray-900',
};

const GANTT_MODE_LABELS: Record<string, string> = {
  traced: 'TRACED',
  anonymous_on_invitation: 'ANONYMOUS ON INVITATION',
  anonymous_spontaneous: 'ANONYMOUS SPONTANEOUS',
};

const GANTT_MODE_DOT: Record<string, string> = {
  traced: 'bg-teal-600',
  anonymous_on_invitation: 'bg-violet-600',
  anonymous_spontaneous: 'bg-amber-600',
};

const GANTT_DRAFT_STYLE = 'bg-gray-200 border-2 border-dashed border-gray-600';

function OngoingSurveysGantt({ data, loading }: { data: OngoingSurvey[]; loading: boolean }) {
  const navigate = useNavigate();
  if (loading) {
    return (
      <div className="rounded-xl border bg-card shadow-sm p-5">
        <Sk className="h-5 w-40 mb-4" />
        <div className="flex flex-col gap-3">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="flex items-center gap-3">
              <Sk className="h-3 w-28 shrink-0" />
              <Sk className="h-6 rounded-full flex-1" style={{ width: `${30 + i * 20}%` }} />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (data.length === 0) {
    return (
      <div className="rounded-xl border bg-card shadow-sm p-5">
        <h2 className="text-base font-semibold text-foreground mb-2">Ongoing surveys</h2>
        <p className="text-xs text-muted-foreground italic">No surveys at the moment.</p>
      </div>
    );
  }

  // Date range: left edge = earliest starting_date (no left padding); right edge = latest end_date + 14-day padding
  const startMsList = data.map((s) => new Date(s.starting_date).getTime());
  const endMsList = data.map((s) => new Date(s.end_date).getTime());
  const minMs = Math.min(...startMsList);
  const maxMs = Math.max(...endMsList) + 14 * 86400000;
  const rangeMs = maxMs - minMs;
  const rangeDays = rangeMs / 86400000;

  // Adaptive tick interval — target ~8 ticks max
  let tickIntervalDays: number;
  if (rangeDays <= 60) tickIntervalDays = 7;
  else if (rangeDays <= 180) tickIntervalDays = 14;
  else if (rangeDays <= 365) tickIntervalDays = 30;
  else if (rangeDays <= 730) tickIntervalDays = 60;
  else tickIntervalDays = 90;

  const ticks: { label: string; pct: number }[] = [];
  const tickDate = new Date(minMs);
  while (tickDate.getTime() <= maxMs) {
    ticks.push({
      label: tickDate.toLocaleDateString(undefined, { day: '2-digit', month: 'short' }),
      pct: ((tickDate.getTime() - minMs) / rangeMs) * 100,
    });
    tickDate.setDate(tickDate.getDate() + tickIntervalDays);
  }

  const todayPct = Math.min(100, Math.max(0, ((Date.now() - minMs) / rangeMs) * 100));

  // On narrow screens only every Nth tick is shown (max ~4), so labels don't collide.
  const mobileTickStep = Math.max(1, Math.ceil(ticks.length / 4));

  return (
    <div className="rounded-xl border bg-card shadow-sm p-4 sm:p-5">
      <h2 className="text-base font-semibold text-foreground mb-4">Surveys timeline</h2>

      {/* Tick labels — aligned with the track: label column (152px + gap) on the left, % column (w-8 + gap) on the right */}
      <div className="relative h-5 mb-2 mr-11 sm:ml-41">
        {ticks.map((t, i) => (
          <span
            key={i}
            className={cn(
              'absolute text-[11px] sm:text-xs text-muted-foreground whitespace-nowrap',
              // Keep edge labels inside the axis instead of centring them on the tick.
              t.pct < 5 ? 'translate-x-0' : t.pct > 95 ? '-translate-x-full' : '-translate-x-1/2',
              i % mobileTickStep !== 0 && 'hidden sm:inline'
            )}
            style={{ left: `${t.pct}%` }}
          >
            {t.label}
          </span>
        ))}
      </div>

      {/* Bar rows */}
      <div className="flex flex-col gap-4 sm:gap-2.5">
        {data.map((survey) => {
          const startMs = new Date(survey.starting_date).getTime();
          const endMs = new Date(survey.end_date).getTime();
          const leftPct = ((startMs - minMs) / rangeMs) * 100;
          const widthPct = Math.max(((endMs - startMs) / rangeMs) * 100, 1);
          const clampedWidthPct = Math.min(100 - Math.max(0, leftPct), widthPct);
          const color = GANTT_MODE_COLORS[survey.access_mode ?? ''] ?? 'bg-blue-600 text-white';
          const isDraft = survey.status === 'draft';
          const completionRate = survey.completionRate ?? 0;
          const showLabelInside = !isDraft && clampedWidthPct >= 15;
          const showLabelOutside = !isDraft && !showLabelInside;

          return (
            <div
              key={survey.id}
              role="link"
              tabIndex={0}
              // Mobile: name stacked above a full-width bar. sm+: name column beside the bar.
              className="flex flex-col sm:flex-row sm:items-center gap-1.5 sm:gap-3 cursor-pointer group rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              onClick={() => navigate(`/survey?surveys_id=${survey.id}&surveys_tab=questionnaire`)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  navigate(`/survey?surveys_id=${survey.id}&surveys_tab=questionnaire`);
                }
              }}
              title={`Go to ${survey.name}`}
            >
              <div className="flex flex-col shrink-0 min-w-0 sm:w-38">
                <span
                  className={cn(
                    // Wraps to two lines rather than truncating, so the name is
                    // readable without the hover-only title tooltip.
                    'text-sm sm:text-xs line-clamp-2 wrap-break-word group-hover:underline',
                    isDraft ? 'text-gray-600 italic' : 'text-foreground font-medium'
                  )}
                  title={survey.name}
                >
                  {survey.name}
                </span>
                <span className="text-xs text-muted-foreground truncate">
                  {isDraft ? 'Draft' : (ACCESS_MODE_TITLE[survey.access_mode ?? ''] ?? '')}
                </span>
                <span className="sr-only">
                  {`${survey.status}, from ${new Date(survey.starting_date).toLocaleDateString()} to ${new Date(survey.end_date).toLocaleDateString()}${isDraft ? '' : `, ${completionRate}% complete`}`}
                </span>
              </div>
              <div className="flex items-center gap-3 flex-1 min-w-0">
              {/* Track */}
              <div aria-hidden="true" className="relative flex-1 h-6 bg-muted/50 rounded-full overflow-hidden group-hover:bg-muted/80 transition-colors">
                {/* Today marker — rendered on every row so it's always visible */}
                <div
                  className="absolute top-0 bottom-0 w-0.5 bg-gray-900 ring-1 ring-white z-10"
                  style={{ left: `${todayPct}%` }}
                />
                <div
                  className={cn(
                    'absolute top-0 h-full rounded-full flex items-center justify-end px-2',
                    isDraft ? GANTT_DRAFT_STYLE : color
                  )}
                  style={{
                    left: `${Math.max(0, leftPct)}%`,
                    width: `${clampedWidthPct}%`,
                  }}
                  title={`[${survey.status}] ${new Date(survey.starting_date).toLocaleDateString()} → ${new Date(survey.end_date).toLocaleDateString()}`}
                >
                  {showLabelInside && (
                    <span className="text-xs font-semibold whitespace-nowrap">
                      {completionRate}%<span className="hidden md:inline"> complete</span>
                    </span>
                  )}
                </div>
              </div>
              <span className="text-xs text-muted-foreground shrink-0 w-8 text-right">
                {showLabelOutside ? `${completionRate}%` : ''}
              </span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Legend */}
      <div className="flex items-center justify-center gap-4 mt-3 flex-wrap">
        <p className="text-xs text-foreground flex items-center gap-1">
          <span className="inline-block w-3 h-0.5 bg-gray-900 rounded" /> Today
        </p>
        {Array.from(new Set(data.map((s) => s.access_mode).filter(Boolean))).map((mode) => (
          <p key={mode} className="text-xs text-muted-foreground flex items-center gap-1">
            <span
              className={cn(
                'inline-block w-3 h-2 rounded-sm',
                GANTT_MODE_DOT[mode!] ?? 'bg-blue-600'
              )}
            />
            {GANTT_MODE_LABELS[mode!] ?? mode}
          </p>
        ))}
        {data.some((s) => s.status === 'draft') && (
          <p className="text-xs text-muted-foreground flex items-center gap-1">
            <span className={cn('inline-block w-3 h-2 rounded-sm', GANTT_DRAFT_STYLE)} />
            Draft
          </p>
        )}
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export const HomepageContent: React.FC = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const needsAttentionRef = useRef<HTMLDivElement>(null);
  const needsAttentionHeadingRef = useRef<HTMLHeadingElement>(null);

  const [highlights, setHighlights] = useState<HighlightsData | null>(null);
  const [highlightsLoading, setHighlightsLoading] = useState(true);
  const [alerts, setAlerts] = useState<AlertItem[]>([]);
  const [alertsLoading, setAlertsLoading] = useState(true);
  const [activities, setActivities] = useState<ActivityItem[]>([]);
  const [activitiesLoading, setActivitiesLoading] = useState(true);
  const [ongoingSurveys, setOngoingSurveys] = useState<OngoingSurvey[]>([]);
  const [ganttLoading, setGanttLoading] = useState(true);

  useEffect(() => {
    apiClient
      .get('/homepage/highlights')
      .then((r) => setHighlights(r.data.data))
      .catch(console.error)
      .finally(() => setHighlightsLoading(false));

    apiClient
      .get('/homepage/alerts')
      .then((r) => setAlerts(r.data.data))
      .catch(console.error)
      .finally(() => setAlertsLoading(false));

    apiClient
      .get('/homepage/activities')
      .then((r) => setActivities(r.data.data))
      .catch(console.error)
      .finally(() => setActivitiesLoading(false));

    apiClient
      .get('/homepage/ongoing-surveys')
      .then((r) => setOngoingSurveys(r.data.data))
      .catch(console.error)
      .finally(() => setGanttLoading(false));
  }, []);

  const displayName = extractFirstName(user?.full_name, user?.email);
  const roleLabel = user?.user_type === 'admin' ? 'Administrator' : 'Survey Manager';

  return (
    <div className="flex flex-col gap-6 w-full p-4">
      <HeroCard
        displayName={displayName}
        roleLabel={roleLabel}
        highlights={highlights}
        highlightsLoading={highlightsLoading}
        alertsCount={alerts.length}
        onAddSurvey={() => navigate('/survey?surveys_id=create')}
        onReviewAlerts={() => {
          needsAttentionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
          // Move focus too, so keyboard and screen reader users land on the card.
          needsAttentionHeadingRef.current?.focus({ preventScroll: true });
        }}
      />

      {/* ── Gantt ────────────────────────────────────────────────────────── */}
      <OngoingSurveysGantt data={ongoingSurveys} loading={ganttLoading} />

      {/* ── Needs attention + Latest activities ────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <NeedsAttentionCard
          data={alerts}
          loading={alertsLoading}
          cardRef={needsAttentionRef}
          headingRef={needsAttentionHeadingRef}
        />
        <LatestActivitiesCard data={activities} loading={activitiesLoading} />
      </div>
    </div>
  );
};
