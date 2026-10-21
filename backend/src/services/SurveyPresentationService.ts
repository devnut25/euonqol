import { PrismaClient } from '../generated/app/index.js';
import { savePdf } from '../helpers/FileStorage.js';
import { ServiceError } from '../helpers/ServiceError.js';

const prisma = new PrismaClient();

export class SurveyPresentationService {
  private static async assertSurveyNotCompleted(surveyId: number): Promise<string> {
    const survey = await prisma.surveys.findUnique({
      where: { id: surveyId },
      select: { status: true },
    });
    if (!survey) {
      throw new ServiceError('Survey not found', 404);
    }
    if (survey.status === 'completed') {
      throw new ServiceError('Cannot modify presentations of a completed survey', 409);
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

  static async getPresentations(surveyId: number) {
    const survey = await prisma.surveys.findUnique({
      where: { id: surveyId },
      select: { status: true },
    });

    const rows = await prisma.survey_presentations.findMany({
      where: { survey_id: surveyId, is_current: true },
      include: { language: { select: { id: true, language: true, original_lang: true } } },
      orderBy: { language_id: 'asc' },
    });

    return rows.map((row) => ({ ...row, surveyStatus: survey?.status ?? null }));
  }

  static async getPresentationById(surveyId: number, id: number) {
    const survey = await prisma.surveys.findUnique({
      where: { id: surveyId },
      select: { status: true },
    });

    const row = await prisma.survey_presentations.findFirst({
      where: { id, survey_id: surveyId },
      include: { language: { select: { id: true, language: true, original_lang: true } } },
    });
    if (!row) throw new ServiceError('Presentation not found', 404);
    return { ...row, surveyStatus: survey?.status ?? null };
  }

  static async getPresentationHistory(surveyId: number, languageId: number) {
    return prisma.survey_presentations.findMany({
      where: { survey_id: surveyId, language_id: languageId },
      orderBy: { version: 'desc' },
    });
  }

  static async upsertPresentation(
    surveyId: number,
    body: { language_id: number | string; title?: string; content: string; is_fallback?: any; pdf?: null },
    file?: Express.Multer.File
  ) {
    const languageId = parseInt(String(body.language_id), 10);
    if (isNaN(languageId)) throw new ServiceError('Invalid language_id');
    if (!body.content?.trim()) throw new ServiceError('content is required');

    await SurveyPresentationService.assertSurveyNotCompleted(surveyId);

    return prisma.$transaction(async (tx) => {
      const current = await tx.survey_presentations.findFirst({
        where: { survey_id: surveyId, language_id: languageId, is_current: true },
        select: { id: true, version: true, is_fallback: true, pdf_url: true, pdf_filename: true },
      });

      // A new file replaces the attachment for this language; `pdf: null` is an
      // explicit removal signal from submitWithOptionalPdf (physical file stays on
      // disk, only the reference is cleared); otherwise carry the existing one
      // forward onto the new version (same as title/content below).
      const pdf_removed = body.pdf === null;
      const pdf_url = file
        ? savePdf('presentations', file.buffer)
        : pdf_removed
          ? null
          : (current?.pdf_url ?? null);
      const pdf_filename = file ? file.originalname : pdf_removed ? null : (current?.pdf_filename ?? null);

      const totalCount = await tx.survey_presentations.count({
        where: { survey_id: surveyId, is_current: true },
      });

      // The form has no is_fallback field: preserve whatever this language already
      // was on edit, default to non-fallback on a brand new language — except the
      // very first presentation ever created for the survey, which must always be
      // the fallback (a survey can never be left with zero fallback presentations).
      const requestedFallback =
        body.is_fallback !== undefined
          ? body.is_fallback === true || body.is_fallback === 'true'
          : (current?.is_fallback ?? false);
      const makeFallback = totalCount === 0 ? true : requestedFallback;

      if (current) {
        await tx.survey_presentations.update({
          where: { id: current.id },
          data: { is_current: false },
        });
      }

      if (makeFallback) {
        await tx.survey_presentations.updateMany({
          where: { survey_id: surveyId, is_fallback: true },
          data: { is_fallback: false },
        });
      }

      return tx.survey_presentations.create({
        data: {
          survey_id: surveyId,
          language_id: languageId,
          title: body.title?.trim() || null,
          content: body.content.trim(),
          pdf_url,
          pdf_filename,
          version: current ? current.version + 1 : 1,
          is_current: true,
          is_fallback: makeFallback,
        },
        include: { language: { select: { id: true, language: true, original_lang: true } } },
      });
    });
  }

  /** Marks a presentation as the fallback (and unsets whichever one held it before).
   * Cannot be used to unset the current fallback directly — mark a different
   * language as fallback instead, which does that automatically. */
  static async togglePresentationFallback(surveyId: number, presentationId: number) {
    await SurveyPresentationService.assertSurveyNotCompleted(surveyId);

    const row = await prisma.survey_presentations.findFirst({
      where: { id: presentationId, survey_id: surveyId, is_current: true },
      select: { id: true, is_fallback: true },
    });
    if (!row) throw new ServiceError('Presentation not found', 404);

    if (row.is_fallback) {
      throw new ServiceError(
        'Cannot unset the fallback presentation — mark a different language as fallback instead.',
        400
      );
    }

    await prisma.$transaction(async (tx) => {
      await tx.survey_presentations.updateMany({
        where: { survey_id: surveyId, is_fallback: true },
        data: { is_fallback: false },
      });
      await tx.survey_presentations.update({
        where: { id: row.id },
        data: { is_fallback: true },
      });
    });

    return true;
  }

  static async deletePresentation(surveyId: number, presentationId: number) {
    await SurveyPresentationService.assertSurveyNotCompleted(surveyId);

    const row = await prisma.survey_presentations.findFirst({
      where: { id: presentationId, survey_id: surveyId, is_current: true },
      select: { id: true, is_fallback: true },
    });
    if (!row) throw new ServiceError('Presentation not found', 404);

    if (row.is_fallback) {
      const siblingCount = await prisma.survey_presentations.count({
        where: { survey_id: surveyId, is_current: true, id: { not: row.id } },
      });
      if (siblingCount > 0) {
        throw new ServiceError(
          'Cannot delete the fallback presentation while other languages exist. Mark another language as fallback first.',
          400
        );
      }
    }

    await prisma.survey_presentations.update({
      where: { id: row.id },
      data: { is_current: false },
    });
  }
}
