/**
 * Resolves the per-scale score that belongs to a single exported item row.
 *
 * Scores live in `survey_questionnaire_patients_assignment.scores` (JSONB), keyed
 * by `module_<id>` and split into CTT scales and IRT dimensions. One score covers
 * a whole scale, so every item of that scale for that patient reports the same
 * value — that repetition falls out of resolving per row, no extra work needed.
 *
 * The payload is untrusted `Json`: older assignments may hold `null`, `{}` or a
 * legacy shape, and a blind `.find()` on those would crash the export halfway
 * through the response stream. Every access here is defensive.
 */

import { normalizeScaleCode } from '../../config/scaleDimensions.js';
import type { CttScaleScore, IrtDimensionScore } from '../scoring/types.js';

export type ScoreType = 'CTT' | 'IRT' | '';

export interface ResolvedScore {
  scoreType: ScoreType;
  /** null whenever no computed value could be resolved. */
  score: number | null;
}

/** Per-module lookup, both sides keyed by normalised scale code. */
interface ModuleScoreIndex {
  ctt: Map<string, CttScaleScore>;
  irt: Map<string, IrtDimensionScore>;
}

export interface ModuleScoreContext {
  moduleId: number;
  moduleType: string | null;
  dimensionOrder?: string[] | null;
}

const EMPTY: ResolvedScore = { scoreType: '', score: null };

/**
 * The value, but only when the engine marked it `computed`: the export has no
 * status column, so a number the engine flagged (too many missing items, no
 * norms, …) would be indistinguishable from a valid one. Same rule as the
 * Scores tab.
 */
function computedValue(entry: { status?: unknown }, value: unknown): number | null {
  return entry.status === 'computed' && typeof value === 'number' ? value : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Builds the per-module score index for one assignment.
 *
 * Call once per assignment and reuse across all of its rows.
 */
export function indexAssignmentScores(
  scores: unknown,
  modules: ModuleScoreContext[]
): Map<number, ModuleScoreIndex> {
  const index = new Map<number, ModuleScoreIndex>();
  if (!isRecord(scores)) return index;

  for (const module of modules) {
    const raw = scores[`module_${module.moduleId}`];
    if (!isRecord(raw)) continue;

    const ctt = new Map<string, CttScaleScore>();
    const cttScales = raw.ctt_scales;
    if (Array.isArray(cttScales)) {
      for (const entry of cttScales) {
        if (!isRecord(entry) || typeof entry.scale !== 'string') continue;
        const key = normalizeScaleCode(entry.scale, {
          moduleType: module.moduleType,
          dimensionOrder: module.dimensionOrder,
        });
        if (key) ctt.set(key, entry as unknown as CttScaleScore);
      }
    }

    const irt = new Map<string, IrtDimensionScore>();
    const irtDimensions = raw.irt_dimensions;
    if (Array.isArray(irtDimensions)) {
      for (const entry of irtDimensions) {
        if (!isRecord(entry) || typeof entry.dimension !== 'string') continue;
        const key = normalizeScaleCode(entry.dimension, {
          moduleType: module.moduleType,
          dimensionOrder: module.dimensionOrder,
        });
        if (key) irt.set(key, entry as unknown as IrtDimensionScore);
      }
    }

    index.set(module.moduleId, { ctt, irt });
  }

  return index;
}

export interface ResolveScoreArgs {
  moduleId: number;
  moduleType: string | null;
  /** Raw `questions.scale`. */
  scale: string | null;
  /** Raw `questions.score_system` — NULL on every CAT question. */
  scoreSystem: string | null;
  dimensionOrder?: string[] | null;
}

/**
 * Decides which scoring system applies to an item, then looks the value up.
 *
 * Only `computed` values are reported; every other case leaves the score empty.
 */
export function resolveScore(
  index: Map<number, ModuleScoreIndex>,
  args: ResolveScoreArgs
): ResolvedScore {
  const { moduleId, moduleType, scale, scoreSystem, dimensionOrder } = args;

  // Socio-demo and feedback items are not scored, and an item without a scale
  // cannot be attached to one.
  if (moduleType === 'socio-demo' || moduleType === 'feedback' || scale == null) {
    return EMPTY;
  }

  // CAT questions carry no score_system (Question.upsertCat never sets it), but a
  // dynamic module is IRT by construction.
  let scoreType: ScoreType;
  if (scoreSystem === 'CTT') scoreType = 'CTT';
  else if (scoreSystem === 'IRT') scoreType = 'IRT';
  else if (moduleType === 'dynamic') scoreType = 'IRT';
  else return EMPTY;

  const moduleIndex = index.get(moduleId);
  if (!moduleIndex) return { scoreType, score: null };

  const key = normalizeScaleCode(scale, { moduleType, dimensionOrder });
  if (!key) return { scoreType, score: null };

  if (scoreType === 'CTT') {
    const entry = moduleIndex.ctt.get(key);
    return { scoreType, score: entry ? computedValue(entry, entry.t_score) : null };
  }

  const entry = moduleIndex.irt.get(key);
  return { scoreType, score: entry ? computedValue(entry, entry.irt) : null };
}
