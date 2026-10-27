import { Request, Response, NextFunction } from 'express';
import { prisma } from '../config/database.js';
import { AppSettingsKeys, AppSettingsService } from '../services/AppSettingsService.js';

// ─── Helper ────────────────────────────────────────────────────────────────────

async function getVisibleSurveyIds(
  userId: string | undefined,
  isManager: boolean
): Promise<number[]> {
  const where: any = {};
  if (isManager && userId) {
    where.OR = [{ created_by: userId }, { users_surveys: { some: { user_id: userId } } }];
  }
  const surveys = await prisma.surveys.findMany({ where, select: { id: true } });
  return surveys.map((s) => s.id);
}

// ─── Summary ──────────────────────────────────────────────────────────────────

/**
 * GET /euonqol-api/homepage/summary
 * Period-filtered KPIs: completions by access_mode, totalAssigned, inProgressRate, completionRate
 */
export async function getHomepageSummary(req: Request, res: Response, next: NextFunction) {
  try {
    const userId = req.user?.id;
    const isManager = req.user?.user_type === 'manager';

    const now = new Date();
    const defaultFrom = new Date(now);
    defaultFrom.setMonth(defaultFrom.getMonth() - 1);

    const dateFrom = req.query.dateFrom ? new Date(req.query.dateFrom as string) : defaultFrom;
    const dateTo = (() => {
      const d = req.query.dateTo ? new Date(req.query.dateTo as string) : now;
      d.setHours(23, 59, 59, 999);
      return d;
    })();

    const visibleSurveyIds = await getVisibleSurveyIds(userId, isManager);

    if (visibleSurveyIds.length === 0) {
      return res.json({
        data: {
          completionsByAccessMode: {
            traced: 0,
            anonymous_on_invitation: 0,
            anonymous_spontaneous: 0,
            total: 0,
          },
          totalAssigned: 0,
          inProgressRate: 0,
          completionRate: 0,
        },
      });
    }

    const baseWhere = {
      survey_questionnaire: { survey_id: { in: visibleSurveyIds } },
    };

    const [totalAssigned, totalCompleted, inProgressCount, completedInPeriod] = await Promise.all([
      prisma.survey_questionnaire_patients_assignment.count({ where: baseWhere }),
      prisma.survey_questionnaire_patients_assignment.count({
        where: { ...baseWhere, completion_status: 'completed' },
      }),
      prisma.survey_questionnaire_patients_assignment.count({
        where: { ...baseWhere, completion_status: 'in_progress' },
      }),
      prisma.survey_questionnaire_patients_assignment.findMany({
        where: {
          ...baseWhere,
          completion_status: 'completed',
          completed_at: { gte: dateFrom, lte: dateTo },
        },
        select: { access_mode: true },
      }),
    ]);

    const completionRate =
      totalAssigned > 0 ? Math.round((totalCompleted / totalAssigned) * 100) : 0;
    const inProgressRate =
      totalAssigned > 0 ? Math.round((inProgressCount / totalAssigned) * 100) : 0;

    const byMode = { traced: 0, anonymous_on_invitation: 0, anonymous_spontaneous: 0 };
    completedInPeriod.forEach((a) => {
      const mode = (a.access_mode as string) ?? 'traced';
      if (mode === 'traced') byMode.traced++;
      else if (mode === 'anonymous_on_invitation') byMode.anonymous_on_invitation++;
      else if (mode === 'anonymous_spontaneous') byMode.anonymous_spontaneous++;
    });

    return res.json({
      data: {
        completionsByAccessMode: { ...byMode, total: completedInPeriod.length },
        totalAssigned,
        inProgressRate,
        completionRate,
      },
    });
  } catch (error) {
    return next(error);
  }
}

// ─── Highlights ───────────────────────────────────────────────────────────────

/**
 * GET /euonqol-api/homepage/highlights
 * All-time counts: activeSurveys (in_progress), totalQuestionnaires, patientsEnrolled,
 * plus the deltas shown as KPI subtitles and the completion-ring numerator/denominator.
 */
