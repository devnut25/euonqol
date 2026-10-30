/**
 * UI texts of the public questionnaire. Values come only from the DB (Settings › Languages,
 * `GET /public/ui-translations`); keys must match UI_TRANSLATIONS in
 * backend/src/models/UiTranslation.ts.
 */
export interface PublicUIStrings {
  welcome: string;
  chooseLanguage: string;
  languagePlaceholder: string;
  reviewPromptTitle: string;
  reviewPromptDescription: string;
  yesReview: string;
  noSubmit: string;
  reviewSidebarTitle: string;
  submit: string;
  submitting: string;
  prev: string;
  next: string;
  loading: string;
  enterAnswer: string;
  /** Placeholder of the year select (socio-demo 'Date' answers, e.g. "Year of birth"). */
  selectYear: string;
  /** Placeholder of the answer dropdown (single-choice questions with more than 8 options). */
  selectAnswer: string;
  errorSavingAnswer: string;
  errorLoadCat: string;
  errorComplete: string;
  errorLinkInvalid: string;
  errorGeneric: string;
  oops: string;
  yes: string;
  no: string;
  close: string;
  viewAttachment: string;
  iConsent: string;
  iDoNotConsent: string;
  // Screen-reader-only strings (WCAG): status messages and accessible names
  progressLabel: string;
  answered: string;
  notAnswered: string;
  readOnly: string;
  responsesAlreadySaved: string;
  // Why a Next button is inactive (WCAG 3.3.2)
  selectAnswerToContinue: string;
  answerAllToContinue: string;
  // Accessibility menu (floating button) on the public page
  a11yMenu: string;
  a11yTextSize: string;
  a11yIncreaseText: string;
  a11yDecreaseText: string;
  a11yContrast: string;
  a11yGrayscale: string;
  a11yHighlightLinks: string;
  a11yStopAnimations: string;
  a11yReset: string;
  a11yKeyboardTitle: string;
  /** Keyboard help: what each key does (key names stay untranslated). */
  a11yKeyTab: string;
  a11yKeyShiftTab: string;
  a11yKeyEnter: string;
  a11yKeyEscape: string;
  a11yScreenReaderNote: string;
}

// Maps language name variants and DB typos to the canonical lowercase language name.
// Needed because some country codes map to multiple languages (BE, XLU, XMT)
// and the DB has known typos.
export const LANGUAGE_NAME_ALIASES: Record<string, string> = {
  // DB typo: "Duch" instead of "Dutch" (Belgium)
  duch: 'dutch',
  // Language variants that share translations
  'irish-ireland': 'irish',
  'romanian-moldova': 'romanian',
  'romanian-romania': 'romanian',
  // Sámi: no translation available, fall back to English
  sámi: 'english',
  sami: 'english',
};

// ISO 639-1 code (as reported by navigator.languages) -> the English language name
// used in eu_countries.language. This mapping has to live here because eu_countries
// has no ISO code column, so the API can only ever send us the language name.
export const ISO_639_1_TO_LANGUAGE_NAME: Record<string, string> = {
  bg: 'bulgarian',
  cs: 'czech',
  da: 'danish',
  de: 'german',
  el: 'greek',
  en: 'english',
  es: 'spanish',
  et: 'estonian',
  fi: 'finnish',
  fr: 'french',
  ga: 'irish',
  hr: 'croatian',
  hu: 'hungarian',
  it: 'italian',
  ka: 'georgian',
  lb: 'luxemburgish',
  lt: 'lithuanian',
  lv: 'latvian',
  mt: 'maltese',
  nb: 'norwegian',
  nl: 'dutch',
  nn: 'norwegian',
  no: 'norwegian',
  pl: 'polish',
  pt: 'portuguese',
  ro: 'romanian',
  sk: 'slovak',
  sl: 'slovenian',
  sq: 'albanian',
  sr: 'serbian',
  sv: 'swedish',
  tr: 'turkish',
  uk: 'ukrainian',
};

// Aliases that preserve the language IDENTITY: DB typos only. Deliberately kept
// separate from LANGUAGE_NAME_ALIASES, which also maps sámi -> english: that one is
// a fallback for the LABELS (Sámi has no translations), not an equivalence between
// languages, and reusing it here would make an English browser match the Sámi row.
const LANGUAGE_IDENTITY_ALIASES: Record<string, string> = {
  // DB typo: "Duch" instead of "Dutch" (Belgium)
  duch: 'dutch',
};

// eu_countries.language -> canonical comparison key ('Romanian-Moldova' -> 'romanian').
// The '-' split also covers 'Romanian-Romania' and 'Irish-Ireland'.
export function normalizeLanguageName(name: string): string {
  const base = (name ?? '').toLowerCase().trim().split('-')[0];
  return LANGUAGE_IDENTITY_ALIASES[base] ?? base;
}

// Canonical language name -> BCP 47 tag for the `lang` attribute (WCAG 3.1.1/3.1.2),
// so screen readers pronounce the patient's chosen language correctly.
const LANGUAGE_NAME_TO_BCP47: Record<string, string> = {
  ...Object.fromEntries(
    Object.entries(ISO_639_1_TO_LANGUAGE_NAME)
      .filter(([code]) => code !== 'nb' && code !== 'nn')
      .map(([code, name]) => [name, code])
  ),
  sámi: 'se',
  sami: 'se',
};

export function getLanguageTag(langName: string | null | undefined): string {
  return LANGUAGE_NAME_TO_BCP47[normalizeLanguageName(langName ?? '')] ?? 'en';
}

const LANGUAGE_NAME_TO_CODE: Record<string, string> = {
  english: 'en',
  italian: 'it',
  french: 'fr',
  bulgarian: 'bg',
  georgian: 'ka',
  albanian: 'sq',
  croatian: 'hr',
  czech: 'cs',
  danish: 'da',
  dutch: 'nl',
  estonian: 'et',
  finnish: 'fi',
  german: 'de',
  greek: 'el',
  hungarian: 'hu',
  irish: 'ga',
  latvian: 'lv',
  lithuanian: 'lt',
  luxemburgish: 'lb',
  maltese: 'mt',
  norwegian: 'no',
  polish: 'pl',
  portuguese: 'pt',
  romanian: 'ro',
  serbian: 'sr',
  slovak: 'sk',
  slovenian: 'sl',
  spanish: 'es',
  swedish: 'sv',
  turkish: 'tr',
  ukrainian: 'uk',
};

/** BCP-47 code (es. 'it') for the `lang` attribute, from the language name used by the questionnaire. */
export function getLanguageCode(langName: string): string {
  const normalized = (langName ?? '').toLowerCase().trim();
  const resolved = LANGUAGE_NAME_ALIASES[normalized] ?? normalized;
  return LANGUAGE_NAME_TO_CODE[resolved] ?? 'en';
}
