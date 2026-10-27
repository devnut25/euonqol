import { prisma } from '../config/database.js';
import { ServiceError } from '../helpers/ServiceError.js';

export class SurveyEligibilityService {
  private static async assertSurveyNotCompleted(surveyId: number): Promise<string> {
    const survey = await prisma.surveys.findUnique({
      where: { id: surveyId },
      select: { status: true },
    });
    if (!survey) {
      throw new ServiceError('Survey not found', 404);
    }
    if (survey.status === 'completed') {
      throw new ServiceError('Cannot modify eligibility questions of a completed survey', 409);
    }
    return survey.status;
  }

  static async getSurveyStatus(surveyId: number): Promise<string | null> {
    const survey = await prisma.surveys.findUnique({
      where: { id: surveyId },
      select: { status: true },
    });
    return survey?.status ?? null;
  }

  static async getEligibilityQuestions(surveyId: number, search?: string) {
    const survey = await prisma.surveys.findUnique({
      where: { id: surveyId },
      select: { status: true },
    });

    const questions = await prisma.survey_eligibility_questions.findMany({
      where: {
        survey_id: surveyId,
        is_current: true,
        is_active: true,
        // Custom search: text lives in the translations relation, so QueryBuilder `searchable` can't cover it
        ...(search?.trim()
          ? {
              translations: {
                some: {
                  OR: [
                    { question_text: { contains: search.trim(), mode: 'insensitive' as const } },
                    {
                      disqualification_message: {
                        contains: search.trim(),
                        mode: 'insensitive' as const,
                      },
                    },
                  ],
                },
              },
            }
          : {}),
      },
      include: {
        translations: {
          include: { language: { select: { id: true, language: true, original_lang: true } } },
          orderBy: { language_id: 'asc' },
        },
      },
      orderBy: { order_position: 'asc' },
    });

    return questions.map((q) => ({ ...q, surveyStatus: survey?.status ?? null }));
  }

  static async createEligibilityQuestion(
    surveyId: number,
    body: { expected_answer?: string; order_position?: any; translations: any[] }
  ) {
    const { expected_answer = 'yes', order_position = 0, translations } = body;

    const surveyStatus = await SurveyEligibilityService.assertSurveyNotCompleted(surveyId);

    if (!['yes', 'no'].includes(expected_answer)) {
      throw new ServiceError('expected_answer must be yes or no');
    }
    if (!Array.isArray(translations) || translations.length === 0) {
      throw new ServiceError('At least one translation is required');
    }
    for (const t of translations) {
      if (!t.language_id || !t.question_text?.trim()) {
        throw new ServiceError('Each translation requires language_id and question_text');
      }
    }

    return prisma.$transaction(async (tx) => {
      // "Fallback" here is a per-LANGUAGE flag applied uniformly across every
      // question's translations, not per-question. Reuse the survey's existing
      // fallback language if one is already established; otherwise this brand new
      // question set must establish one — a survey can never end up with zero.
      const existingFallback = await tx.survey_eligibility_question_translations.findFirst({
        where: { question: { survey_id: surveyId, is_current: true }, is_fallback: true },
        select: { language_id: true },
      });
      let fallbackLanguageId = existingFallback?.language_id;
      if (fallbackLanguageId === undefined) {
        const explicit = translations.find(
          (t: any) => t.is_fallback === true || t.is_fallback === 'true'
        );
        fallbackLanguageId = parseInt(explicit?.language_id ?? translations[0].language_id, 10);
      }

      const created = await tx.survey_eligibility_questions.create({
        data: {
          survey_id: surveyId,
          expected_answer,
          order_position: parseInt(order_position, 10) || 0,
          version: 1,
          is_current: true,
          is_active: true,
          translations: {
            create: translations.map((t: any) => ({
              language_id: parseInt(t.language_id, 10),
              question_text: t.question_text.trim(),
              disqualification_message: t.disqualification_message?.trim() || null,
              is_fallback: parseInt(t.language_id, 10) === fallbackLanguageId,
            })),
          },
        },
        include: {
          translations: {
            include: { language: { select: { id: true, language: true, original_lang: true } } },
          },
        },
      });
      return { ...created, surveyStatus };
    });
  }

