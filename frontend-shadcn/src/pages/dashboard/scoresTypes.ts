/** Shared types for the Scores cross-tab, mirroring `scoresController.ts`. */

/** The raw 0-100 CTT score is not offered: the T-score is the comparable one. */
export type ScoreMetric = 'ctt_t' | 'irt';

export const ALL_SCORE_METRICS: ScoreMetric[] = ['ctt_t', 'irt'];

/**
 * One metric, or `all` of them on the same chart. That works as is because a
 * scale is scored by one system only and the CAT puts IRT on the same T metric
 * as CTT; a scale found under both is shown twice, as "PF (CTT)" / "PF (IRT)".
 */
export type MetricSelection = ScoreMetric | 'all';

/** The metric pills, in display order: All first, then a divider, then each system. */
export const METRIC_SELECTIONS: MetricSelection[] = ['all', ...ALL_SCORE_METRICS];

export interface DistributionStats {
  n: number;
  mean: number;
  median: number;
  q1: number;
  q3: number;
  whiskerLow: number;
  whiskerHigh: number;
  outliers: number[];
}

export interface CrossCell {
  category: string;
  scale: string;
  /** null when no respondent falls in this combination. */
  stats: DistributionStats | null;
}

export interface CrossTabData {
  survey: { id: number; name: string };
  metric: MetricSelection;
  question: { id: number; code: string; text: string; answerType: string } | null;
  respondents?: number;
  categories: string[];
  scales: string[];
  cells: CrossCell[];
}

export interface CrossOptions {
  survey: { id: number; name: string };
  respondents: number;
  questions: { id: number; code: string; text: string; answerType: string }[];
  // Optional on purpose: this comes off the wire, so the maps themselves may be
  // absent (older backend build, or the empty-result branch) — the type forces
  // callers to guard instead of crashing on a missing key.
  scalesByMetric?: Partial<Record<MetricSelection, string[]>>;
  /** Entries present but never computed, per metric — explains an empty metric. */
  skippedByMetric?: Partial<Record<MetricSelection, number>>;
  /** Full scale names by short code (`PF` → `Physical functioning`), for display. */
  scaleNames?: Record<string, string>;
  metrics: { value: ScoreMetric; label: string }[];
}

/**
 * Full name of a scale as shown in the charts, or undefined when unknown. Also
 * resolves the `PF (CTT)` / `PF (IRT)` form the `all` selection uses on a clash.
 */
export function scaleFullName(
  names: Record<string, string> | undefined,
  scale: string
): string | undefined {
  if (!names) return undefined;
  return names[scale] ?? names[scale.replace(/ \((CTT|IRT)\)$/, '')];
}

export type ChartKind = 'heatmap' | 'radar';

/**
 * The demographic variable that breaks nothing down: every respondent in one
 * category, to read the scores of the whole sample.
 */
export const OVERALL_VARIABLE = 'overall';

/** Short label for the metric pills — the full names were too long. */
export const METRIC_PILL_LABEL: Record<MetricSelection, string> = {
  ctt_t: 'CTT',
  irt: 'IRT',
  all: 'All',
};

/** Short, human-readable name for a metric, for axis titles and legends. */
export const METRIC_SHORT_LABEL: Record<MetricSelection, string> = {
  ctt_t: 'T-score',
  irt: 'IRT',
  all: 'CTT + IRT',
};
