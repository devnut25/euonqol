import { PrismaClient } from '../generated/app/index.js';

const prisma = new PrismaClient();

/**
 * Resolves the set of survey ids the caller is allowed to read.
 *
 * Admins see every survey; managers only the ones they created or were granted
 * access to through `users_surveys`. When `surveyIdParam` is given the result is
 * narrowed to that survey — an empty array then means "not visible to you",
 * which callers should surface as 403 rather than 404.
 *
 * Shared by the dashboard endpoints and the survey data export.
 */
export async function getVisibleSurveyIds(
  userId: string | undefined,
  isManager: boolean,
  surveyIdParam?: string
): Promise<number[]> {
  const where: any = {};
  if (isManager && userId) {
    where.OR = [{ created_by: userId }, { users_surveys: { some: { user_id: userId } } }];
  }
  if (surveyIdParam) where.id = parseInt(surveyIdParam, 10);

  const surveys = await prisma.surveys.findMany({ where, select: { id: true } });
  return surveys.map((s) => s.id);
}
