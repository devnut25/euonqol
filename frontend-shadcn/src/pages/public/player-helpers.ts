import { ISO_639_1_TO_LANGUAGE_NAME, normalizeLanguageName, type PublicUIStrings } from './labels';
import type { AnswerOption, Language, Question, SavedAnswer } from './types';

// ── Multiple Choice (socio-demo / feedback) ──────────────────────────────────
// Selections are saved as JSON in answer_text (see QuestionnairePlayer.tsx's
// socio-demo/feedback branches) rather than a single FK, since a `responses` row
// only has one scalar id column per answer type:
// - plain 'Multiple Choice' → array of answerOptions ids, e.g. [12,15]
// - with a 'Multiple Choice+Text' option → { ids: [12,15,18], text: "…" }, where
//   text is the free input attached to the "+Text" option.

const MULTI_CHOICE_TYPES = ['multiple choice', 'multiple choice+text'];

export function isMultiChoiceOption(option: AnswerOption): boolean {
  return MULTI_CHOICE_TYPES.includes((option.answer_type ?? '').toLowerCase());
}

export function isMultiChoiceQuestion(question: Question): boolean {
  return (
    (question.questionKind === 'socio-demo' || question.questionKind === 'feedback') &&
    question.answerOptions.some(isMultiChoiceOption)
  );
}

// ── Numeric free-input bounds (socio-demo 'Integer' / feedback 'Number') ─────
// min_value/max_value come from the kit upload's "Answers" sheet Min/Max columns.

const NUMERIC_ANSWER_TYPES = ['integer', 'number'];

export interface NumericBounds {
  min: number | null;
  max: number | null;
}

export function getNumericBounds(option: AnswerOption | undefined): NumericBounds {
  return { min: option?.min_value ?? null, max: option?.max_value ?? null };
}

/** True when the question's numeric answer is filled in and outside its bounds. */
export function isNumericAnswerOutOfRange(
  question: Question,
  answer: SavedAnswer | undefined
): boolean {
  const option = question.answerOptions.find((o) =>
    NUMERIC_ANSWER_TYPES.includes((o.answer_type ?? '').toLowerCase())
  );
  if (!option) return false;
  const text = answer?.answer_text?.trim();
  if (!text) return false;
  const value = Number(text);
  // Non-numeric text (e.g. an internal skip marker) isn't a numeric answer
  if (!Number.isFinite(value)) return false;
  const { min, max } = getNumericBounds(option);
  return (min !== null && value < min) || (max !== null && value > max);
}

/** Localized hint for a bounded numeric input, or undefined when unbounded. */
export function formatNumericBoundsMessage(
  { min, max }: NumericBounds,
  t: Pick<PublicUIStrings, 'numberBetween' | 'numberMin' | 'numberMax'>
): string | undefined {
  if (min !== null && max !== null)
    return t.numberBetween.replace('{min}', String(min)).replace('{max}', String(max));
  if (min !== null) return t.numberMin.replace('{min}', String(min));
  if (max !== null) return t.numberMax.replace('{max}', String(max));
  return undefined;
}

function parseMultiChoiceJson(answerText: string | undefined): unknown {
  if (!answerText) return null;
  try {
    return JSON.parse(answerText);
  } catch {
    return null;
  }
}

export function parseMultiChoiceSelection(answerText: string | undefined): number[] {
  const parsed = parseMultiChoiceJson(answerText);
  const ids =
    parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as { ids?: unknown }).ids
      : parsed;
  return Array.isArray(ids) ? ids.filter((n): n is number => typeof n === 'number') : [];
}

export function parseMultiChoiceText(answerText: string | undefined): string {
  const parsed = parseMultiChoiceJson(answerText);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return '';
  const text = (parsed as { text?: unknown }).text;
  return typeof text === 'string' ? text : '';
}

// Picks the browser's language among the ones this questionnaire is translated into.
// The browser reports ISO 639-1 codes while the API can only send language names (see
// ISO_639_1_TO_LANGUAGE_NAME), so the code is mapped to a name and compared exactly:
// a prefix match on the name would resolve 'es' to Estonian and 'sl' to Slovak.
export function detectBrowserLanguage(languages: Language[]): Language | null {
  if (languages.length === 0) return null;
  const prefs = navigator.languages?.length ? navigator.languages : [navigator.language];
  for (const pref of prefs) {
    const target = ISO_639_1_TO_LANGUAGE_NAME[pref.split('-')[0].toLowerCase()];
    if (!target) continue;
    const match = languages.find((l) => normalizeLanguageName(l.language) === target);
    if (match) return match;
  }
  return languages.find((l) => l.language.toLowerCase() === 'english') ?? languages[0];
}

