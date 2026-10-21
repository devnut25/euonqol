import { PrismaClient } from '../generated/app/index.js';
import { QueryBuilder } from '../helpers/QueryBuilder.js';
import { ServiceError } from '../helpers/ServiceError.js';
import { EmailTemplateModelConfig } from '../models/EmailTemplate.js';
import type {
  CreateEmailTemplateInput,
  UpdateEmailTemplateInput,
} from '../validators/schemas/emailTemplate.js';

const prisma = new PrismaClient();

export type { CreateEmailTemplateInput, UpdateEmailTemplateInput };

const LANGUAGE_INCLUDE = {
  language: { select: { id: true, language: true, original_lang: true } },
};

export class EmailTemplateService {
  private static async resolveSurveyQuestionnaire(
    surveyId: number,
    questionnaireId: number
  ): Promise<{ id: number; surveyStatus: string; questionnaireStatus: string }> {
    const sq = await prisma.surveys_questionnaires.findFirst({
      where: { survey_id: surveyId, questionnaire_id: questionnaireId },
      select: {
        id: true,
        survey: { select: { status: true } },
        questionnaire: { select: { status: true } },
      },
    });
    if (!sq) {
      throw new ServiceError('Survey-questionnaire combination not found', 404);
    }
    return { id: sq.id, surveyStatus: sq.survey.status, questionnaireStatus: sq.questionnaire.status };
  }

  private static assertNotCompleted(surveyStatus: string, questionnaireStatus: string) {
    if (surveyStatus === 'completed') {
      throw new ServiceError('Cannot modify email templates of a completed survey', 409);
    }
    if (questionnaireStatus === 'completed') {
      throw new ServiceError('Cannot modify email templates of a completed questionnaire', 409);
    }
  }

  private static async assertFallbackExists(sqId: number, excludeLanguageId?: number) {
    const fallback = await prisma.surveys_questionnaires_email_templates.findFirst({
      where: {
        survey_questionnaire_id: sqId,
        is_fallback: true,
        ...(excludeLanguageId ? { language_id: { not: excludeLanguageId } } : {}),
      },
      select: { language_id: true },
    });
    if (!fallback) {
      throw new ServiceError('At least one email template must be marked as fallback', 400);
    }
  }

  /**
   * Returns all email templates for a survey+questionnaire pair.
   */
  static async list(surveyId: number, questionnaireId: number, query: Record<string, any>) {
    const { id: sqId, surveyStatus, questionnaireStatus } = await EmailTemplateService.resolveSurveyQuestionnaire(
      surveyId,
      questionnaireId
    );

    const { where, orderBy, take, skip } = QueryBuilder.for(EmailTemplateModelConfig, query)
      .withBaseFilters({ survey_questionnaire_id: sqId })
      .build();

    const [total, templates] = await Promise.all([
      prisma.surveys_questionnaires_email_templates.count({ where }),
      prisma.surveys_questionnaires_email_templates.findMany({
        where,
        orderBy,
        include: LANGUAGE_INCLUDE,
        take,
        skip,
      }),
    ]);

    return {
      templates: templates.map((t) => ({ ...t, surveyStatus, questionnaireStatus })),
      total,
      take,
      skip,
      surveyStatus,
      questionnaireStatus,
    };
  }

  /**
   * Returns a single email template for a specific language.
   */
  static async getById(surveyId: number, questionnaireId: number, languageId: number) {
    const { id: sqId, surveyStatus, questionnaireStatus } = await EmailTemplateService.resolveSurveyQuestionnaire(
      surveyId,
      questionnaireId
    );

    const template = await prisma.surveys_questionnaires_email_templates.findUnique({
      where: {
        survey_questionnaire_id_language_id: {
          survey_questionnaire_id: sqId,
          language_id: languageId,
        },
      },
      include: LANGUAGE_INCLUDE,
    });

    if (!template) {
      throw new ServiceError('Template not found', 404);
    }

    return { ...template, surveyStatus, questionnaireStatus };
  }

  /**
   * Creates an email template for a specific language.
   */
  static async create(
    surveyId: number,
    questionnaireId: number,
    data: CreateEmailTemplateInput
  ) {
    const { id: sqId, surveyStatus, questionnaireStatus } = await EmailTemplateService.resolveSurveyQuestionnaire(
      surveyId,
      questionnaireId
    );
    EmailTemplateService.assertNotCompleted(surveyStatus, questionnaireStatus);

    if (!data.is_fallback) {
      const existingCount = await prisma.surveys_questionnaires_email_templates.count({
        where: { survey_questionnaire_id: sqId },
      });
      data.is_fallback = existingCount === 0;
    }

    try {
      let created;
      if (data.is_fallback) {
        created = await prisma.$transaction(async (tx) => {
          await tx.surveys_questionnaires_email_templates.updateMany({
            where: { survey_questionnaire_id: sqId, is_fallback: true },
            data: { is_fallback: false },
          });
          return tx.surveys_questionnaires_email_templates.create({
            data: {
              survey_questionnaire_id: sqId,
              language_id: data.language_id,
              subject: data.subject,
              body: data.body,
              is_fallback: true,
            },
            include: LANGUAGE_INCLUDE,
          });
        });
      } else {
        created = await prisma.surveys_questionnaires_email_templates.create({
          data: {
            survey_questionnaire_id: sqId,
            language_id: data.language_id,
            subject: data.subject,
            body: data.body,
            is_fallback: false,
          },
          include: LANGUAGE_INCLUDE,
        });
      }
      return { ...created, surveyStatus, questionnaireStatus };
    } catch (error: any) {
      if (error.code === 'P2002') {
        throw new ServiceError('A template for this language already exists', 409);
      }
      throw error;
    }
  }

