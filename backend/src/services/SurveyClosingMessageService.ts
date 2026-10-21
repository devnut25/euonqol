import { PrismaClient } from '../generated/app/index.js';
import { ServiceError } from '../helpers/ServiceError.js';
import type { UpsertClosingMessageInput } from '../validators/schemas/surveyClosingMessage.js';

const prisma = new PrismaClient();

export class SurveyClosingMessageService {
  private static async assertSurveyNotCompleted(surveyId: number): Promise<string> {
    const survey = await prisma.surveys.findUnique({
      where: { id: surveyId },
      select: { status: true },
    });
    if (!survey) {
      throw new ServiceError('Survey not found', 404);
    }
    if (survey.status === 'completed') {
      throw new ServiceError('Cannot modify closing messages of a completed survey', 409);
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

  static async getMessages(surveyId: number) {
    const survey = await prisma.surveys.findUnique({
      where: { id: surveyId },
      select: { status: true },
    });

    const rows = await prisma.survey_closing_messages.findMany({
      where: { survey_id: surveyId, is_current: true },
      include: { language: { select: { id: true, language: true, original_lang: true } } },
      orderBy: { language_id: 'asc' },
    });

    return rows.map((row) => ({ ...row, surveyStatus: survey?.status ?? null }));
  }

  static async getMessageById(surveyId: number, id: number) {
    const survey = await prisma.surveys.findUnique({
      where: { id: surveyId },
      select: { status: true },
    });

    const row = await prisma.survey_closing_messages.findFirst({
      where: { id, survey_id: surveyId },
      include: { language: { select: { id: true, language: true, original_lang: true } } },
    });
    if (!row) throw new ServiceError('Closing message not found', 404);
    return { ...row, surveyStatus: survey?.status ?? null };
  }

  static async getMessageHistory(surveyId: number, languageId: number) {
    return prisma.survey_closing_messages.findMany({
      where: { survey_id: surveyId, language_id: languageId },
      orderBy: { version: 'desc' },
    });
  }

  static async upsertMessage(surveyId: number, body: UpsertClosingMessageInput) {
    const languageId = body.language_id;

    await SurveyClosingMessageService.assertSurveyNotCompleted(surveyId);

    return prisma.$transaction(async (tx) => {
      const current = await tx.survey_closing_messages.findFirst({
        where: { survey_id: surveyId, language_id: languageId, is_current: true },
        select: { id: true, version: true, is_fallback: true },
      });

      const totalCount = await tx.survey_closing_messages.count({
        where: { survey_id: surveyId, is_current: true },
      });

      // The form has no is_fallback field: preserve whatever this language already
      // was on edit, default to non-fallback on a brand new language — except the
      // very first closing message ever created for the survey, which must always be
      // the fallback (a survey can never be left with zero fallback closing messages).
      const requestedFallback = body.is_fallback ?? current?.is_fallback ?? false;
      const makeFallback = totalCount === 0 ? true : requestedFallback;

      if (current) {
        await tx.survey_closing_messages.update({
          where: { id: current.id },
          data: { is_current: false },
        });
      }

      if (makeFallback) {
        await tx.survey_closing_messages.updateMany({
          where: { survey_id: surveyId, is_fallback: true },
          data: { is_fallback: false },
        });
      }

      return tx.survey_closing_messages.create({
        data: {
          survey_id: surveyId,
          language_id: languageId,
          content: body.content.trim(),
          link_used_message: body.link_used_message ?? null,
          survey_closed_message: body.survey_closed_message ?? null,
          resume_message: body.resume_message ?? null,
          version: current ? current.version + 1 : 1,
          is_current: true,
          is_fallback: makeFallback,
        },
        include: { language: { select: { id: true, language: true, original_lang: true } } },
      });
    });
  }

  /**
   * Public (no-auth) closing messages for a questionnaire link + language.
   * Each field is resolved on its own: exact language → fallback language → null
   * (null lets the public page show its built-in default text). No survey status
   * check on purpose: the "survey closed" text must be readable when the survey is closed.
   */
  static async getPublicMessages(link: string, languageId: number) {
    const privateAssignment = await prisma.survey_questionnaire_patients_assignment.findFirst({
      where: { link },
      select: { survey_questionnaire: { select: { survey_id: true } } },
    });
    let surveyId = privateAssignment?.survey_questionnaire.survey_id ?? null;
    if (surveyId === null) {
      const pub = await prisma.surveys_questionnaires.findUnique({
        where: { public_link: link },
        select: { survey_id: true },
      });
      surveyId = pub?.survey_id ?? null;
    }
    if (surveyId === null) throw new ServiceError('Link not found', 404);

    const [exact, fallback] = await Promise.all([
      prisma.survey_closing_messages.findFirst({
        where: { survey_id: surveyId, language_id: languageId, is_current: true },
      }),
      prisma.survey_closing_messages.findFirst({
        where: { survey_id: surveyId, is_current: true, is_fallback: true },
      }),
    ]);

    const base = exact ?? fallback;
    if (!base) return null;

    return {
      ...base,
      link_used_message: exact?.link_used_message ?? fallback?.link_used_message ?? null,
      survey_closed_message: exact?.survey_closed_message ?? fallback?.survey_closed_message ?? null,
      resume_message: exact?.resume_message ?? fallback?.resume_message ?? null,
    };
  }

  /** Marks a closing message as the fallback (and unsets whichever one held it before).
   * Cannot be used to unset the current fallback directly — mark a different
   * language as fallback instead, which does that automatically. */
  static async toggleMessageFallback(surveyId: number, closingMessageId: number) {
    await SurveyClosingMessageService.assertSurveyNotCompleted(surveyId);

    const row = await prisma.survey_closing_messages.findFirst({
      where: { id: closingMessageId, survey_id: surveyId, is_current: true },
      select: { id: true, is_fallback: true },
    });
    if (!row) throw new ServiceError('Closing message not found', 404);

    if (row.is_fallback) {
      throw new ServiceError(
        'Cannot unset the fallback closing message — mark a different language as fallback instead.',
        400
      );
    }

    await prisma.$transaction(async (tx) => {
      await tx.survey_closing_messages.updateMany({
        where: { survey_id: surveyId, is_fallback: true },
        data: { is_fallback: false },
      });
      await tx.survey_closing_messages.update({
        where: { id: row.id },
        data: { is_fallback: true },
      });
    });

    return true;
  }

  static async deleteMessage(surveyId: number, closingMessageId: number) {
    await SurveyClosingMessageService.assertSurveyNotCompleted(surveyId);

    const row = await prisma.survey_closing_messages.findFirst({
      where: { id: closingMessageId, survey_id: surveyId, is_current: true },
      select: { id: true, is_fallback: true },
    });
    if (!row) throw new ServiceError('Closing message not found', 404);

    if (row.is_fallback) {
      const siblingCount = await prisma.survey_closing_messages.count({
        where: { survey_id: surveyId, is_current: true, id: { not: row.id } },
      });
      if (siblingCount > 0) {
        throw new ServiceError(
          'Cannot delete the fallback closing message while other languages exist. Mark another language as fallback first.',
          400
        );
      }
    }

    await prisma.survey_closing_messages.update({
      where: { id: row.id },
      data: { is_current: false },
    });
  }
}
