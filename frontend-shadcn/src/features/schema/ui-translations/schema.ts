import { t } from 'i18next';

// Runtime placeholders of the public UI strings (e.g. "{name}"): replaced by the
// questionnaire page, so a translation must keep every one of them.
const PLACEHOLDER_RE = /\{[a-zA-Z]+\}/g;

const placeholdersOf = (text: string | null | undefined) =>
  Array.from(new Set(text?.match(PLACEHOLDER_RE) ?? []));

/**
 * Validates one translation against its English reference.
 * @returns the error message, or null when valid (an empty value is valid: it falls back to English)
 */
export const validateUiTranslation = (
  reference: string | null | undefined,
  value: string
): string | null => {
  if (value.length > 2000) return t('settings:ui_translations.form.too_long', { max: 2000 });
  if (!value.trim()) return null;
  const missing = placeholdersOf(reference).filter((p) => !value.includes(p));
  return missing.length > 0
    ? t('settings:ui_translations.form.placeholder_missing', { tokens: missing.join(', ') })
    : null;
};
