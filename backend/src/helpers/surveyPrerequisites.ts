import { PrismaClient } from '../generated/app/index.js';

const prisma = new PrismaClient();

export interface SurveyPrerequisites {
  hasPresentation: boolean;
  hasEligibility: boolean;
  hasPrivacyPolicy: boolean;
  hasStudyInfoSheet: boolean;
  hasClosingMessage: boolean;
  canCreateQuestionnaire: boolean;
}

/**
 * A questionnaire can only be created once the survey has at least one current
 * presentation, one active eligibility question, one active privacy policy, one
 * current study info sheet, and one current closing message — these are the
 * pre-flow/post-flow screens patients see around the questionnaire.
 */
export async function getSurveyPrerequisites(surveyId: number): Promise<SurveyPrerequisites> {
  const [hasPresentation, hasEligibility, hasPrivacyPolicy, hasStudyInfoSheet, hasClosingMessage] =
    await Promise.all([
      prisma.survey_presentations
        .count({ where: { survey_id: surveyId, is_current: true } })
        .then((c) => c > 0),
      prisma.survey_eligibility_questions
        .count({ where: { survey_id: surveyId, is_current: true, is_active: true } })
        .then((c) => c > 0),
      prisma.survey_privacy_policies
        .count({ where: { survey_id: surveyId, privacy_policy: { is_active: true } } })
        .then((c) => c > 0),
      prisma.survey_study_info_sheets
        .count({ where: { survey_id: surveyId, is_current: true } })
        .then((c) => c > 0),
      prisma.survey_closing_messages
        .count({ where: { survey_id: surveyId, is_current: true } })
        .then((c) => c > 0),
    ]);

  return {
    hasPresentation,
    hasEligibility,
    hasPrivacyPolicy,
    hasStudyInfoSheet,
    hasClosingMessage,
    canCreateQuestionnaire:
      hasPresentation &&
      hasEligibility &&
      hasPrivacyPolicy &&
      hasStudyInfoSheet &&
      hasClosingMessage,
  };
}
