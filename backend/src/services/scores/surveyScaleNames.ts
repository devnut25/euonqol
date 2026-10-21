/**
 * Full scale names for one survey, shared by the Scores tab and the export so
 * the two always name a scale the same way.
 */

import type { PrismaClient } from '../../generated/app/index.js';
import { scaleDisplayNames } from '../../config/scaleNames.js';

/**
 * Code → name map, from the CTT norms the survey scores with: the survey's own
 * version, overridden by any of its questionnaires' — the same precedence
 * scoring applies — on top of the built-in names.
 */
export async function loadSurveyScaleNames(
  prisma: PrismaClient,
  surveyId: number
): Promise<Record<string, string>> {
  const survey = await prisma.surveys.findUnique({
    where: { id: surveyId },
    select: {
      ctt_norms_version: { select: { norms: true } },
      surveys_questionnaires: {
        select: { questionnaire: { select: { ctt_norms_version: { select: { norms: true } } } } },
      },
    },
  });

  return scaleDisplayNames([
    survey?.ctt_norms_version?.norms,
    ...(survey?.surveys_questionnaires ?? []).map(
      (sq) => sq.questionnaire.ctt_norms_version?.norms
    ),
  ]);
}