  /**
   * Updates subject and/or body of an existing template.
   */
  static async update(
    surveyId: number,
    questionnaireId: number,
    languageId: number,
    data: UpdateEmailTemplateInput
  ) {
    const { id: sqId, surveyStatus, questionnaireStatus } = await EmailTemplateService.resolveSurveyQuestionnaire(
      surveyId,
      questionnaireId
    );
    EmailTemplateService.assertNotCompleted(surveyStatus, questionnaireStatus);

    const existing = await prisma.surveys_questionnaires_email_templates.findUnique({
      where: {
        survey_questionnaire_id_language_id: {
          survey_questionnaire_id: sqId,
          language_id: languageId,
        },
      },
    });
    if (!existing) {
      throw new ServiceError('Template not found', 404);
    }

    if (data.is_fallback === false && existing.is_fallback === true) {
      await EmailTemplateService.assertFallbackExists(sqId, languageId);
    }

    const updateData: { subject?: string; body?: string; is_fallback?: boolean } = {};
    if (data.subject !== undefined) updateData.subject = data.subject;
    if (data.body !== undefined) updateData.body = data.body;
    if (data.is_fallback !== undefined) updateData.is_fallback = data.is_fallback;

    let updated;
    if (data.is_fallback === true) {
      updated = await prisma.$transaction(async (tx) => {
        await tx.surveys_questionnaires_email_templates.updateMany({
          where: { survey_questionnaire_id: sqId, is_fallback: true },
          data: { is_fallback: false },
        });
        return tx.surveys_questionnaires_email_templates.update({
          where: {
            survey_questionnaire_id_language_id: {
              survey_questionnaire_id: sqId,
              language_id: languageId,
            },
          },
          data: updateData,
          include: LANGUAGE_INCLUDE,
        });
      });
    } else {
      updated = await prisma.surveys_questionnaires_email_templates.update({
        where: {
          survey_questionnaire_id_language_id: {
            survey_questionnaire_id: sqId,
            language_id: languageId,
          },
        },
        data: updateData,
        include: LANGUAGE_INCLUDE,
      });
    }

    return { ...updated, surveyStatus, questionnaireStatus };
  }

  /**
   * Marks a template as the fallback (and unsets whichever one held it before).
   * Cannot be used to unset the current fallback directly — mark a different
   * language as fallback instead, which does that automatically.
   */
  static async toggleFallback(surveyId: number, questionnaireId: number, languageId: number) {
    const { id: sqId, surveyStatus, questionnaireStatus } = await EmailTemplateService.resolveSurveyQuestionnaire(
      surveyId,
      questionnaireId
    );
    EmailTemplateService.assertNotCompleted(surveyStatus, questionnaireStatus);

    const existing = await prisma.surveys_questionnaires_email_templates.findUnique({
      where: {
        survey_questionnaire_id_language_id: {
          survey_questionnaire_id: sqId,
          language_id: languageId,
        },
      },
      select: { language_id: true, is_fallback: true },
    });
    if (!existing) {
      throw new ServiceError('Template not found', 404);
    }

    if (existing.is_fallback) {
      throw new ServiceError(
        'Cannot unset the fallback template — mark a different language as fallback instead.',
        400
      );
    }

    await prisma.$transaction(async (tx) => {
      await tx.surveys_questionnaires_email_templates.updateMany({
        where: { survey_questionnaire_id: sqId, is_fallback: true },
        data: { is_fallback: false },
      });
      await tx.surveys_questionnaires_email_templates.update({
        where: {
          survey_questionnaire_id_language_id: {
            survey_questionnaire_id: sqId,
            language_id: languageId,
          },
        },
        data: { is_fallback: true },
      });
    });

    return true;
  }

  /**
   * Deletes a template for a specific language.
   */
  static async delete(surveyId: number, questionnaireId: number, languageId: number) {
    const { id: sqId, surveyStatus, questionnaireStatus } = await EmailTemplateService.resolveSurveyQuestionnaire(
      surveyId,
      questionnaireId
    );
    EmailTemplateService.assertNotCompleted(surveyStatus, questionnaireStatus);

    const existing = await prisma.surveys_questionnaires_email_templates.findUnique({
      where: {
        survey_questionnaire_id_language_id: {
          survey_questionnaire_id: sqId,
          language_id: languageId,
        },
      },
    });
    if (!existing) {
      throw new ServiceError('Template not found', 404);
    }

    if (existing.is_fallback) {
      const siblingCount = await prisma.surveys_questionnaires_email_templates.count({
        where: { survey_questionnaire_id: sqId, language_id: { not: languageId } },
      });
      if (siblingCount > 0) {
        throw new ServiceError(
          'Cannot delete the fallback template while other templates exist. Mark another template as fallback first.',
          400
        );
      }
    }

    await prisma.surveys_questionnaires_email_templates.delete({
      where: {
        survey_questionnaire_id_language_id: {
          survey_questionnaire_id: sqId,
          language_id: languageId,
        },
      },
    });

    return existing;
  }
}