export async function getHomepageHighlights(req: Request, res: Response, next: NextFunction) {
  try {
    const userId = req.user?.id;
    const isManager = req.user?.user_type === 'manager';

    const visibleSurveyIds = await getVisibleSurveyIds(userId, isManager);

    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const [
      activeSurveys,
      draftSurveys,
      distinctQuestionnaireIds,
      completedQuestionnaireIds,
      distinctPatients,
      newPatients,
    ] = await Promise.all([
      prisma.surveys.count({
        where: { id: { in: visibleSurveyIds }, status: 'public' },
      }),
      prisma.surveys.count({
        where: { id: { in: visibleSurveyIds }, status: 'draft' },
      }),
      prisma.surveys_questionnaires.findMany({
        where: { survey_id: { in: visibleSurveyIds } },
        distinct: ['questionnaire_id'],
        select: { questionnaire_id: true },
      }),
      prisma.surveys_questionnaires.findMany({
        where: {
          survey_id: { in: visibleSurveyIds },
          questionnaire: { status: 'completed' },
        },
        distinct: ['questionnaire_id'],
        select: { questionnaire_id: true },
      }),
      prisma.survey_questionnaire_patients_assignment.findMany({
        where: {
          survey_questionnaire: { survey_id: { in: visibleSurveyIds } },
        },
        distinct: ['patient_id'],
        select: { patient_id: true },
      }),
      prisma.patients.count({
        where: {
          survey_questionnaire: { survey_id: { in: visibleSurveyIds } },
          created_at: { gte: sevenDaysAgo },
        },
      }),
    ]);

    return res.json({
      data: {
        activeSurveys,
        draftSurveys,
        totalQuestionnaires: distinctQuestionnaireIds.length,
        questionnairesCompleted: completedQuestionnaireIds.length,
        patientsEnrolled: distinctPatients.length,
        newPatients,
      },
    });
  } catch (error) {
    return next(error);
  }
}

// ─── Activities ───────────────────────────────────────────────────────────────

/**
 * GET /euonqol-api/homepage/activities
 * Last 20 completed or in_progress assignments, scoped by user
 */
export async function getHomepageActivities(req: Request, res: Response, next: NextFunction) {
  try {
    const userId = req.user?.id;
    const isManager = req.user?.user_type === 'manager';

    const visibleSurveyIds = await getVisibleSurveyIds(userId, isManager);

    if (visibleSurveyIds.length === 0) {
      return res.json({ data: [] });
    }

    const assignments = await prisma.survey_questionnaire_patients_assignment.findMany({
      where: {
        survey_questionnaire: { survey_id: { in: visibleSurveyIds } },
        completion_status: { in: ['completed', 'in_progress'] },
      },
      orderBy: { updated_at: 'desc' },
      take: 20,
      select: {
        id: true,
        access_mode: true,
        completion_status: true,
        completed_at: true,
        updated_at: true,
        patient: { select: { patient_id: true } },
        survey_questionnaire: {
          select: {
            questionnaire: { select: { title: true } },
            survey: { select: { name: true } },
          },
        },
      },
    });

    const activities = assignments.map((a) => {
      const titleJson = a.survey_questionnaire?.questionnaire?.title;
      const questionnaireTitle =
        typeof titleJson === 'object' && titleJson !== null
          ? ((titleJson as any).it ?? (titleJson as any).en ?? 'Questionnaire')
          : String(titleJson ?? 'Questionnaire');

      return {
        id: a.id,
        accessMode: (a.access_mode as string) ?? 'traced',
        status: a.completion_status ?? 'in_progress',
        patientLabel:
          a.access_mode === 'anonymous_spontaneous'
            ? 'Anonymous'
            : ((a.patient?.patient_id as string) ?? 'Unknown'),
        questionnaireTitle,
        surveyName: a.survey_questionnaire?.survey?.name ?? '',
        timestamp: (a.completed_at ?? a.updated_at) as Date,
      };
    });

    return res.json({ data: activities });
  } catch (error) {
    return next(error);
  }
}

