/**
 * Pure utility functions for CTT item-level scoring.
 *
 * All functions are stateless and side-effect-free — safe to unit-test
 * without mocking databases or external services.
 */

import { CTT_SCALE_NORMS, CttNormEntry } from '../../config/cttNorms.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ItemDirection = 'positive' | 'negative' | null;

export class ScoringError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ScoringError';
  }
}

// ---------------------------------------------------------------------------
// Item-level scoring
// ---------------------------------------------------------------------------

/**
 * Transforms a raw item response value to a 0–100 scale.
 *
 * Formula (direct):   score = ((RS - min) / (max - min)) * 100
 * Formula (inverse):  score = 100 - direct_score
 *
 * @param rawValue  The numeric answer_options.value selected by the patient.
 * @param min       Minimum value in the answer profile (derived from answer_options).
 * @param max       Maximum value in the answer profile (derived from answer_options).
 * @param direction questions.direction: 'positive' (direct), 'negative' (reverse), or null (treated as direct).
 * @throws ScoringError if range is 0.
 */
export function scoreItem(
  rawValue: number,
  min: number,
  max: number,
  direction: ItemDirection
): number {
  const range = max - min;
  if (range === 0) {
    throw new ScoringError(`Cannot score item: min and max are both ${min} (range = 0)`);
  }

  const directScore = ((rawValue - min) / range) * 100;
  return direction === 'negative' ? 100 - directScore : directScore;
}

// ---------------------------------------------------------------------------
// Missing threshold check
// ---------------------------------------------------------------------------

/**
 * Returns true if the scale can be scored (missing items do not exceed the threshold).
 *
 * Rule: score is computable if missing_count <= floor(total_items / 2)
 */
export function isMissingWithinThreshold(missingCount: number, totalItems: number): boolean {
  return missingCount <= Math.floor(totalItems / 2);
}

// ---------------------------------------------------------------------------
// Scale-level aggregation
// ---------------------------------------------------------------------------

/**
 * Computes the mean of an array of item scores (0–100).
 * Returns null for empty arrays to avoid NaN propagation.
 */
export function meanScore(itemScores: number[]): number | null {
  if (itemScores.length === 0) return null;
  const sum = itemScores.reduce((acc, v) => acc + v, 0);
  return sum / itemScores.length;
}

// ---------------------------------------------------------------------------
// T-score computation
// ---------------------------------------------------------------------------

/**
 * Computes the T-score for a scale using a provided normative reference array.
 *
 * Formula: T = 50 + 10 * ((ScaleScore_0_100 - average) / SD)
 *
 * @param norms  Array of {name, scaleCode, average, sd} entries.
 *               Falls back to CTT_SCALE_NORMS (static file) if not provided.
 * @returns null if the scaleCode is not found in the norms array.
 */
export function computeTScore(
  scaleScore0_100: number,
  scaleCode: string,
  norms: CttNormEntry[] = CTT_SCALE_NORMS
): number | null {
  const norm = norms.find((n) => n.scaleCode === scaleCode);
  if (!norm) {
    return null;
  }
  return 50 + 10 * ((scaleScore0_100 - norm.average) / norm.sd);
}