// â”€â”€â”€ Shared layout (mirrors AuthLayout) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function evaluateCondition(
  selectedLabel: string,
  selectedNumeric: number | null,
  hasRealAnswer: boolean,
  operator: string,
  conditionValue: string | null
): boolean {
  // Handle special operators that don't need a conditionValue
  const op = operator === '=' ? '==' : operator;
  if (op === 'is not null') return !!hasRealAnswer;
  if (op === 'is null') return !hasRealAnswer;

  if (!conditionValue) return false;

  // 'IN': conditionValue is a semicolon-separated list of answer positions (Answer sheet 'Order' /
  // display_order). Visible when the selected option's display_order is one of them.
  // Semicolon (not comma) avoids Excel locales that treat "2,3" as the decimal number 2.3.
  if (op === 'IN') {
    const list = conditionValue
      .split(';')
      .map((s) => parseFloat(s.trim()))
      .filter((n) => !isNaN(n));
    return selectedNumeric !== null && list.includes(selectedNumeric);
  }

  // If conditionValue parses as a number and we have a numeric option value, prefer numeric comparison
  const condNum = parseFloat(conditionValue);
  if (!isNaN(condNum) && selectedNumeric !== null) {
    switch (op) {
      case '==':
        return selectedNumeric === condNum;
      case '!=':
        return selectedNumeric !== condNum;
      case '>':
        return selectedNumeric > condNum;
      case '<':
        return selectedNumeric < condNum;
      case '>=':
        return selectedNumeric >= condNum;
      case '<=':
        return selectedNumeric <= condNum;
      default:
        return false;
    }
  }

  // Otherwise compare labels (case-insensitive, trimmed)
  const a = selectedLabel.trim().toLowerCase();
  const b = conditionValue.trim().toLowerCase();
  switch (op) {
    case '==':
      return a === b;
    case '!=':
      return a !== b;
    default:
      return false; // >, <, >=, <= not meaningful for strings
  }
}

export function isQuestionVisible(
  question: Question,
  allQuestions: Question[],
  answers: Record<number, SavedAnswer>,
  _visited: Set<number> = new Set()
): boolean {
  // 'is not null' / 'is null' operators never have a conditionValue – don't treat null as "no condition"
  const needsConditionValue =
    question.operator !== 'is not null' && question.operator !== 'is null';
  if (
    !question.parentQid ||
    !question.operator ||
    (needsConditionValue && question.conditionValue === null)
  )
    return true;
  if (_visited.has(question.questionId)) return false; // circular dependency guard

  const visited = new Set(_visited);
  visited.add(question.questionId);

  const parent = allQuestions.find((q) => q.questionCode === question.parentQid);
  if (!parent) return false;

  // The parent itself must also be visible (handles chained conditions)
  if (!isQuestionVisible(parent, allQuestions, answers, visited)) return false;

  // Evaluate the condition against the parent's selected answer value
  const parentAnswer = answers[parent.questionId];
  if (
    !parentAnswer?.answer_option_id &&
    !parentAnswer?.answer_text &&
    !parentAnswer?.socio_demo_answer_id &&
    !parentAnswer?.feedback_answer_id
  )
    return false;

  // Multiple Choice parent: several ids in answer_text (JSON array) instead of the single
  // FK every other question kind uses — resolved separately, "==" / "!=" check membership
  // in the selected set; ">"/"<" etc. aren't meaningful for a multi-select condition.
  if (isMultiChoiceQuestion(parent)) {
    const selectedIds = parseMultiChoiceSelection(parentAnswer.answer_text);
    const hasRealAnswer = selectedIds.length > 0;

    const op = question.operator === '=' ? '==' : question.operator;
    if (op === 'is not null') return hasRealAnswer;
    if (op === 'is null') return !hasRealAnswer;
    if (!question.conditionValue) return false;

    if (op === 'IN') {
      const list = question.conditionValue
        .split(';')
        .map((s) => parseFloat(s.trim()))
        .filter((n) => !isNaN(n));
      const selectedOrders = selectedIds
        .map((id) => parent.answerOptions.find((o) => o.id === id)?.display_order)
        .filter((n): n is number => n != null);
      return selectedOrders.some((n) => list.includes(n));
    }

    const selectedLabels = selectedIds
      .map((id) => parent.answerOptions.find((o) => o.id === id))
      .filter((o): o is AnswerOption => !!o)
      .map((o) => (o.label ?? o.answer_text ?? '').trim().toLowerCase());
    const cond = question.conditionValue.trim().toLowerCase();

    if (op === '==') return selectedLabels.includes(cond);
    if (op === '!=') return !selectedLabels.includes(cond);
    return false;
  }

  const isSocioDemoOrFeedback =
    parent.questionKind === 'socio-demo' || parent.questionKind === 'feedback';

  // For socio-demo / feedback: look up by socio_demo_answer_id or feedback_answer_id
  // For static / cat: look up by answer_option_id
  const selectedOption = isSocioDemoOrFeedback
    ? parent.answerOptions.find(
        (o) => o.id === (parentAnswer.socio_demo_answer_id ?? parentAnswer.feedback_answer_id)
      )
    : parentAnswer.answer_option_id
      ? parent.answerOptions.find((o) => o.id === parentAnswer.answer_option_id)
      : undefined;

  // For "is not null" / "is null": just check whether a real answer was given.
  // Free-text skip markers (no matching answerOption seeded) must not count as real.
  const isSkipMarkerText = (parentAnswer.answer_text ?? '').toLowerCase().startsWith('skipped by');
  const hasRealAnswer =
    (!isSkipMarkerText && !!parentAnswer.answer_text && parentAnswer.answer_text.trim().length > 0) ||
    (selectedOption &&
      !(selectedOption.label ?? '').toLowerCase().includes('skipped by patient') &&
      !(selectedOption.label ?? '').toLowerCase().includes('skipped by system'));

  const selectedLabel = (
    selectedOption?.label ??
    selectedOption?.answer_text ??
    parentAnswer.answer_text ??
    ''
  ).trim();

  // For socio-demo/feedback use display_order as the numeric comparator;
  // for static/cat use the answer_option value field.
  const selectedNumeric = isSocioDemoOrFeedback
    ? (selectedOption?.display_order ?? null)
    : (selectedOption?.value ?? null);

  return evaluateCondition(
    selectedLabel,
    selectedNumeric,
    !!hasRealAnswer,
    question.operator,
    question.conditionValue
  );
}