// ─── Alerts ("Needs attention") ────────────────────────────────────────────────

type AlertItem = {
  id: string;
  type: 'cat_key_expiring' | 'ending_soon' | 'draft' | 'closed_zero';
  surveyId?: number;
  title: string;
  subtitle: string;
  action: 'Update' | 'Remind' | 'Publish' | 'Review';
};

/** Days before the CAT API key expiry date from which admins are warned. */
const CAT_KEY_EXPIRY_WARNING_DAYS = 7;

/**
 * Alert for admins when the CAT API key expiry date (Settings > CAT API) is within
 * CAT_KEY_EXPIRY_WARNING_DAYS, or already past. The date is stored as YYYY-MM-DD and
 * the key counts as valid through that whole day.
 */
async function catKeyExpiryAlert(): Promise<AlertItem | null> {
  const expiresAt = await AppSettingsService.get(AppSettingsKeys.CAT_API_KEY_EXPIRES_AT);
  const match = expiresAt?.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return null;

  const now = new Date();
  const today = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  const expiry = Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  const daysLeft = Math.round((expiry - today) / 86_400_000);
  if (daysLeft > CAT_KEY_EXPIRY_WARNING_DAYS) return null;

  const date = `${match[1]}-${match[2]}-${match[3]}`;
  let title: string;
  if (daysLeft < 0) title = 'CAT API key has expired';
  else if (daysLeft === 0) title = 'CAT API key expires today';
  else title = `CAT API key expires in ${daysLeft} day${daysLeft === 1 ? '' : 's'}`;

  return {
    id: 'cat_key_expiring',
    type: 'cat_key_expiring',
    title,
    subtitle: `${daysLeft < 0 ? 'Expired' : 'Expires'} ${date} · update it in Settings > CAT API`,
    action: 'Update',
  };
}

/** completed / total assignments for a single survey, as a 0-100 rounded percentage. */
async function surveyCompletionRate(surveyId: number): Promise<{ rate: number; total: number; completed: number }> {
  const [total, completed] = await Promise.all([
    prisma.survey_questionnaire_patients_assignment.count({
      where: { survey_questionnaire: { survey_id: surveyId } },
    }),
    prisma.survey_questionnaire_patients_assignment.count({
      where: { survey_questionnaire: { survey_id: surveyId }, completion_status: 'completed' },
    }),
  ]);
  return { rate: total > 0 ? Math.round((completed / total) * 100) : 0, total, completed };
}

/**
 * GET /euonqol-api/homepage/alerts
 * Actionable surveys needing attention: ending within 3 days, still draft, or closed
 * with zero completions. Admins also get an alert when the CAT API key expires within
 * 7 days. Every action is navigation-only — the actual reminder/publish
 * step still happens on the survey page itself, same as everywhere else in the app.
 */
