/**
 * Full names of the score scales, keyed by the canonical short code that
 * `normalizeScaleCode` produces (`PF`, `PS`, `WISP`…), for display.
 *
 * The names come from three places, because the kit keeps them in three:
 *
 *   - CTT scales: the `name` of each CTT norm entry, the same list scoring uses —
 *     including norms versions defined in the UI, so a renamed scale follows.
 *   - CAT scales: the kit's dynamic template, via CAT_DIMENSION_BY_SCALE_NAME.
 *   - IRT scales of static modules: the kit stores only their code, so their
 *     names are listed below. They are the EORTC QLQ-C30 abbreviations.
 */

import { CAT_DIMENSION_BY_SCALE_NAME, normalizeScaleCode } from './scaleDimensions.js';
import { CTT_SCALE_NORMS } from './cttNorms.js';

const STATIC_IRT_SCALE_NAMES: Record<string, string> = {
  AP: 'Appetite loss',
  CF: 'Cognitive functioning',
  CO: 'Constipation',
  DI: 'Diarrhoea',
  DY: 'Dyspnoea',
  NV: 'Nausea and vomiting',
  QL: 'Global health status / QoL',
};

/** `physical functioning` → `Physical functioning`. */
function sentenceCase(name: string): string {
  return name.charAt(0).toUpperCase() + name.slice(1);
}

/** Norm entries are stored as untrusted JSON: keep only well-formed ones. */
function readNormNames(norms: unknown): { scaleCode: string; name: string }[] {
  if (!Array.isArray(norms)) return [];
  return norms.filter(
    (n): n is { scaleCode: string; name: string } =>
      typeof n?.scaleCode === 'string' && typeof n?.name === 'string' && n.name.trim() !== ''
  );
}

/**
 * Builds the code → name map.
 *
 * `normsSets` are the CTT norms that may apply, least specific first (survey,
 * then its questionnaires), mirroring the precedence scoring uses; a later set
 * overrides an earlier one. The static defaults always come first.
 */
export function scaleDisplayNames(normsSets: unknown[] = []): Record<string, string> {
  const names: Record<string, string> = { ...STATIC_IRT_SCALE_NAMES };

  for (const [scaleName, code] of Object.entries(CAT_DIMENSION_BY_SCALE_NAME)) {
    names[code] = sentenceCase(scaleName);
  }

  for (const norms of [CTT_SCALE_NORMS, ...normsSets]) {
    for (const { scaleCode, name } of readNormNames(norms)) {
      const code = normalizeScaleCode(scaleCode);
      // The norms name some scales with an `S_` prefix (`S_Physical Symptoms`):
      // an import artefact, not part of the name.
      if (code) names[code] = name.replace(/^S_/, '').trim();
    }
  }

  return names;
}
