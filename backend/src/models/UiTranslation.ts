import { ModelConfig } from '../helpers/QueryBuilder.js';

export interface UiTranslationEntry {
  key: string;
  /** Where the text appears on the public page, shown to the admin (Settings › Languages). */
  section: string;
  /** Never rendered as visible text: tooltip (title), aria-label or screen-reader only. */
  hiddenText?: boolean;
}

/**
 * Public questionnaire UI strings editable from Settings › Languages, in display order.
 * Keys must match PublicUIStrings in frontend-shadcn/src/pages/public/labels.ts: any key
 * not listed here is rejected.
 */
export const UI_TRANSLATIONS = [
  { key: 'welcome', section: 'Language screen › page title' },
  {
    key: 'chooseLanguage',
    section: 'Language screen › subtitle, and hint shown when Next is pressed without a language',
  },
  {
    key: 'languagePlaceholder',
    section: 'Language and welcome screens › name of the language dropdown',
    hiddenText: true,
  },
  {
    key: 'prev',
    section: 'Back arrow on every screen, questionnaire and review included',
    hiddenText: true,
  },
  { key: 'next', section: 'Next arrow on every screen', hiddenText: true },
  {
    key: 'loading',
    section: 'Loading spinner on every screen, and next arrow while waiting',
    hiddenText: true,
  },
  {
    key: 'enterAnswer',
    section:
      'Questionnaire › placeholder of free-text answers, including the "Other, please specify" field',
  },
  {
    key: 'selectYear',
    section: 'Questionnaire › placeholder of the year dropdown (e.g. year of birth)',
  },
  {
    key: 'selectAnswer',
    section: 'Questionnaire › placeholder of the answer dropdown (questions with more than 8 options)',
  },
  { key: 'yes', section: 'Eligibility questions › "Yes" answer option' },
  { key: 'no', section: 'Eligibility questions › "No" answer option' },
  {
    key: 'close',
    section: 'Review › close button of the question panel (mobile)',
    hiddenText: true,
  },
  {
    key: 'reviewPromptTitle',
    section: 'End of questionnaire › title of the "review your answers?" screen',
  },
  {
    key: 'reviewPromptDescription',
    section: 'End of questionnaire › text of the "review your answers?" screen',
  },
  { key: 'yesReview', section: 'End of questionnaire › button to review the answers' },
  { key: 'noSubmit', section: 'End of questionnaire › button to submit without reviewing' },
  {
    key: 'reviewSidebarTitle',
    section: 'Review › page title (screen readers), title of the question panel and mobile menu button',
  },
  {
    key: 'submit',
    section: 'Review › submit button; Not eligible screen › button to close the questionnaire',
  },
  { key: 'submitting', section: 'End of questionnaire and review › submit button while sending' },
  { key: 'iConsent', section: 'Info & consent screen › "I consent" answer option' },
  { key: 'iDoNotConsent', section: 'Info & consent screen › "I do not consent" answer option' },
  {
    key: 'answerAllToContinue',
    section:
      'Info & consent screen › Next button hint: read by screen readers and shown when Next is pressed before answering all consent questions',
  },
  {
    key: 'selectAnswerToContinue',
    section:
      'Eligibility questions › Next button hint: read by screen readers and shown when Next is pressed without an answer',
  },
  {
    key: 'viewAttachment',
    section: 'Presentation, privacy policy and info & consent screens › link to the attached PDF',
  },
  { key: 'oops', section: 'Error screen › title' },
  { key: 'errorLinkInvalid', section: 'Error screen › link not found (no survey matches the link)' },
  {
    key: 'errorGeneric',
    section:
      'Error screen › the questionnaire could not be loaded or started; also shown when a closing message is missing',
  },
  { key: 'errorSavingAnswer', section: 'Questionnaire › error saving an answer' },
  {
    key: 'errorLoadCat',
    section: 'Questionnaire › error loading an adaptive (CAT) question, going forward or back',
  },
  { key: 'errorComplete', section: 'End of questionnaire › error while submitting' },
  { key: 'progressLabel', section: 'Questionnaire › name of the progress bar', hiddenText: true },
  {
    key: 'answered',
    section: 'Review › question list, state of an answered question',
    hiddenText: true,
  },
  {
    key: 'notAnswered',
    section: 'Review › question list, state of an unanswered question',
    hiddenText: true,
  },
  {
    key: 'readOnly',
    section: 'Review › adaptive (CAT) questions, which cannot be changed',
    hiddenText: true,
  },
  {
    key: 'responsesAlreadySaved',
    section:
      'Resume screen › label before the number of responses saved so far (private link reopened with the questionnaire in progress)',
  },
  { key: 'a11yMenu', section: 'Accessibility menu › floating button (tooltip) and panel title' },
  { key: 'a11yTextSize', section: 'Accessibility menu › "text size" heading' },
  {
    key: 'a11yIncreaseText',
    section: 'Accessibility menu › button that enlarges the text',
    hiddenText: true,
  },
  {
    key: 'a11yDecreaseText',
    section: 'Accessibility menu › button that reduces the text',
    hiddenText: true,
  },
  { key: 'a11yContrast', section: 'Accessibility menu › high contrast toggle' },
  { key: 'a11yGrayscale', section: 'Accessibility menu › grayscale toggle' },
  { key: 'a11yHighlightLinks', section: 'Accessibility menu › highlight links and buttons toggle' },
  { key: 'a11yStopAnimations', section: 'Accessibility menu › stop animations toggle' },
  { key: 'a11yReset', section: 'Accessibility menu › reset button' },
  { key: 'a11yKeyboardTitle', section: 'Accessibility menu › keyboard help heading' },
  { key: 'a11yKeyTab', section: 'Accessibility menu › keyboard help, what the Tab key does' },
  { key: 'a11yKeyShiftTab', section: 'Accessibility menu › keyboard help, what Shift + Tab does' },
  { key: 'a11yKeyEnter', section: 'Accessibility menu › keyboard help, what the Enter key does' },
  { key: 'a11yKeyEscape', section: 'Accessibility menu › keyboard help, what the Esc key does' },
  { key: 'a11yScreenReaderNote', section: 'Accessibility menu › note on supported screen readers' },
] as const satisfies readonly UiTranslationEntry[];

export const UI_TRANSLATION_KEYS = UI_TRANSLATIONS.map((e) => e.key);

export type UiTranslationKey = (typeof UI_TRANSLATIONS)[number]['key'];

export const UiTranslationModelConfig: ModelConfig = {
  searchable: ['key', 'value'],
  attributeFields: [],
  sortable: ['id', 'key', 'language_id', 'updated_at'],
  sortableAttributes: [],
  includable: ['language'],
  fieldMap: {
    languageId: 'language_id',
    updatedAt: 'updated_at',
  },
  attributeMap: {},
  defaultOrder: [{ key: 'asc' }],
};
