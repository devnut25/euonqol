/**
 * Resolves socio-demographic and feedback answers to stable English labels.
 *
 * Patients answer in their own language, and `responses.socio_demo_answer_id` /
 * `feedback_answer_id` point at the option row for THAT language. To group
 * respondents across languages the answer has to be mapped back to a single
 * label, which is done positionally via `display_order` — the only thing the
 * translations of one question share.
 *
 * Shared by the Demographics tab, the answer distributions and the score
 * cross-tab, so all three group respondents exactly the same way.
 */

import { DEFAULT_LANGUAGE_ID } from '../../config/language.js';
import type { PrismaClient } from '../../generated/app/index.js';
import { isDisclaimer, parseMultipleChoice, stripHtml } from '../../helpers/questionText.js';

/** The two question kinds whose options belong to the question itself. */
export type OwnOptionsKind = 'socio-demo' | 'feedback';

export interface QuestionLabelMeta {
  id: number;
  code: string;
  /** English wording, as plain text. */
  text: string;
  answerType: string;
  /** Nothing to answer: no options and not a text question. */
  disclaimer: boolean;
  /** English label → its position among the question's options. */
  optionOrder: Map<string, number>;
}

export interface QuestionLabelIndex {
  /** Option id (any language) → English label. */
  answerIdToEnglishLabel: Map<number, string>;
  questionMeta: Map<number, QuestionLabelMeta>;
}

/**
 * All language rows whose name contains "English" — there can be several (UK,
 * Malta, …), so they are treated as siblings.
 */
export async function resolveEnglishLanguageIds(prisma: PrismaClient): Promise<number[]> {
  const rows = await prisma.eu_countries.findMany({
    where: { language: { contains: 'English', mode: 'insensitive' } },
    select: { id: true },
  });
  return rows.length > 0 ? rows.map((r) => r.id) : [DEFAULT_LANGUAGE_ID];
}

interface OptionRow {
  id: number;
  answer_text: string;
  answer_type: string;
  display_order: number;
  language_id: number;
}

interface QuestionRow {
  id: number;
  question_code: string;
  question_type: string | null;
  texts: { question_text: string | null }[];
  options: OptionRow[];
}

/** The questions with their English text and their options in every language. */
async function loadQuestionRows(
  prisma: PrismaClient,
  kind: OwnOptionsKind,
  questionIds: number[],
  englishLanguageIds: number[]
): Promise<QuestionRow[]> {
  const english = { where: { language_id: { in: englishLanguageIds } } };
  const textSelect = {
    ...english,
    select: { question_text: true },
    orderBy: { language_id: 'asc' as const },
    take: 1,
  };
  // Every language, so any stored answer id can be resolved.
  const optionSelect = {
    select: {
      id: true,
      answer_text: true,
      answer_type: true,
      display_order: true,
      language_id: true,
    },
    orderBy: { display_order: 'asc' as const },
  };

  if (kind === 'socio-demo') {
    const rows = await prisma.questions.findMany({
      where: { id: { in: questionIds } },
      select: {
        id: true,
        question_code: true,
        question_type: true,
        socio_demo_questions: textSelect,
        socio_demo_answers: optionSelect,
      },
    });
    return rows.map((q) => ({
      ...q,
      texts: q.socio_demo_questions,
      options: q.socio_demo_answers,
    }));
  }

  const rows = await prisma.questions.findMany({
    where: { id: { in: questionIds } },
    select: {
      id: true,
      question_code: true,
      question_type: true,
      feedback_question_translations: textSelect,
      feedback_answers: optionSelect,
    },
  });
  return rows.map((q) => ({
    ...q,
    texts: q.feedback_question_translations,
    options: q.feedback_answers,
  }));
}

/**
 * Loads question metadata and the option-id → English-label mapping for the
 * given socio-demo or feedback questions.
 */
export async function loadQuestionLabelIndex(
  prisma: PrismaClient,
  kind: OwnOptionsKind,
  questionIds: number[],
  englishLanguageIds: number[]
): Promise<QuestionLabelIndex> {
  const answerIdToEnglishLabel = new Map<number, string>();
  const questionMeta = new Map<number, QuestionLabelMeta>();

  if (questionIds.length === 0) return { answerIdToEnglishLabel, questionMeta };

  const rows = await loadQuestionRows(prisma, kind, questionIds, englishLanguageIds);

  for (const q of rows) {
    const displayOrderToEnglish = new Map<number, string>();
    for (const opt of q.options) {
      if (
        englishLanguageIds.includes(opt.language_id) &&
        !displayOrderToEnglish.has(opt.display_order)
      ) {
        displayOrderToEnglish.set(opt.display_order, opt.answer_text);
      }
    }

    let answerType = 'Text';
    const optionOrder = new Map<string, number>();
    for (const opt of q.options) {
      // Fall back to the option's own text when the question has no English row.
      const label = displayOrderToEnglish.get(opt.display_order) ?? opt.answer_text;
      answerIdToEnglishLabel.set(opt.id, label);
      if (!optionOrder.has(label)) optionOrder.set(label, opt.display_order);
      if (englishLanguageIds.includes(opt.language_id)) answerType = opt.answer_type;
    }
    if (answerType === 'Text' && q.options.length > 0) {
      answerType = q.options[0].answer_type;
    }

    questionMeta.set(q.id, {
      id: q.id,
      code: q.question_code,
      text: stripHtml(q.texts[0]?.question_text ?? q.question_code),
      answerType,
      disclaimer: isDisclaimer(q.question_type, q.options.length > 0),
      optionOrder,
    });
  }

  return { answerIdToEnglishLabel, questionMeta };
}

export interface ResponseLike {
  answer_text: string | null;
  socio_demo_answer_id?: number | null;
  feedback_answer_id?: number | null;
}

/**
 * The English label(s) a single response maps to.
 *
 * Multiple-choice answers yield several labels — one respondent then belongs to
 * more than one category, which callers must account for.
 */
export function resolveAnswerLabels(
  response: ResponseLike,
  meta: QuestionLabelMeta | undefined,
  answerIdToEnglishLabel: Map<number, string>
): string[] {
  if (meta?.answerType.toLowerCase().startsWith('multiple choice')) {
    const choice = parseMultipleChoice(response.answer_text);
    if (choice) {
      return choice.ids
        .map((id) => answerIdToEnglishLabel.get(id))
        .filter((l): l is string => l != null);
    }
  }

  const optionId = response.socio_demo_answer_id ?? response.feedback_answer_id;
  if (optionId != null) {
    const label = answerIdToEnglishLabel.get(optionId);
    return label != null ? [label] : [];
  }

  const free = response.answer_text?.trim();
  return free ? [free] : [];
}
