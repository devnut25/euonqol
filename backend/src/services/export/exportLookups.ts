/**
 * Lookup maps for the survey long-format export.
 *
 * Every map is loaded once, up front, with `in: [...]` queries over closed id
 * lists — the row loop then resolves labels in memory, with no per-row query.
 *
 * Question texts and answer labels are always English (`DEFAULT_LANGUAGE_ID`).
 * There is deliberately no fallback to another language: a mixed-language file
 * is worse than an empty cell, because nothing downstream would flag it.
 */

import { DEFAULT_LANGUAGE_ID } from '../../config/language.js';
import type { PrismaClient } from '../../generated/app/index.js';

export interface ExportLookups {
  /** question_id → English question text, per question_kind source table. */
  questionTextEn: Map<number, string>;
  /** answer_option_id → { value, option_code, label } */
  answerOptions: Map<number, { value: number; optionCode: string | null; labelEn: string | null }>;
  /** socio_demo_answers.id / feedback_answers.id → English label (see below). */
  socioDemoLabelEn: Map<number, string>;
  feedbackLabelEn: Map<number, string>;
  /**
   * Socio-demo and feedback questions that have answer options of their own.
   * One that has none (and is not a text question) is a disclaimer.
   */
  questionsWithOwnOptions: Set<number>;
  /** eu_countries.id → language name */
  languages: Map<number, string>;
}

/**
 * Builds the English label map for question-specific answers (socio-demo and
 * feedback), which have no shared answer profile.
 *
 * `responses.*_answer_id` points at the row in the LANGUAGE THE PATIENT USED, so
 * the English wording has to be reached indirectly, through
 * `(question_id, display_order)`.
 *
 * That indirection is only sound when the option lists line up across languages.
 * When a question has a different number of options in English than in the
 * patient's language, the positions cannot be trusted, and every answer of that
 * question is left blank rather than risk reporting a wrong label — a silently
 * mislabelled answer would be indistinguishable from a correct one.
 */
interface QuestionScopedAnswer {
  id: number;
  question_id: number;
  language_id: number;
  display_order: number;
  answer_text: string;
}

function buildQuestionScopedLabelMap(rows: QuestionScopedAnswer[]): Map<number, string> {
  const byQuestion = new Map<number, QuestionScopedAnswer[]>();
  for (const row of rows) {
    const list = byQuestion.get(row.question_id);
    if (list) list.push(row);
    else byQuestion.set(row.question_id, [row]);
  }

  const result = new Map<number, string>();

  for (const [questionId, questionRows] of byQuestion) {
    const englishByOrder = new Map<number, string>();
    const countByLanguage = new Map<number, number>();

    for (const row of questionRows) {
      countByLanguage.set(row.language_id, (countByLanguage.get(row.language_id) ?? 0) + 1);
      if (row.language_id === DEFAULT_LANGUAGE_ID) {
        englishByOrder.set(row.display_order, row.answer_text);
      }
    }

    const englishCount = countByLanguage.get(DEFAULT_LANGUAGE_ID) ?? 0;
    if (englishCount === 0) continue;

    for (const row of questionRows) {
      // Only trust position-based matching when that language has exactly as many
      // options as English does.
      const sameShape = (countByLanguage.get(row.language_id) ?? 0) === englishCount;
      if (!sameShape) continue;

      const label = englishByOrder.get(row.display_order);
      if (label !== undefined) result.set(row.id, label);
    }

    const mismatched = [...countByLanguage.entries()].filter(
      ([, count]) => count !== englishCount
    );
    if (mismatched.length > 0) {
      console.warn(
        `[Export] Question ${questionId}: option count differs from English in language(s) ` +
          `${mismatched.map(([lang]) => lang).join(', ')} — English labels omitted for those answers`
      );
    }
  }

  return result;
}

export async function loadExportLookups(
  prisma: PrismaClient,
  questionIds: number[],
  answerProfileIds: number[]
): Promise<ExportLookups> {
  const en = DEFAULT_LANGUAGE_ID;

  const [
    staticTexts,
    catTexts,
    socioTexts,
    feedbackTexts,
    options,
    socioAnswers,
    feedbackAnswers,
    languages,
  ] = await Promise.all([
    prisma.static_questions.findMany({
      where: { question_id: { in: questionIds }, language_id: en },
      select: { question_id: true, question: true },
    }),
    prisma.cat_questions.findMany({
      where: { question_id: { in: questionIds }, language_id: en },
      select: { question_id: true, question: true },
    }),
    prisma.socio_demo_questions.findMany({
      where: { question_id: { in: questionIds }, language_id: en },
      select: { question_id: true, question_text: true },
    }),
    prisma.feedback_question_translations.findMany({
      where: { question_id: { in: questionIds }, language_id: en },
      select: { question_id: true, question_text: true },
    }),
    answerProfileIds.length > 0
      ? prisma.answer_options.findMany({
          where: { answer_profile_id: { in: answerProfileIds } },
          select: {
            id: true,
            value: true,
            option_code: true,
            answer_option_i18n: {
              where: { language_id: en },
              select: { label: true },
              take: 1,
            },
          },
        })
      : Promise.resolve([]),
    // All languages: the FK points at the patient's language row.
    prisma.socio_demo_answers.findMany({
      where: { question_id: { in: questionIds } },
      select: {
        id: true,
        question_id: true,
        language_id: true,
        display_order: true,
        answer_text: true,
      },
    }),
    prisma.feedback_answers.findMany({
      where: { question_id: { in: questionIds } },
      select: {
        id: true,
        question_id: true,
        language_id: true,
        display_order: true,
        answer_text: true,
      },
    }),
    prisma.eu_countries.findMany({ select: { id: true, language: true } }),
  ]);

  const questionTextEn = new Map<number, string>();
  for (const r of staticTexts) if (r.question) questionTextEn.set(r.question_id, r.question);
  for (const r of catTexts) if (r.question) questionTextEn.set(r.question_id, r.question);
  for (const r of socioTexts)
    if (r.question_text) questionTextEn.set(r.question_id, r.question_text);
  for (const r of feedbackTexts)
    if (r.question_text) questionTextEn.set(r.question_id, r.question_text);

  const answerOptions = new Map<
    number,
    { value: number; optionCode: string | null; labelEn: string | null }
  >();
  for (const o of options) {
    answerOptions.set(o.id, {
      value: o.value,
      optionCode: o.option_code,
      labelEn: o.answer_option_i18n[0]?.label ?? null,
    });
  }

  return {
    questionTextEn,
    answerOptions,
    socioDemoLabelEn: buildQuestionScopedLabelMap(socioAnswers),
    feedbackLabelEn: buildQuestionScopedLabelMap(feedbackAnswers),
    questionsWithOwnOptions: new Set(
      [...socioAnswers, ...feedbackAnswers].map((a) => a.question_id)
    ),
    languages: new Map(languages.map((l) => [l.id, l.language])),
  };
}