  static async updateEligibilityQuestion(
    surveyId: number,
    qid: number,
    body: { expected_answer?: string; order_position?: any; translations?: any[] }
  ) {
    const surveyStatus = await SurveyEligibilityService.assertSurveyNotCompleted(surveyId);

    const old = await prisma.survey_eligibility_questions.findFirst({
      where: { id: qid, survey_id: surveyId, is_current: true },
      include: { translations: true },
    });
    if (!old) throw new ServiceError('Question not found', 404);

    const { expected_answer, order_position, translations } = body;

    if (expected_answer && !['yes', 'no'].includes(expected_answer)) {
      throw new ServiceError('expected_answer must be yes or no');
    }

    // Fallback is a per-LANGUAGE flag applied uniformly across every question —
    // derive it from this question's own pre-edit translations rather than
    // whatever the edit form sends, so editing text can never silently drift a
    // question out of sync with the survey's fallback language.
    const fallbackLanguageId = old.translations.find((t) => t.is_fallback)?.language_id;

    const mergedTranslations = [...old.translations];
    if (Array.isArray(translations)) {
      for (const t of translations) {
        if (!t.language_id || !t.question_text?.trim()) continue;
        const idx = mergedTranslations.findIndex(
          (m) => m.language_id === parseInt(t.language_id, 10)
        );
        const entry = {
          language_id: parseInt(t.language_id, 10),
          question_text: t.question_text.trim(),
          disqualification_message: t.disqualification_message?.trim() || null,
        };
        if (idx >= 0) mergedTranslations[idx] = { ...mergedTranslations[idx], ...entry };
        else mergedTranslations.push({ id: 0, question_id: 0, is_fallback: false, ...entry });
      }
    }

    return prisma.$transaction(async (tx) => {
      await tx.survey_eligibility_questions.update({
        where: { id: old.id },
        data: { is_current: false },
      });

      const created = await tx.survey_eligibility_questions.create({
        data: {
          survey_id: surveyId,
          expected_answer: expected_answer ?? old.expected_answer,
          order_position:
            order_position !== undefined ? parseInt(order_position, 10) : old.order_position,
          version: old.version + 1,
          is_current: true,
          is_active: true,
          translations: {
            create: mergedTranslations.map((t) => ({
              language_id: t.language_id,
              question_text: t.question_text,
              disqualification_message: t.disqualification_message ?? null,
              is_fallback: t.language_id === fallbackLanguageId,
            })),
          },
        },
        include: {
          translations: {
            include: { language: { select: { id: true, language: true, original_lang: true } } },
          },
        },
      });
      return { ...created, surveyStatus };
    });
  }

  static async deleteEligibilityQuestion(surveyId: number, qid: number) {
    await SurveyEligibilityService.assertSurveyNotCompleted(surveyId);

    await prisma.survey_eligibility_questions.updateMany({
      where: { id: qid, survey_id: surveyId, is_current: true },
      data: { is_active: false, is_current: false },
    });
  }

  static async toggleEligibilityTranslationFallback(qid: number, langId: number) {
    const question = await prisma.survey_eligibility_questions.findUnique({
      where: { id: qid },
      select: { survey_id: true },
    });
    if (!question) throw new ServiceError('Question not found', 404);
    await SurveyEligibilityService.assertSurveyNotCompleted(question.survey_id);

    const translation = await prisma.survey_eligibility_question_translations.findUnique({
      where: { question_id_language_id: { question_id: qid, language_id: langId } },
      select: { id: true, is_fallback: true },
    });
    if (!translation) throw new ServiceError('Translation not found', 404);

    const newValue = !translation.is_fallback;

    await prisma.$transaction(async (tx) => {
      if (newValue) {
        await tx.survey_eligibility_question_translations.updateMany({
          where: { question_id: qid, is_fallback: true },
          data: { is_fallback: false },
        });
      }
      await tx.survey_eligibility_question_translations.update({
        where: { id: translation.id },
        data: { is_fallback: newValue },
      });
    });

    return newValue;
  }

  static async reorderEligibilityQuestions(
    surveyId: number,
    order: { id: number; order_position: number }[]
  ) {
    await SurveyEligibilityService.assertSurveyNotCompleted(surveyId);

    await prisma.$transaction(
      order.map(({ id, order_position }) =>
        prisma.survey_eligibility_questions.updateMany({
          where: { id, survey_id: surveyId, is_current: true },
          data: { order_position },
        })
      )
    );
  }

  /** Marks a language as the survey-wide fallback (and unsets whichever language
   * held it before) across every current question. Cannot be used to unset the
   * fallback without a replacement — mark a different language as fallback
   * instead, which does that automatically. */
  static async setEligibilityLanguageFallback(surveyId: number, langId: number) {
    await SurveyEligibilityService.assertSurveyNotCompleted(surveyId);

    const questions = await prisma.survey_eligibility_questions.findMany({
      where: { survey_id: surveyId, is_current: true },
      select: { id: true },
    });
    const questionIds = questions.map((q) => q.id);

    if (questionIds.length === 0) return;

    const hasTranslationForLanguage = await prisma.survey_eligibility_question_translations.count(
      { where: { question_id: { in: questionIds }, language_id: langId } }
    );
    if (hasTranslationForLanguage === 0) {
      throw new ServiceError(
        'Cannot unset the fallback language — mark a different language as fallback instead.',
        400
      );
    }

    await prisma.$transaction(async (tx) => {
      await tx.survey_eligibility_question_translations.updateMany({
        where: { question_id: { in: questionIds } },
        data: { is_fallback: false },
      });
      await tx.survey_eligibility_question_translations.updateMany({
        where: { question_id: { in: questionIds }, language_id: langId },
        data: { is_fallback: true },
      });
    });
  }

