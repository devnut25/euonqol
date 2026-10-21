/**
 * Pulls per-scale score values out of `assignment.scores` (JSONB).
 *
 * The payload is keyed by module and split into CTT scales and IRT dimensions,
 * each with its own metrics. For a cross-tab we need the opposite shape: one
 * value per scale for the chosen metric, flattened across modules.
 *
 * Scale keys are normalised through `normalizeScaleCode`, so the same construct
 * lands under one key whether it came from a static module (`PF_S`) or an
 * adaptive one (`PF`) — see that module for why the spellings differ.
 *
 * The JSONB is untrusted: older assignments may hold `null`, `{}` or a legacy
 * shape, so every access here is defensive.
 */

import { normalizeScaleCode } from '../../config/scaleDimensions.js';

/**
 * Which number to read off each scale.
 *
 * The CTT raw 0-100 score is deliberately not offered: the T-score is the
 * normalised, comparable figure and is what the analysis works with.
 */
export type ScoreMetric = 'ctt_t' | 'irt';

export const SCORE_METRICS: { value: ScoreMetric; label: string }[] = [
  { value: 'ctt_t', label: 'T-score (CTT)' },
  { value: 'irt', label: 'IRT' },
];

export const ALL_SCORE_METRICS: ScoreMetric[] = ['ctt_t', 'irt'];

export function isScoreMetric(value: unknown): value is ScoreMetric {
  return value === 'ctt_t' || value === 'irt';
}

/**
 * What the Scores tab can ask for: one metric, or `all` of them together.
 *
 * `all` works because a scale is scored by one system only, and the CAT puts its
 * IRT score on the same T metric as CTT: the values can share an axis as they
 * are, with no conversion.
 */
export type MetricSelection = ScoreMetric | 'all';

export function isMetricSelection(value: unknown): value is MetricSelection {
  return value === 'all' || isScoreMetric(value);
}

const METRIC_SUFFIX: Record<ScoreMetric, string> = { ctt_t: 'CTT', irt: 'IRT' };

/**
 * Names the scales of both metrics in one namespace.
 *
 * A scale should come from one system only; if the data has it under both
 * anyway, both are kept as `PF (CTT)` / `PF (IRT)` rather than one silently
 * overwriting the other.
 */
function combinedLabel(scale: string, metric: ScoreMetric, inBoth: Set<string>): string {
  return inBoth.has(scale) ? `${scale} (${METRIC_SUFFIX[metric]})` : scale;
}

/** Scales present under both metrics anywhere in the given assignments. */
function scalesInBoth(ctt: Iterable<string>, irt: Iterable<string>): Set<string> {
  const irtSet = new Set(irt);
  return new Set([...ctt].filter((s) => irtSet.has(s)));
}

/**
 * Scale list for `all`: the union of both metrics' scales, labelled with
 * {@link combinedLabel}.
 */
export function combinedScales(cttScales: string[], irtScales: string[]): string[] {
  const inBoth = scalesInBoth(cttScales, irtScales);
  return [
    ...cttScales.map((s) => combinedLabel(s, 'ctt_t', inBoth)),
    ...irtScales.map((s) => combinedLabel(s, 'irt', inBoth)),
  ].sort();
}

/**
 * Builds the per-assignment extractor for a selection.
 *
 * For `all` the clashes are decided once over the whole set of assignments, so
 * a scale gets the same label in every one of them.
 */
export function scoreExtractor(
  selection: MetricSelection,
  scoresList: unknown[]
): (scores: unknown) => Map<string, number> {
  if (selection !== 'all') return (scores) => extractScoresByScale(scores, selection);

  const ctt = new Set<string>();
  const irt = new Set<string>();
  for (const scores of scoresList) {
    for (const scale of extractScoresByScale(scores, 'ctt_t').keys()) ctt.add(scale);
    for (const scale of extractScoresByScale(scores, 'irt').keys()) irt.add(scale);
  }
  const inBoth = scalesInBoth(ctt, irt);

  return (scores) => {
    const merged = new Map<string, number>();
    for (const metric of ALL_SCORE_METRICS) {
      for (const [scale, value] of extractScoresByScale(scores, metric)) {
        merged.set(combinedLabel(scale, metric, inBoth), value);
      }
    }
    return merged;
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

/**
 * Flattens one assignment's scores into `scale → value` for the given metric.
 *
 * Only entries whose status is `computed` are kept: a scale that fell back to
 * `missing_too_many_items` or `no_norms` has no usable number, and letting a
 * null through would distort every statistic downstream.
 *
 * When the same scale appears in more than one module (possible, since a scale
 * can be measured both statically and adaptively) the first computed value wins.
 */
export function extractScoresByScale(
  scores: unknown,
  metric: ScoreMetric
): Map<string, number> {
  const result = new Map<string, number>();
  if (!isRecord(scores)) return result;

  for (const moduleEntry of Object.values(scores)) {
    if (!isRecord(moduleEntry)) continue;

    const list = metric === 'irt' ? moduleEntry.irt_dimensions : moduleEntry.ctt_scales;
    if (!Array.isArray(list)) continue;

    for (const entry of list) {
      if (!isRecord(entry)) continue;
      if (entry.status !== 'computed') continue;

      const rawKey = metric === 'irt' ? entry.dimension : entry.scale;
      if (typeof rawKey !== 'string') continue;

      const scale = normalizeScaleCode(rawKey);
      if (!scale || result.has(scale)) continue;

      const value = metric === 'irt' ? readNumber(entry.irt) : readNumber(entry.t_score);

      if (value !== null) result.set(scale, value);
    }
  }

  return result;
}

export interface MetricAvailability {
  /** Scales with a usable value. */
  scales: string[];
  /** Entries that exist but were not computed (cat_error, no_norms, …). */
  skipped: number;
}

/**
 * Same walk as {@link extractScoresByScale}, but reporting what was skipped.
 *
 * Without this an unavailable metric is indistinguishable from one that simply
 * does not exist, and the user is left with an option they cannot select and no
 * reason why.
 */
export function inspectMetric(scoresList: unknown[], metric: ScoreMetric): MetricAvailability {
  const scales = new Set<string>();
  let skipped = 0;

  for (const scores of scoresList) {
    if (!isRecord(scores)) continue;

    for (const moduleEntry of Object.values(scores)) {
      if (!isRecord(moduleEntry)) continue;

      const list = metric === 'irt' ? moduleEntry.irt_dimensions : moduleEntry.ctt_scales;
      if (!Array.isArray(list)) continue;

      for (const entry of list) {
        if (!isRecord(entry)) continue;

        const rawKey = metric === 'irt' ? entry.dimension : entry.scale;
        if (typeof rawKey !== 'string') continue;

        const value = metric === 'irt' ? readNumber(entry.irt) : readNumber(entry.t_score);
        if (entry.status === 'computed' && value !== null) {
          const scale = normalizeScaleCode(rawKey);
          if (scale) scales.add(scale);
        } else {
          skipped++;
        }
      }
    }
  }

  return { scales: [...scales].sort(), skipped };
}
