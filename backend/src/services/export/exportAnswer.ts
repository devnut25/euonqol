/**
 * Turns a stored response into the three answer columns of the export
 * (value, English label, free text).
 *
 * Skip markers, disclaimers and multiple-choice answers are stored in
 * `answer_text` (see helpers/questionText.ts), but none of that is free text
 * typed by the respondent, so it is moved to where the other questions keep it:
 * skips to the label with their -1/-2 value, selected options to the label.
 * `Answer text` is left with only what was actually typed.
 */

import { parseMultipleChoice, SKIP_MARKERS } from '../../helpers/questionText.js';

export { isDisclaimer, stripHtml } from '../../helpers/questionText.js';

export interface AnswerCells {
  value: number | null;
  labelEn: string;
  text: string;
}

export interface StoredAnswer {
  questionKind: string;
  /** True when the question has nothing to answer, see isDisclaimer. */
  disclaimer: boolean;
  optionValue: number | null;
  /** English label already resolved from the option FK, if any. */
  labelEn: string | null;
  answerText: string | null;
  /** English label of a socio-demo / feedback option id, for multiple choice. */
  labelForOption: (optionId: number) => string | undefined;
}

export function resolveAnswerCells(answer: StoredAnswer): AnswerCells {
  const text = answer.answerText?.trim() ?? '';

  if (answer.disclaimer) return { value: null, labelEn: '', text: '' };

  const skipValue = SKIP_MARKERS[text];
  if (skipValue !== undefined) return { value: skipValue, labelEn: text, text: '' };

  if (answer.questionKind === 'socio-demo' || answer.questionKind === 'feedback') {
    const choice = parseMultipleChoice(text);
    if (choice) {
      const labels = choice.ids
        .map((id) => answer.labelForOption(id))
        .filter((l): l is string => !!l);
      return { value: null, labelEn: labels.join('; '), text: choice.text };
    }
  }

  return {
    value: answer.optionValue,
    labelEn: answer.labelEn ?? '',
    text: answer.answerText ?? '',
  };
}
