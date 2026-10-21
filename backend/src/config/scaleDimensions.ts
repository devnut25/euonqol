/**
 * Scale code normalisation.
 *
 * The same construct is named three different ways across the kit, and the data
 * export has to reconcile them to attach a score to each item:
 *
 *   | context                | questions.scale        | key inside assignment.scores      |
 *   |------------------------|------------------------|-----------------------------------|
 *   | CTT, static module     | 'PS_S'                 | ctt_scales[].scale      = 'PS_S'   |
 *   | IRT, static module     | 'PF_S'                 | irt_dimensions[].dim    = 'PF_S'   |
 *   | CAT, dynamic module    | 'Physical functioning' | irt_dimensions[].dim    = 'PF'     |
 *
 * `irtScoringService` pushes `dimension: scale` (the raw value) for IRT items
 * inside static modules, while `scoringOrchestrator` stores the CAT engine's own
 * short dimension key for dynamic modules. Normalising BOTH sides through
 * `normalizeScaleCode` is what makes the three rows above line up.
 */

/**
 * CAT scale names as they appear in `questions.scale` for `question_kind = 'cat'`
 * (the `Scale` column of the dynamic kit template), mapped to the short dimension
 * keys used by the CAT engine (the `dimensionOrder` entries of cat_settings).
 */
export const CAT_DIMENSION_BY_SCALE_NAME: Record<string, string> = {
  'emotional functioning': 'EF',
  fatigue: 'FA',
  'financial difficulties': 'FI',
  pain: 'PA',
  'physical functioning': 'PF',
  'role functioning': 'RF',
  'social functioning': 'SF',
  'insomnia/sleep disturbances': 'SL',
};

/** Matches values that are already short codes, with or without the `_S` suffix. */
const SHORT_CODE_RE = /^[A-Z][A-Z0-9]{1,6}(_S)?$/;

/** Values already reported as unmappable, so the warning is logged once per value. */
const warnedScales = new Set<string>();

export interface NormalizeScaleContext {
  /** Module type — `dynamic` enables the cat_setting fallback. */
  moduleType?: string | null;
  /**
   * `dimensionOrder` of the module's cat_setting. Every EUonQoL CAT setting
   * declares exactly one dimension, so a single-entry list authoritatively
   * identifies the module's scale even for names missing from the map above.
   */
  dimensionOrder?: string[] | null;
}

/**
 * Reduces any of the three scale spellings to a single canonical short code
 * (`'PF_S'`, `'PF'` and `'Physical functioning'` all become `'PF'`).
 *
 * Returns `null` when the value cannot be resolved — callers must then leave the
 * score empty rather than guess, since a wrong match would silently attach one
 * scale's score to another scale's items.
 */
export function normalizeScaleCode(
  scale: string | null | undefined,
  ctx: NormalizeScaleContext = {}
): string | null {
  if (scale == null) return null;

  const trimmed = scale.trim();
  if (!trimmed) return null;

  // Already a short code: 'PF_S' → 'PF', 'WISP' → 'WISP'
  if (SHORT_CODE_RE.test(trimmed)) {
    return trimmed.replace(/_S$/, '');
  }

  // Full CAT scale name: 'Physical functioning' → 'PF'
  const mapped = CAT_DIMENSION_BY_SCALE_NAME[trimmed.toLowerCase()];
  if (mapped) return mapped;

  // Runtime fallback: a dynamic module whose cat_setting declares exactly one
  // dimension can only be measuring that dimension. Keeps the export working
  // when the kit template introduces a CAT scale the map does not know yet.
  if (ctx.moduleType === 'dynamic' && ctx.dimensionOrder?.length === 1) {
    return ctx.dimensionOrder[0];
  }

  if (!warnedScales.has(trimmed)) {
    warnedScales.add(trimmed);
    console.warn(
      `[Export] Unmappable scale code "${trimmed}" — scores for its items will be left empty`
    );
  }
  return null;
}

/** Test helper: clears the warn-once memo so warnings can be asserted in isolation. */
export function resetScaleWarnings(): void {
  warnedScales.clear();
}
