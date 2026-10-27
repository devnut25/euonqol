import { prisma } from '../config/database.js';
import { QueryBuilder } from '../helpers/QueryBuilder.js';
import { ServiceError } from '../helpers/ServiceError.js';
import { PrivacyPolicyModelConfig } from '../models/PrivacyPolicy.js';

export class SurveyPrivacyPolicyService {
  static async assertSurveyNotCompleted(surveyId: number): Promise<string> {
    const survey = await prisma.surveys.findUnique({
      where: { id: surveyId },
      select: { status: true },
    });
    if (!survey) {
      throw new ServiceError('Survey not found', 404);
    }
    if (survey.status === 'completed') {
      throw new ServiceError('Cannot modify privacy policies of a completed survey', 409);
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

  static async getPrivacyPolicies(surveyId: number, query: Record<string, any> = {}) {
    const survey = await prisma.surveys.findUnique({
      where: { id: surveyId },
      select: { status: true },
    });

    // Root entity is `survey_privacy_policies`: the policy-level where built here
    // must be nested under the `privacy_policy` relation.
    const { where: policyWhere } = QueryBuilder.for(PrivacyPolicyModelConfig, query).build();

    const result = await prisma.survey_privacy_policies.findMany({
      where: { survey_id: surveyId, privacy_policy: policyWhere },
      include: {
        privacy_policy: {
          include: {
            language: { select: { id: true, language: true, original_lang: true } },
          },
        },
      },
      orderBy: [
        { privacy_policy: { patient_type: 'asc' } },
        { privacy_policy: { language_id: 'asc' } },
      ],
    });
    return result.map((link) => ({ ...link, surveyStatus: survey?.status ?? null }));
  }

  static async getPrivacyPolicyById(surveyId: number, policyId: number) {
    const survey = await prisma.surveys.findUnique({
      where: { id: surveyId },
      select: { status: true },
    });

    const link = await prisma.survey_privacy_policies.findUnique({
      where: { survey_id_privacy_policy_id: { survey_id: surveyId, privacy_policy_id: policyId } },
      include: {
        privacy_policy: {
          include: {
            language: { select: { id: true, language: true, original_lang: true } },
          },
        },
      },
    });
    if (!link) throw new ServiceError('Association not found', 404);
    return { ...link, surveyStatus: survey?.status ?? null };
  }

  static async setPrivacyPolicies(surveyId: number, privacyPolicyIds: number[]) {
    const survey = await prisma.surveys.findUnique({ where: { id: surveyId } });
    if (!survey) throw new ServiceError('Survey not found', 404);
    if (survey.status === 'completed') {
      throw new ServiceError('Cannot modify privacy policies of a completed survey', 409);
    }

    if (privacyPolicyIds.length > 0) {
      const found = await prisma.privacy_policies.count({
        where: { id: { in: privacyPolicyIds } },
      });
      if (found !== privacyPolicyIds.length) {
        throw new ServiceError('One or more privacy_policy_ids are invalid');
      }
    }

    await prisma.$transaction([
      prisma.survey_privacy_policies.deleteMany({ where: { survey_id: surveyId } }),
      ...(privacyPolicyIds.length > 0
        ? [
            // A survey can never be left with zero fallback policies — the first id
            // in the replacement set always becomes the fallback.
            prisma.survey_privacy_policies.createMany({
              data: privacyPolicyIds.map((ppId, index) => ({
                survey_id: surveyId,
                privacy_policy_id: ppId,
                is_fallback: index === 0,
              })),
              skipDuplicates: true,
            }),
          ]
        : []),
    ]);

    return privacyPolicyIds.length;
  }

  static async addPrivacyPolicy(surveyId: number, policyId: number) {
    const [survey, policy] = await Promise.all([
      prisma.surveys.findUnique({ where: { id: surveyId } }),
      prisma.privacy_policies.findUnique({ where: { id: policyId } }),
    ]);
    if (!survey) throw new ServiceError('Survey not found', 404);
    if (!policy) throw new ServiceError('Privacy policy not found', 404);
    if (survey.status === 'completed') {
      throw new ServiceError('Cannot modify privacy policies of a completed survey', 409);
    }

    // The very first policy ever linked to a survey must always be the fallback
    // — a survey can never be left with zero fallback policies.
    const existingCount = await prisma.survey_privacy_policies.count({
      where: { survey_id: surveyId },
    });

    await prisma.survey_privacy_policies.upsert({
      where: { survey_id_privacy_policy_id: { survey_id: surveyId, privacy_policy_id: policyId } },
      create: { survey_id: surveyId, privacy_policy_id: policyId, is_fallback: existingCount === 0 },
      update: {},
    });
  }

  static async removePrivacyPolicy(surveyId: number, policyId: number) {
    await SurveyPrivacyPolicyService.assertSurveyNotCompleted(surveyId);

    const link = await prisma.survey_privacy_policies.findUnique({
      where: { survey_id_privacy_policy_id: { survey_id: surveyId, privacy_policy_id: policyId } },
    });
    if (!link) throw new ServiceError('Association not found', 404);

    if (link.is_fallback) {
      const siblingCount = await prisma.survey_privacy_policies.count({
        where: { survey_id: surveyId, privacy_policy_id: { not: policyId } },
      });
      if (siblingCount > 0) {
        throw new ServiceError(
          'Cannot remove the fallback policy while other policies exist. Mark another policy as fallback first.',
          400
        );
      }
    }

    await prisma.survey_privacy_policies.delete({
      where: { survey_id_privacy_policy_id: { survey_id: surveyId, privacy_policy_id: policyId } },
    });
  }

  /** Marks a policy as the fallback (and unsets whichever one held it before).
   * Cannot be used to unset the current fallback directly — mark a different
   * policy as fallback instead, which does that automatically. */
  static async setFallbackPolicy(surveyId: number, policyId: number) {
    await SurveyPrivacyPolicyService.assertSurveyNotCompleted(surveyId);

    const link = await prisma.survey_privacy_policies.findUnique({
      where: { survey_id_privacy_policy_id: { survey_id: surveyId, privacy_policy_id: policyId } },
    });
    if (!link) throw new ServiceError('Association not found', 404);

    if (link.is_fallback) {
      throw new ServiceError(
        'Cannot unset the fallback policy — mark a different policy as fallback instead.',
        400
      );
    }

    await prisma.$transaction(async (tx) => {
      await tx.survey_privacy_policies.updateMany({
        where: { survey_id: surveyId, is_fallback: true },
        data: { is_fallback: false },
      });
      await tx.survey_privacy_policies.update({
        where: {
          survey_id_privacy_policy_id: { survey_id: surveyId, privacy_policy_id: policyId },
        },
        data: { is_fallback: true },
      });
    });

    return true;
  }
}