  static async upsertEligibilityTranslations(
    surveyId: number,
    langId: number,
    body: { is_fallback?: any; translations: any[] }
  ) {
    await SurveyEligibilityService.assertSurveyNotCompleted(surveyId);

    const { translations } = body;

    if (!Array.isArray(translations) || translations.length === 0) {
      throw new ServiceError('translations array is required');
    }

    const questionIds = translations
      .map((t: any) => parseInt(t.question_id, 10))
      .filter((id) => !isNaN(id));

    const validQuestions = await prisma.survey_eligibility_questions.findMany({
      where: { survey_id: surveyId, is_current: true, id: { in: questionIds } },
      select: { id: true },
    });
    const validIds = new Set(validQuestions.map((q) => q.id));

    // The form has no reason to touch is_fallback on a plain content edit of an
    // already-established language: preserve it rather than defaulting to false,
    // or editing the fallback language's text would silently unset it.
    const currentlyFallback =
      (await prisma.survey_eligibility_question_translations.count({
        where: { question_id: { in: questionIds }, language_id: langId, is_fallback: true },
      })) > 0;
    const isFallback =
      body.is_fallback !== undefined
        ? body.is_fallback === true || body.is_fallback === 'true'
        : currentlyFallback;

    // Explicitly unsetting the language that currently holds the fallback,
    // without designating a replacement in the same request, would leave the
    // survey with zero fallback languages — not allowed.
    if (currentlyFallback && !isFallback) {
      throw new ServiceError(
        'Cannot unset the fallback language — mark a different language as fallback instead.',
        400
      );
    }

    await prisma.$transaction(async (tx) => {
      if (isFallback) {
        const allQuestions = await tx.survey_eligibility_questions.findMany({
          where: { survey_id: surveyId, is_current: true },
          select: { id: true },
        });
        await tx.survey_eligibility_question_translations.updateMany({
          where: { question_id: { in: allQuestions.map((q) => q.id) } },
          data: { is_fallback: false },
        });
      }

      for (const t of translations) {
        const qid = parseInt(t.question_id, 10);
        if (!validIds.has(qid)) continue;
        await tx.survey_eligibility_question_translations.upsert({
          where: { question_id_language_id: { question_id: qid, language_id: langId } },
          create: {
            question_id: qid,
            language_id: langId,
            question_text: t.question_text.trim(),
            disqualification_message: t.disqualification_message?.trim() || null,
            is_fallback: isFallback,
          },
          update: {
            question_text: t.question_text.trim(),
            disqualification_message: t.disqualification_message?.trim() || null,
            is_fallback: isFallback,
          },
        });
      }
    });
  }

  static async deleteEligibilityLanguage(surveyId: number, langId: number) {
    await SurveyEligibilityService.assertSurveyNotCompleted(surveyId);

    const questions = await prisma.survey_eligibility_questions.findMany({
      where: { survey_id: surveyId, is_current: true },
      select: { id: true },
    });
    const questionIds = questions.map((q) => q.id);

    if (questionIds.length > 0) {
      const isFallbackLanguage =
        (await prisma.survey_eligibility_question_translations.count({
          where: { question_id: { in: questionIds }, language_id: langId, is_fallback: true },
        })) > 0;

      if (isFallbackLanguage) {
        const otherLanguages = await prisma.survey_eligibility_question_translations.findMany({
          where: { question_id: { in: questionIds }, language_id: { not: langId } },
          distinct: ['language_id'],
          select: { language_id: true },
        });
        if (otherLanguages.length > 0) {
          throw new ServiceError(
            'Cannot remove the fallback language while other languages exist. Mark another language as fallback first.',
            400
          );
        }
      }
    }

    await prisma.$transaction(async (tx) => {
      await tx.survey_eligibility_question_translations.deleteMany({
        where: {
          question_id: { in: questionIds },
          language_id: langId,
        },
      });

      const orphaned = await tx.survey_eligibility_questions.findMany({
        where: { id: { in: questionIds }, is_current: true, translations: { none: {} } },
        select: { id: true },
      });

      if (orphaned.length > 0) {
        await tx.survey_eligibility_questions.deleteMany({
          where: { id: { in: orphaned.map((q) => q.id) } },
        });
      }
    });
  }
}
