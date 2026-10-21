/**
 * How stored questions and answers read, shared by the dashboard and the data
 * export so both describe them the same way.
 *
 * The player shapes what `responses` holds for its own needs:
 *
 *   - a skip on a question with no "Skipped by…" option seeded in the kit is
 *     saved as the literal text `Skipped by patient` / `Skipped by system`;
 *   - a disclaimer has nothing to answer, yet gets that same skip marker so the
 *     player counts it as seen on resume;
 *   - a multiple-choice socio-demo or feedback answer is the JSON list of the
 *     selected option ids (`[12, 15]`), or `{ ids, text }` when one of the
 *     options carries an "Other, please specify" text.
 */

/** The skip markers the player saves as text, with the value they stand for. */
export const SKIP_MARKERS: Record<string, number> = {
  'Skipped by patient': -1,
  'Skipped by system': -2,
};

export function isSkipMarker(text: string | null | undefined): boolean {
  return text != null && SKIP_MARKERS[text.trim()] !== undefined;
}

/**
 * A question with nothing to answer. Same rule the player uses to render a
 * disclaimer (isDisclaimerQuestion): no answer options and not a text question.
 */
export function isDisclaimer(questionType: string | null, hasOptions: boolean): boolean {
  return !hasOptions && questionType !== 'text';
}

/** The selected ids (and attached text) of a multiple-choice answer, or null. */
export function parseMultipleChoice(
  text: string | null | undefined
): { ids: number[]; text: string } | null {
  const trimmed = text?.trim() ?? '';
  if (!trimmed.startsWith('[') && !trimmed.startsWith('{')) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    return null;
  }
  const isObject = parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed);
  const ids = isObject ? (parsed as { ids?: unknown }).ids : parsed;
  if (!Array.isArray(ids) || !ids.every((id) => typeof id === 'number')) return null;
  const attached = isObject ? (parsed as { text?: unknown }).text : undefined;
  return { ids, text: typeof attached === 'string' ? attached : '' };
}

const HTML_ENTITIES: Record<string, string> = {
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&#39;': "'",
  '&apos;': "'",
  '&nbsp;': ' ',
};

/** Question wording as plain text: the kit stores some of it with HTML markup. */
export function stripHtml(text: string): string {
  if (!text.includes('<') && !text.includes('&')) return text;
  return text
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<[^>]*>/g, '')
    .replace(/&(amp|lt|gt|quot|#39|apos|nbsp);/g, (entity) => HTML_ENTITIES[entity] ?? entity)
    .replace(/\s+/g, ' ')
    .trim();
}