export async function getHomepageAlerts(req: Request, res: Response, next: NextFunction) {
  try {
    const userId = req.user?.id;
    const isManager = req.user?.user_type === 'manager';
    const isAdmin = req.user?.user_type === 'admin';

    // Only admins can reach Settings, so only they see the CAT API key alert.
    const catKeyAlert = isAdmin ? await catKeyExpiryAlert() : null;

    const visibleSurveyIds = await getVisibleSurveyIds(userId, isManager);
    if (visibleSurveyIds.length === 0) {
      return res.json({ data: catKeyAlert ? [catKeyAlert] : [] });
    }

    const now = new Date();
    const in3Days = new Date(now);
    in3Days.setDate(in3Days.getDate() + 3);
    in3Days.setHours(23, 59, 59, 999);

    const [endingSoon, draft, closed] = await Promise.all([
      prisma.surveys.findMany({
        where: {
          id: { in: visibleSurveyIds },
          status: 'public',
          end_date: { gte: now, lte: in3Days },
        },
        select: { id: true, name: true, end_date: true },
      }),
      prisma.surveys.findMany({
        where: { id: { in: visibleSurveyIds }, status: 'draft' },
        select: { id: true, name: true, starting_date: true },
      }),
      prisma.surveys.findMany({
        where: { id: { in: visibleSurveyIds }, status: 'completed' },
        select: { id: true, name: true, end_date: true },
      }),
    ]);

    const alerts: AlertItem[] = catKeyAlert ? [catKeyAlert] : [];

    for (const s of endingSoon) {
      const { rate, total, completed } = await surveyCompletionRate(s.id);
      const missing = total - completed;
      alerts.push({
        id: `ending_${s.id}`,
        type: 'ending_soon',
        surveyId: s.id,
        title: `${s.name} ends soon`,
        subtitle: `${rate}% completed · ${missing} response${missing === 1 ? '' : 's'} missing`,
        action: 'Remind',
      });
    }

    for (const s of draft) {
      const questionnaireCount = await prisma.surveys_questionnaires.count({
        where: { survey_id: s.id },
      });
      alerts.push({
        id: `draft_${s.id}`,
        type: 'draft',
        surveyId: s.id,
        title: `${s.name} is still a draft`,
        subtitle: `Starts ${s.starting_date?.toISOString().split('T')[0] ?? '—'} · ${questionnaireCount} questionnaire${questionnaireCount === 1 ? '' : 's'} linked`,
        action: 'Publish',
      });
    }

    for (const s of closed) {
      const { completed } = await surveyCompletionRate(s.id);
      if (completed > 0) continue; // only flag surveys that closed with zero completions
      alerts.push({
        id: `closed_${s.id}`,
        type: 'closed_zero',
        surveyId: s.id,
        title: `${s.name} closed at 0%`,
        subtitle: `Ended ${s.end_date?.toISOString().split('T')[0] ?? '—'} · no completions recorded`,
        action: 'Review',
      });
    }

    // CAT key expiry first (it blocks every CAT questionnaire), then ending-soon, draft,
    // closed-at-0% — capped so the card stays a short, actionable list rather than a
    // growing backlog.
    const order: Record<AlertItem['type'], number> = {
      cat_key_expiring: 0,
      ending_soon: 1,
      draft: 2,
      closed_zero: 3,
    };
    alerts.sort((a, b) => order[a.type] - order[b.type]);

    return res.json({ data: alerts.slice(0, 10) });
  } catch (error) {
    return next(error);
  }
}

// ─── Ongoing surveys (Gantt) ──────────────────────────────────────────────────

/**
 * GET /euonqol-api/homepage/ongoing-surveys
 * in_progress surveys with name, starting_date, end_date for the Gantt timeline
 */
export async function getHomepageOngoingSurveys(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const userId = req.user?.id;
    const isManager = req.user?.user_type === 'manager';

    const surveysWhere: any = { status: { in: ['public', 'draft'] } };
    if (isManager && userId) {
      surveysWhere.OR = [{ created_by: userId }, { users_surveys: { some: { user_id: userId } } }];
      // Merge status constraint with OR
      surveysWhere.AND = [{ status: { in: ['public', 'draft'] } }];
      delete surveysWhere.status;
    }

    const surveys = await prisma.surveys.findMany({
      where: surveysWhere,
      select: {
        id: true,
        name: true,
        starting_date: true,
        end_date: true,
        access_mode: true,
        status: true,
      },
      orderBy: { starting_date: 'asc' },
    });

    // Completion rate per survey (completed / total assignments) — shown as a label on
    // the Gantt bar. Draft surveys have no assignments yet, so they'll just read 0%.
    const surveysWithCompletion = await Promise.all(
      surveys.map(async (s) => ({
        ...s,
        completionRate: (await surveyCompletionRate(s.id)).rate,
      }))
    );

    return res.json({ data: surveysWithCompletion });
  } catch (error) {
    return next(error);
  }
}
