/**
 * Descriptive statistics for the score cross-tab charts.
 *
 * The heatmap needs a single central value per cell, the boxplot needs the full
 * five-number summary plus outliers — both come from the same computation.
 */

export interface DistributionStats {
  /** Number of observations. */
  n: number;
  mean: number;
  median: number;
  /** First quartile (25th percentile). */
  q1: number;
  /** Third quartile (75th percentile). */
  q3: number;
  /** Lowest value still within 1.5·IQR of q1 — the lower whisker. */
  whiskerLow: number;
  /** Highest value still within 1.5·IQR of q3 — the upper whisker. */
  whiskerHigh: number;
  /** Values beyond the whiskers. */
  outliers: number[];
}

/**
 * Linear-interpolation percentile (the "type 7" definition used by R's default
 * `quantile()` and by numpy), so results line up with what analysts get there.
 */
function percentile(sorted: number[], p: number): number {
  if (sorted.length === 1) return sorted[0];
  const pos = (sorted.length - 1) * p;
  const lower = Math.floor(pos);
  const upper = Math.ceil(pos);
  if (lower === upper) return sorted[lower];
  return sorted[lower] + (pos - lower) * (sorted[upper] - sorted[lower]);
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * Computes the summary of one group of score values.
 *
 * Returns `null` for an empty input: a cell with no observations must be drawn
 * as absent, not as a zero, or the heatmap would read as "this group scores 0".
 */
export function describe(values: number[]): DistributionStats | null {
  if (values.length === 0) return null;

  const sorted = [...values].sort((a, b) => a - b);
  const n = sorted.length;

  const mean = sorted.reduce((sum, v) => sum + v, 0) / n;
  const median = percentile(sorted, 0.5);
  const q1 = percentile(sorted, 0.25);
  const q3 = percentile(sorted, 0.75);

  // Tukey's 1.5·IQR convention: whiskers reach the furthest observation still
  // inside the fence, and anything past it is reported as an outlier.
  const iqr = q3 - q1;
  const lowFence = q1 - 1.5 * iqr;
  const highFence = q3 + 1.5 * iqr;

  const inside = sorted.filter((v) => v >= lowFence && v <= highFence);
  const outliers = sorted.filter((v) => v < lowFence || v > highFence);

  return {
    n,
    mean: round2(mean),
    median: round2(median),
    q1: round2(q1),
    q3: round2(q3),
    whiskerLow: round2(inside.length > 0 ? inside[0] : sorted[0]),
    whiskerHigh: round2(inside.length > 0 ? inside[inside.length - 1] : sorted[n - 1]),
    outliers: outliers.map(round2),
  };
}