export function isDisclaimerQuestion(question: Question): boolean {
  return (question.answerOptions.length ?? 0) === 0 && question.questionType !== 'text';
}

// ── Skip markers ────────────────────────────────────────────────────────────
// Builds the SavedAnswer for an auto-saved "Skipped by patient"/"Skipped by system"
// marker. Prefers a real answerOption FK when one is seeded for this question;
// otherwise falls back to free text so the response row still persists (and the
// question counts as "answered" on resume) even without DB skip-marker seed data.
export function buildSkipAnswer(
  question: Question,
  phrase: 'skipped by patient' | 'skipped by system'
): SavedAnswer {
  const option = question.answerOptions.find((o) =>
    (o.label ?? o.answer_text ?? '').toLowerCase().includes(phrase)
  );
  if (option) {
    if (question.questionKind === 'socio-demo') {
      return { questionId: question.questionId, socio_demo_answer_id: option.id };
    }
    if (question.questionKind === 'feedback') {
      return { questionId: question.questionId, feedback_answer_id: option.id };
    }
    return { questionId: question.questionId, answer_option_id: option.id };
  }
  return {
    questionId: question.questionId,
    answer_text: phrase === 'skipped by patient' ? 'Skipped by patient' : 'Skipped by system',
  };
}

export function getVisibleQuestions(
  allQuestions: Question[],
  answers: Record<number, SavedAnswer>
): Question[] {
  return allQuestions.filter((q) => isQuestionVisible(q, allQuestions, answers));
}

// ── WISP paired questions ─────────────────────────────────────────────────────
// When two consecutive questions share the exact same parent + operator + conditionValue,
// they form a WISP pair. The first is the "main" question (shown as a standalone screen).
// The second is the "companion" – shown inline below the main once the main is answered.
// Navigation skips over companion questions since they are handled inline.

export function isWispCompanion(question: Question, allQuestions: Question[]): boolean {
  if (!question.parentQid) return false;
  const idx = allQuestions.findIndex((q) => q.questionId === question.questionId);
  if (idx <= 0) return false;
  const prev = allQuestions[idx - 1];
  return (
    prev.parentQid === question.parentQid &&
    prev.operator === question.operator &&
    prev.conditionValue === question.conditionValue
  );
}

export function getWispCompanion(question: Question, allQuestions: Question[]): Question | null {
  if (!question.parentQid) return null;
  const idx = allQuestions.findIndex((q) => q.questionId === question.questionId);
  if (idx === -1 || idx >= allQuestions.length - 1) return null;
  const next = allQuestions[idx + 1];
  if (!next.parentQid) return null;
  if (
    next.parentQid === question.parentQid &&
    next.operator === question.operator &&
    next.conditionValue === question.conditionValue
  ) {
    return next;
  }
  return null;
}

// ── UI translations ───────────────────────────────────────────────────────────
// Translations keyed by the `language` field from eu_countries (lowercase).
