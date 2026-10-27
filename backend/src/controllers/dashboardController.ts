import { Request, Response, NextFunction } from 'express';
import { prisma } from '../config/database.js';
import {
  buildDateRange,
  completionWhere,
  lifecycleWhere,
  questionnaireScope,
  readStatusFilters,
} from '../helpers/statusFilters.js';
import { getVisibleSurveyIds } from '../helpers/surveyScope.js';
import { isDisclaimer, isSkipMarker, stripHtml } from '../helpers/questionText.js';
import {
  buildDistribution,
  byQuestionPosition,
  categoricalChart,
  loadQuestionPositions,
  percentage,
} from '../services/dashboard/answerDistribution.js';
import {
  loadQuestionLabelIndex,
  resolveAnswerLabels,
  resolveEnglishLanguageIds,
} from '../services/scores/questionLabels.js';

/**
 * GET /euonqol-api/dashboard/overall
 * Aggregated KPIs for the manager dashboard - Overall tab.
 *
 * Query params (all optional):
 *   surveyId        - filter by survey id
 *   questionnaireId - filter by questionnaire id
 *   groupId         - filter by patient group id
 *   dateFrom        - ISO date string, lower bound on completed_at (default: 3 months ago)
 *   dateTo          - ISO date string, upper bound on completed_at (default: now)
 *   accessMode      - 'traced' | 'anonymous_on_invitation' | 'anonymous_spontaneous' (default: all)
 *   surveyStatus, questionnaireStatus, completionStatus
 *                   - 'completed' | 'in_progress' | 'all' (default: all), see
 *                     helpers/statusFilters.ts
 */
export async function getOverall(req: Request, res: Response, next: NextFunction) {
  try {
    const userId = req.user?.id;
    const isManager = req.user?.user_type === 'manager';

    const { surveyId, questionnaireId, groupId, accessMode } = req.query;
    const statuses = readStatusFilters(req.query);

    // Default date range: last 6 months, matching the dashboard dock default
    const now = new Date();
    const defaultFrom = new Date(now);
    defaultFrom.setMonth(defaultFrom.getMonth() - 6);

    const dateFrom = req.query.dateFrom ? new Date(req.query.dateFrom as string) : defaultFrom;
    const dateTo = (() => {
      const d = req.query.dateTo ? new Date(req.query.dateTo as string) : now;
      // Bring to end-of-day so responses from the selected day are included
      d.setHours(23, 59, 59, 999);
      return d;
    })();

    // Build scope: survey ids visible to this user
    const surveysWhere: any = {};
    if (isManager && userId) {
      surveysWhere.OR = [{ created_by: userId }, { users_surveys: { some: { user_id: userId } } }];
    }
    if (surveyId) surveysWhere.id = parseInt(surveyId as string, 10);
    Object.assign(surveysWhere, lifecycleWhere(statuses.survey));

    const visibleSurveys = await prisma.surveys.findMany({
      where: surveysWhere,
      select: { id: true },
    });
    const visibleSurveyIds = visibleSurveys.map((s) => s.id);

    if (visibleSurveyIds.length === 0) {
      return res.json({ data: buildEmptyPayload() });
    }

    const groupIdNum = groupId ? parseInt(groupId as string, 10) : undefined;
    const qScope = questionnaireScope(statuses.questionnaire, groupIdNum);

    // Base assignment filter (no date constraint - for all-time totals)
    const assignmentsWhere: any = {
      survey_questionnaire: {
        survey_id: { in: visibleSurveyIds },
        questionnaire: qScope,
      },
    };
    if (questionnaireId) {
      assignmentsWhere.survey_questionnaire = {
        ...assignmentsWhere.survey_questionnaire,
        questionnaire_id: parseInt(questionnaireId as string, 10),
      };
    }
    if (accessMode && typeof accessMode === 'string') {
      assignmentsWhere.access_mode = accessMode;
    }

    // Run all aggregates in parallel
    const [totalActiveSurveys, distinctQuestionnaires, totalCompletions, distinctPatients] =
      await Promise.all([
        // 1. # Surveys in the selected survey status (scoped to user)
        prisma.surveys.count({ where: surveysWhere }),

        // 2. # Distinct questionnaires, in the selected questionnaire status and group
        prisma.surveys_questionnaires.findMany({
          where: {
            survey_id: { in: visibleSurveyIds },
            questionnaire: qScope,
          },
          distinct: ['questionnaire_id'],
          select: { questionnaire_id: true },
        }),

        // 3. Responses inside the selected range, in the dock's completion
        // status. Date-bounded on purpose, so with Completed selected this KPI
        // equals the sum of the per-survey cards' completed counts below it.
        prisma.survey_questionnaire_patients_assignment.count({
          where: {
            ...assignmentsWhere,
            ...completionWhere(statuses.completion, { gte: dateFrom, lte: dateTo }),
          },
        }),

        // 4. Distinct patients enrolled. Not date-bounded: enrolment is a state,
        // not an event in the period — and it matches how the cards count their
        // own "Patients" figure.
        prisma.survey_questionnaire_patients_assignment.findMany({
          where: assignmentsWhere,
          distinct: ['patient_id'],
          select: { patient_id: true },
        }),
      ]);

    return res.json({
      data: {
        mainKpis: {
          activeSurveys: totalActiveSurveys,
          questionnaires: distinctQuestionnaires.length,
          completions: totalCompletions,
          patientsEnrolled: distinctPatients.length,
        },
        meta: {
          dateFrom: dateFrom.toISOString(),
          dateTo: dateTo.toISOString(),
        },
      },
    });
  } catch (error) {
    return next(error);
  }
}

// Filter options for the dashboard sidebar
export async function getDashboardFilters(req: Request, res: Response, next: NextFunction) {
  try {
    const userId = req.user?.id;
    const isManager = req.user?.user_type === 'manager';

    const surveysWhere: any = {};
    if (isManager && userId) {
      surveysWhere.OR = [{ created_by: userId }, { users_surveys: { some: { user_id: userId } } }];
    }

    const [surveys, groups] = await Promise.all([
      prisma.surveys.findMany({
        where: surveysWhere,
        select: {
          id: true,
          name: true,
          status: true,
          access_mode: true,
          surveys_questionnaires: {
            select: {
              questionnaire: {
                select: { id: true, title: true, status: true, patient_group_id: true },
              },
            },
          },
        },
        orderBy: [{ name: 'asc' }, { id: 'asc' }],
      }),
      prisma.patient_groups.findMany({
        where: { is_active: true },
        select: { id: true, name: true },
        orderBy: { name: 'asc' },
      }),
    ]);

    return res.json({
      data: {
        surveys: surveys.map((s) => ({
          id: s.id,
          name: s.name,
          status: s.status,
          // Shown beside the name, so surveys sharing a name can be told apart.
          accessMode: s.access_mode,
          // A questionnaire linked to the survey more than once is still one option.
          questionnaires: [
            ...new Map(
              s.surveys_questionnaires.map((sq) => [
                sq.questionnaire.id,
                {
                  id: sq.questionnaire.id,
                  title: sq.questionnaire.title,
                  status: sq.questionnaire.status,
                  // Lets the filters offer only the groups a survey targets.
                  patientGroupId: sq.questionnaire.patient_group_id,
                },
              ])
            ).values(),
          ],
        })),
        groups,
      },
    });
  } catch (error) {
    return next(error);
  }
}

/**
 * GET /euonqol-api/dashboard/socio
 * Socio-demographic distributions of the answers in scope, one per question
 * actually answered, in the order the questionnaire asks them. Disclaimers are
 * left out; the chart type follows the answers (see buildDistribution).
 *
 * Query params (all optional): surveyId, questionnaireId, groupId, accessMode, dateFrom, dateTo,
 * surveyStatus, questionnaireStatus, completionStatus
 */
export async function getSocioDemo(req: Request, res: Response, next: NextFunction) {
  try {
    const userId = req.user?.id;
    const isManager = req.user?.user_type === 'manager';

    const { surveyId, questionnaireId, groupId, accessMode } = req.query;

    const now = new Date();
    const defaultFrom = new Date(now);
    // Same 6-month fallback as the Overall tab and the dashboard dock
    defaultFrom.setMonth(defaultFrom.getMonth() - 6);
    const dateFrom = req.query.dateFrom ? new Date(req.query.dateFrom as string) : defaultFrom;
    const dateTo = (() => {
      const d = req.query.dateTo ? new Date(req.query.dateTo as string) : now;
      // Bring to end-of-day so responses from the selected day are included
      d.setHours(23, 59, 59, 999);
      return d;
    })();

    const statuses = readStatusFilters(req.query);

    // ── Build visible survey scope (same pattern as getOverall) ──────────────
    const surveysWhere: any = {};
    if (isManager && userId) {
      surveysWhere.OR = [{ created_by: userId }, { users_surveys: { some: { user_id: userId } } }];
    }
    if (surveyId) surveysWhere.id = parseInt(surveyId as string, 10);
    Object.assign(surveysWhere, lifecycleWhere(statuses.survey));

    const visibleSurveys = await prisma.surveys.findMany({
      where: surveysWhere,
      select: { id: true },
    });
    const visibleSurveyIds = visibleSurveys.map((s) => s.id);

    if (visibleSurveyIds.length === 0) {
      return res.json({ data: { totalRespondents: 0, questions: [] } });
    }

    // ── Build assignment scope filter ─────────────────────────────────────────
    const assignmentScope: any = {
      ...completionWhere(statuses.completion, { gte: dateFrom, lte: dateTo }),
      survey_questionnaire: {
        survey_id: { in: visibleSurveyIds },
        questionnaire: questionnaireScope(
          statuses.questionnaire,
          groupId ? parseInt(groupId as string, 10) : undefined
        ),
        ...(questionnaireId ? { questionnaire_id: parseInt(questionnaireId as string, 10) } : {}),
      },
      ...(accessMode && typeof accessMode === 'string' ? { access_mode: accessMode } : {}),
    };

    // ── Find all assignments in scope ─────────────────────────────────────────
    const scopedAssignments = await prisma.survey_questionnaire_patients_assignment.findMany({
      where: assignmentScope,
      select: { id: true },
    });
    const assignmentIds = scopedAssignments.map((a) => a.id);
    const totalRespondents = assignmentIds.length;

    if (totalRespondents === 0) {
      return res.json({ data: { totalRespondents: 0, questions: [] } });
    }

    const socioDemoResponses = await prisma.responses.findMany({
      where: {
        assignment_id: { in: assignmentIds },
        question: { question_kind: 'socio-demo' },
      },
      select: {
        question_id: true,
        answer_text: true,
        socio_demo_answer_id: true,
      },
    });

    if (socioDemoResponses.length === 0) {
      return res.json({ data: { totalRespondents, questions: [] } });
    }

    // English labels for answers given in any language, matched by option order.
    const questionIds = [...new Set(socioDemoResponses.map((r) => r.question_id))];
    const [{ answerIdToEnglishLabel, questionMeta }, positions] = await Promise.all([
      loadQuestionLabelIndex(
        prisma,
        'socio-demo',
        questionIds,
        await resolveEnglishLanguageIds(prisma)
      ),
      loadQuestionPositions(prisma, questionIds),
    ]);

    // ── Count answers per question ────────────────────────────────────────────
    // Respondents rather than selections: on a multiple-choice question one
    // respondent contributes to several labels at once, so percentages are taken
    // over the people who answered.
    const byQuestion = new Map<number, { counts: Map<string, number>; respondents: number }>();

    for (const resp of socioDemoResponses) {
      const meta = questionMeta.get(resp.question_id);
      // Disclaimers have nothing to answer: their only "answer" is the skip
      // marker the player saves to count them as seen.
      if (!meta || meta.disclaimer) continue;

      const labels = resolveAnswerLabels(resp, meta, answerIdToEnglishLabel);
      if (labels.length === 0) continue;

      const entry = byQuestion.get(resp.question_id) ?? { counts: new Map(), respondents: 0 };
      entry.respondents += 1;
      for (const label of labels) entry.counts.set(label, (entry.counts.get(label) ?? 0) + 1);
      byQuestion.set(resp.question_id, entry);
    }

    // ── Build output per question, in questionnaire order ─────────────────────
    const questions = [...questionMeta.values()]
      .filter((meta) => byQuestion.has(meta.id))
      .sort(byQuestionPosition(positions))
      .map((meta) => {
        const { counts, respondents } = byQuestion.get(meta.id)!;
        const numeric = ['integer', 'number'].includes(meta.answerType.toLowerCase());
        const { chart, data } = buildDistribution(counts, respondents, meta.optionOrder, numeric);
        return {
          question_id: meta.id,
          question_code: meta.code,
          question_text: meta.text,
          answer_type: meta.answerType,
          chart_type: chart,
          total_responses: respondents,
          data,
        };
      });

    return res.json({ data: { totalRespondents, questions } });
  } catch (error) {
    return next(error);
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function buildEmptyPayload() {
  return {
    mainKpis: { activeSurveys: 0, questionnaires: 0, completions: 0, patientsEnrolled: 0 },
    meta: { dateFrom: null, dateTo: null },
  };
}

/** Number of points in a per-survey cumulative curve. */
const CUMULATIVE_SERIES_BUCKETS = 12;

/**
 * Builds the cumulative completions curve for one survey.
 *
 * The window is split into a fixed number of buckets so every card shows a curve
 * of the same shape regardless of how wide the selected range is. Counting is
 * cumulative *within the window*: the last point therefore equals the
 * `totalCompletions` reported next to it on the card, which keeps the two
 * readings consistent — it is not the survey's all-time total when the range
 * starts after the survey did.
 */
function buildCumulativeSeries(
  dates: Date[],
  from: Date | null,
  to: Date | null
): { label: string; value: number }[] {
  if (dates.length === 0 || !from || !to) return [];

  const startMs = from.getTime();
  const endMs = to.getTime();
  if (!(endMs > startMs)) return [];

  const step = (endMs - startMs) / CUMULATIVE_SERIES_BUCKETS;
  const sorted = [...dates].map((d) => d.getTime()).sort((a, b) => a - b);

  const series: { label: string; value: number }[] = [];
  let cursor = 0;
  let cumulative = 0;

  for (let i = 1; i <= CUMULATIVE_SERIES_BUCKETS; i++) {
    const bucketEnd = i === CUMULATIVE_SERIES_BUCKETS ? endMs : startMs + step * i;
    while (cursor < sorted.length && sorted[cursor] <= bucketEnd) {
      cumulative++;
      cursor++;
    }
    const d = new Date(bucketEnd);
    const label =
      String(d.getDate()).padStart(2, '0') + '/' + String(d.getMonth() + 1).padStart(2, '0');
    series.push({ label, value: cumulative });
  }

  return series;
}

/**
 * GET /euonqol-api/dashboard/overall/surveys
 * Per-survey high-level metrics for the Overall tab card slideshow.
 *
 * Kept separate from `getDownloadSurveys` on purpose: that one backs the Download
 * tab and ignores `questionnaireId`, while here every dock filter must apply.
 *
 * Query params (all optional): surveyId, questionnaireId, groupId, accessMode,
 * dateFrom, dateTo, surveyStatus, questionnaireStatus. `completionStatus` is not
 * applied: each card already shows completed and in-progress side by side.
 */
export async function getOverallSurveys(req: Request, res: Response, next: NextFunction) {
  try {
    const userId = req.user?.id;
    const isManager = req.user?.user_type === 'manager';
    const { groupId, accessMode, dateFrom, dateTo, questionnaireId } = req.query;

    const surveyIdParam = typeof req.query.surveyId === 'string' ? req.query.surveyId : undefined;
    const visibleIds = await getVisibleSurveyIds(userId, isManager, surveyIdParam);
    if (visibleIds.length === 0) return res.json({ data: [] });

    const groupIdNum = typeof groupId === 'string' ? parseInt(groupId, 10) : undefined;
    const questionnaireIdNum =
      typeof questionnaireId === 'string' ? parseInt(questionnaireId, 10) : undefined;
    const accessModeStr = typeof accessMode === 'string' ? accessMode : undefined;
    const dateFromStr = typeof dateFrom === 'string' ? dateFrom : undefined;
    const dateToStr = typeof dateTo === 'string' ? dateTo : undefined;

    const statuses = readStatusFilters(req.query);

    const surveys = await prisma.surveys.findMany({
      where: { id: { in: visibleIds }, ...lifecycleWhere(statuses.survey) },
      select: {
        id: true,
        name: true,
        status: true,
        starting_date: true,
        end_date: true,
        max_completions: true,
        surveys_questionnaires: {
          where: {
            ...(questionnaireIdNum ? { questionnaire_id: questionnaireIdNum } : {}),
            questionnaire: questionnaireScope(statuses.questionnaire, groupIdNum),
          },
          select: { id: true },
        },
      },
      orderBy: { name: 'asc' },
    });

    // Surveys with no questionnaire matching the filters (a specific one, the
    // questionnaire status or the group) have nothing to show and drop out of
    // the slideshow.
    const relevant = surveys.filter((s) => s.surveys_questionnaires.length > 0);

    const sqIds = relevant.flatMap((s) => s.surveys_questionnaires.map((sq) => sq.id));
    if (sqIds.length === 0) {
      return res.json({
        data: relevant.map((s) => ({
          id: s.id,
          name: s.name,
          status: s.status,
          startingDate: s.starting_date?.toISOString() ?? null,
          endDate: s.end_date?.toISOString() ?? null,
          maxCompletions: s.max_completions,
          questionnaireCount: s.surveys_questionnaires.length,
          totalCompletions: 0,
          totalInProgress: 0,
          totalPatients: 0,
          completionSeries: [],
        })),
      });
    }

    // The group is already applied through sqIds: only that group's
    // questionnaires are in it.
    const baseWhere: any = { survey_questionnaire_id: { in: sqIds } };
    if (accessModeStr) baseWhere.access_mode = accessModeStr;

    const completedWhere: any = { ...baseWhere, completion_status: 'completed' };
    if (dateFromStr || dateToStr) {
      completedWhere.completed_at = {};
      if (dateFromStr) completedWhere.completed_at.gte = new Date(dateFromStr);
      if (dateToStr) {
        const d = new Date(dateToStr);
        d.setHours(23, 59, 59, 999);
        completedWhere.completed_at.lte = d;
      }
    }

    const [inProgressGroups, completedGroups, distinctPatients, completionDates] =
      await Promise.all([
        // In-progress is a *current* state, not an event inside the period, so the
        // date range deliberately does not apply here (an unfinished assignment has
        // no completed_at to filter on anyway).
        prisma.survey_questionnaire_patients_assignment.groupBy({
          by: ['survey_questionnaire_id'],
          where: { ...baseWhere, completion_status: 'in_progress' },
          _count: { id: true },
        }),
        prisma.survey_questionnaire_patients_assignment.groupBy({
          by: ['survey_questionnaire_id'],
          where: completedWhere,
          _count: { id: true },
        }),
        // Distinct participants. Counted on assignment.patient_id, the same basis
        // as the "# Patients Enrolled" KPI above — note that `patients` rows are
        // per questionnaire, so someone taking two questionnaires of one survey
        // counts twice here, exactly as they do in that KPI.
        prisma.survey_questionnaire_patients_assignment.findMany({
          where: baseWhere,
          select: { survey_questionnaire_id: true, patient_id: true },
          distinct: ['patient_id'],
        }),
        // Completion timestamps, for the per-survey cumulative curve. Only two
        // scalar columns, so this stays cheap even on large result sets.
        prisma.survey_questionnaire_patients_assignment.findMany({
          where: completedWhere,
          select: { survey_questionnaire_id: true, completed_at: true },
        }),
      ]);

    const inProgressBySq = new Map(
      inProgressGroups.map((r) => [r.survey_questionnaire_id, r._count.id])
    );
    const completedBySq = new Map(
      completedGroups.map((r) => [r.survey_questionnaire_id, r._count.id])
    );

    const patientsBySq = new Map<number, number>();
    for (const row of distinctPatients) {
      patientsBySq.set(
        row.survey_questionnaire_id,
        (patientsBySq.get(row.survey_questionnaire_id) ?? 0) + 1
      );
    }

    const datesBySq = new Map<number, Date[]>();
    for (const row of completionDates) {
      if (!row.completed_at) continue;
      const list = datesBySq.get(row.survey_questionnaire_id);
      if (list) list.push(row.completed_at);
      else datesBySq.set(row.survey_questionnaire_id, [row.completed_at]);
    }

    // Curve window: the dock range when given, otherwise the span the data
    // itself covers, so a survey is never squeezed into an arbitrary window.
    const allDates = completionDates
      .map((r) => r.completed_at)
      .filter((d): d is Date => d !== null);
    const windowFrom = dateFromStr
      ? new Date(dateFromStr)
      : allDates.length > 0
        ? new Date(Math.min(...allDates.map((d) => d.getTime())))
        : null;
    const windowTo = (() => {
      if (dateToStr) {
        const d = new Date(dateToStr);
        d.setHours(23, 59, 59, 999);
        return d;
      }
      return allDates.length > 0 ? new Date(Math.max(...allDates.map((d) => d.getTime()))) : null;
    })();

    const data = relevant.map((s) => {
      let totalCompletions = 0;
      let totalInProgress = 0;
      let totalPatients = 0;
      const surveyDates: Date[] = [];

      for (const sq of s.surveys_questionnaires) {
        totalCompletions += completedBySq.get(sq.id) ?? 0;
        totalInProgress += inProgressBySq.get(sq.id) ?? 0;
        totalPatients += patientsBySq.get(sq.id) ?? 0;
        const dates = datesBySq.get(sq.id);
        if (dates) surveyDates.push(...dates);
      }

      return {
        id: s.id,
        name: s.name,
        status: s.status,
        startingDate: s.starting_date?.toISOString() ?? null,
        endDate: s.end_date?.toISOString() ?? null,
        maxCompletions: s.max_completions,
        questionnaireCount: s.surveys_questionnaires.length,
        totalCompletions,
        totalInProgress,
        totalPatients,
        completionSeries: buildCumulativeSeries(surveyDates, windowFrom, windowTo),
      };
    });

    return res.json({ data });
  } catch (err) {
    return next(err);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Download tab endpoints
// ─────────────────────────────────────────────────────────────────────────────

/**
 * GET /euonqol-api/dashboard/download/surveys
 * Level-1 list: all visible surveys with questionnaire count and total completions.
 */
export async function getDownloadSurveys(req: Request, res: Response, next: NextFunction) {
  try {
    const userId = req.user?.id;
    const isManager = req.user?.user_type === 'manager';
    const { groupId, accessMode, dateFrom, dateTo } = req.query;

    const surveyIdParam = typeof req.query.surveyId === 'string' ? req.query.surveyId : undefined;
    const visibleIds = await getVisibleSurveyIds(userId, isManager, surveyIdParam);
    if (visibleIds.length === 0) return res.json({ data: [] });

    const groupIdNum = typeof groupId === 'string' ? parseInt(groupId, 10) : undefined;
    const accessModeStr = typeof accessMode === 'string' ? accessMode : undefined;
    const dateFromStr = typeof dateFrom === 'string' ? dateFrom : undefined;
    const dateToStr = typeof dateTo === 'string' ? dateTo : undefined;

    const statuses = readStatusFilters(req.query);
    const sqScope = { questionnaire: questionnaireScope(statuses.questionnaire, groupIdNum) };

    const surveys = await prisma.surveys.findMany({
      where: { id: { in: visibleIds }, ...lifecycleWhere(statuses.survey) },
      select: {
        id: true,
        name: true,
        status: true,
        surveys_questionnaires: { where: sqScope, select: { id: true } },
      },
      orderBy: { name: 'asc' },
    });

    // Build per-survey completion count respecting filters
    const assignmentsWhere: any = {
      survey_questionnaire: {
        survey_id: { in: surveys.map((s) => s.id) },
        ...sqScope,
      },
      ...completionWhere(statuses.completion, buildDateRange(dateFromStr, dateToStr)),
    };
    if (accessModeStr) assignmentsWhere.access_mode = accessModeStr;

    const completionRows = await prisma.survey_questionnaire_patients_assignment.groupBy({
      by: ['survey_questionnaire_id'],
      where: assignmentsWhere,
      _count: { id: true },
    });

    // Map survey_questionnaire_id → survey_id
    const sqToSurvey = new Map<number, number>();
    for (const s of surveys) {
      for (const sq of s.surveys_questionnaires) sqToSurvey.set(sq.id, s.id);
    }
    const surveyCompletions = new Map<number, number>();
    for (const row of completionRows) {
      const sid = sqToSurvey.get(row.survey_questionnaire_id);
      if (sid) surveyCompletions.set(sid, (surveyCompletions.get(sid) ?? 0) + row._count.id);
    }

    const data = surveys.map((s) => ({
      id: s.id,
      name: s.name,
      status: s.status,
      questionnaireCount: s.surveys_questionnaires.length,
      totalCompletions: surveyCompletions.get(s.id) ?? 0,
    }));

    return res.json({ data });
  } catch (err) {
    return next(err);
  }
}

/**
 * GET /euonqol-api/dashboard/download/surveys/:surveyId/questionnaires
 * Level-2 list: questionnaires inside a survey with assignment/completion counts.
 */
export async function getDownloadSurveyQuestionnaires(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const userId = req.user?.id;
    const isManager = req.user?.user_type === 'manager';
    const { surveyId: surveyIdParam } = req.params;
    const surveyId = parseInt(surveyIdParam as string, 10);
    const { groupId, accessMode, dateFrom, dateTo } = req.query;

    // Verify visibility
    const visibleIds = await getVisibleSurveyIds(userId, isManager, String(surveyId));
    if (!visibleIds.includes(surveyId)) return res.status(404).json({ error: 'Survey not found' });

    const survey = await prisma.surveys.findUnique({
      where: { id: surveyId },
      select: { id: true, name: true },
    });

    const statuses = readStatusFilters(req.query);
    const groupIdNum = typeof groupId === 'string' ? parseInt(groupId, 10) : undefined;

    const sqRows = await prisma.surveys_questionnaires.findMany({
      where: {
        survey_id: surveyId,
        questionnaire: questionnaireScope(statuses.questionnaire, groupIdNum),
      },
      select: {
        id: true,
        questionnaire: {
          select: {
            id: true,
            title: true,
            type: true,
            patient_group: { select: { name: true } },
          },
        },
      },
    });

    const sqIds = sqRows.map((r) => r.id);

    const accessModeStr = typeof accessMode === 'string' ? accessMode : undefined;
    const dateFromStr = typeof dateFrom === 'string' ? dateFrom : undefined;
    const dateToStr = typeof dateTo === 'string' ? dateTo : undefined;

    // The group is already applied through sqRows.
    const baseWhere: any = { survey_questionnaire_id: { in: sqIds } };
    if (accessModeStr) baseWhere.access_mode = accessModeStr;

    const completedWhere: any = {
      ...baseWhere,
      ...completionWhere(statuses.completion, buildDateRange(dateFromStr, dateToStr)),
    };

    const [assignedGroups, completedGroups] = await Promise.all([
      prisma.survey_questionnaire_patients_assignment.groupBy({
        by: ['survey_questionnaire_id'],
        where: baseWhere,
        _count: { id: true },
      }),
      prisma.survey_questionnaire_patients_assignment.groupBy({
        by: ['survey_questionnaire_id'],
        where: completedWhere,
        _count: { id: true },
      }),
    ]);

    const assignedMap = new Map(
      assignedGroups.map((r) => [r.survey_questionnaire_id, r._count.id])
    );
    const completedMap = new Map(
      completedGroups.map((r) => [r.survey_questionnaire_id, r._count.id])
    );

    const questionnaires = sqRows.map((sq) => ({
      id: sq.questionnaire.id,
      surveyQuestionnaireId: sq.id,
      title: sq.questionnaire.title,
      type: sq.questionnaire.type,
      patientGroup: sq.questionnaire.patient_group?.name ?? null,
      totalAssigned: assignedMap.get(sq.id) ?? 0,
      totalCompletions: completedMap.get(sq.id) ?? 0,
    }));

    return res.json({ data: { survey, questionnaires } });
  } catch (err) {
    return next(err);
  }
}

/**
 * GET /euonqol-api/dashboard/distributions/questionnaires/:questionnaireId
 *
 * Per-module, per-question answer distributions of one questionnaire, read by
 * the Static, Dynamic and Feedback tabs. Applies the dock filters.
 *
 * Disclaimers are left out: they have nothing to answer, and their only
 * "answer" is the skip marker the player saves to count them as seen.
 */
export async function getQuestionnaireDistributions(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const userId = req.user?.id;
    const isManager = req.user?.user_type === 'manager';
    const { questionnaireId: questionnaireIdParam } = req.params;
    const questionnaireId = parseInt(questionnaireIdParam as string, 10);
    const { surveyId, groupId, accessMode, dateFrom, dateTo } = req.query;

    const surveyIdStr = typeof surveyId === 'string' ? surveyId : undefined;
    const groupIdNum = typeof groupId === 'string' ? parseInt(groupId, 10) : undefined;
    const accessModeStr = typeof accessMode === 'string' ? accessMode : undefined;
    const dateFromStr = typeof dateFrom === 'string' ? dateFrom : undefined;
    const dateToStr = typeof dateTo === 'string' ? dateTo : undefined;

    const visibleIds = await getVisibleSurveyIds(userId, isManager, surveyIdStr);

    // Assignments for this questionnaire scoped to visible surveys + dock filters.
    // The questionnaire was picked explicitly, so only the assignment-level
    // status applies here.
    const assignmentWhere: any = {
      ...completionWhere(
        readStatusFilters(req.query).completion,
        buildDateRange(dateFromStr, dateToStr)
      ),
      survey_questionnaire: {
        questionnaire_id: questionnaireId,
        survey_id: { in: visibleIds },
        ...(groupIdNum ? { questionnaire: { patient_group_id: groupIdNum } } : {}),
      },
    };
    if (accessModeStr) assignmentWhere.access_mode = accessModeStr;

    const [questionnaire, assignments] = await Promise.all([
      prisma.questionnaires.findUnique({
        where: { id: questionnaireId },
        select: { id: true, title: true, type: true },
      }),
      prisma.survey_questionnaire_patients_assignment.findMany({
        where: assignmentWhere,
        select: { id: true },
      }),
    ]);

    if (!questionnaire) return res.status(404).json({ error: 'Questionnaire not found' });

    const assignmentIds = assignments.map((a) => a.id);
    const totalRespondents = assignmentIds.length;

    const questionSelect = {
      id: true,
      question_code: true,
      question_kind: true,
      question_type: true,
      answer_profile_id: true,
    } as const;

    // Load modules with questions ordered by position
    const qModules = await prisma.questionnaires_modules.findMany({
      where: { questionnaire_id: questionnaireId, is_active: true },
      orderBy: { position: 'asc' },
      select: {
        position: true,
        module: {
          select: {
            id: true,
            name: true,
            type: true,
            cat_item_bank_id: true,
            modules_questions: {
              where: { is_active: true },
              orderBy: { position: 'asc' },
              select: { position: true, question: { select: questionSelect } },
            },
          },
        },
      },
    });

    // The adaptive engine picks its items out of the module's item bank at run
    // time, and not every item of the bank is linked to the module: the ones
    // answered in this selection are added after the linked ones.
    type QuestionRow = (typeof qModules)[number]['module']['modules_questions'][number]['question'];
    const bankItemsByModule = new Map<number, QuestionRow[]>();
    if (assignmentIds.length > 0) {
      for (const { module: mod } of qModules) {
        if (mod.type !== 'dynamic' || mod.cat_item_bank_id == null) continue;
        const bankItems = await prisma.questions.findMany({
          where: {
            cat_item_bank_id: mod.cat_item_bank_id,
            question_kind: 'cat',
            id: { notIn: mod.modules_questions.map((mq) => mq.question.id) },
            responses: { some: { assignment_id: { in: assignmentIds } } },
          },
          select: questionSelect,
          orderBy: { question_code: 'asc' },
        });
        bankItemsByModule.set(mod.id, bankItems);
      }
    }

    const engLangIds = await resolveEnglishLanguageIds(prisma);

    const allQuestions = [
      ...qModules.flatMap((qm) => qm.module.modules_questions.map((mq) => mq.question)),
      ...[...bankItemsByModule.values()].flat(),
    ];
    const idsOfKind = (kind: string) =>
      allQuestions.filter((q) => q.question_kind === kind).map((q) => q.id);

    if (allQuestions.length === 0 || assignmentIds.length === 0) {
      return res.json({
        data: {
          questionnaire,
          totalRespondents,
          modules: qModules.map((qm) => ({
            id: qm.module.id,
            name: qm.module.name,
            type: qm.module.type,
            questions: [],
          })),
        },
      });
    }

    // Load all responses for these assignments + questions
    const responses = await prisma.responses.findMany({
      where: {
        assignment_id: { in: assignmentIds },
        question_id: { in: allQuestions.map((q) => q.id) },
      },
      select: {
        question_id: true,
        answer_option_id: true,
        answer_text: true,
        socio_demo_answer_id: true,
        feedback_answer_id: true,
      },
    });

    // Answer option labels (English) of the static and CAT questions
    const profileIds = [
      ...new Set(allQuestions.map((q) => q.answer_profile_id).filter(Boolean) as number[]),
    ];
    const answerOptions =
      profileIds.length > 0
        ? await prisma.answer_options.findMany({
            where: { answer_profile_id: { in: profileIds } },
            select: {
              id: true,
              value: true,
              display_order: true,
              answer_profile_id: true,
              answer_option_i18n: {
                where: { language_id: { in: engLangIds } },
                select: { label: true },
                take: 1,
              },
            },
            orderBy: { display_order: 'asc' },
          })
        : [];

    const profileOptionsMap = new Map<
      number,
      { id: number; value: number; label: string; display_order: number }[]
    >();
    for (const opt of answerOptions) {
      const label = opt.answer_option_i18n[0]?.label ?? `Option ${opt.value}`;
      const arr = profileOptionsMap.get(opt.answer_profile_id) ?? [];
      arr.push({ id: opt.id, value: opt.value, label, display_order: opt.display_order });
      profileOptionsMap.set(opt.answer_profile_id, arr);
    }

    // Socio-demo and feedback options belong to the question and are stored in
    // the respondent's language: resolved to English through their order.
    const [socioIndex, feedbackIndex] = await Promise.all([
      loadQuestionLabelIndex(prisma, 'socio-demo', idsOfKind('socio-demo'), engLangIds),
      loadQuestionLabelIndex(prisma, 'feedback', idsOfKind('feedback'), engLangIds),
    ]);

    // Static and CAT question texts (English)
    const staticQIds = idsOfKind('static');
    const catQIds = idsOfKind('cat');
    const [staticTexts, catTexts] = await Promise.all([
      staticQIds.length > 0
        ? prisma.static_questions.findMany({
            where: { question_id: { in: staticQIds }, language_id: { in: engLangIds } },
            select: { question_id: true, question: true },
            orderBy: { language_id: 'asc' },
          })
        : [],
      catQIds.length > 0
        ? prisma.cat_questions.findMany({
            where: { question_id: { in: catQIds }, language_id: { in: engLangIds } },
            select: { question_id: true, question: true },
            orderBy: { language_id: 'asc' },
          })
        : [],
    ]);
    const questionTextMap = new Map<number, string>();
    for (const row of [...staticTexts, ...catTexts]) {
      if (!questionTextMap.has(row.question_id)) {
        questionTextMap.set(row.question_id, stripHtml(row.question ?? ''));
      }
    }

    // Index responses by question_id
    const respByQuestion = new Map<number, (typeof responses)[number][]>();
    for (const r of responses) {
      const arr = respByQuestion.get(r.question_id) ?? [];
      arr.push(r);
      respByQuestion.set(r.question_id, arr);
    }

    type Question = (typeof allQuestions)[number];

    /** One question's card, or null for a disclaimer. */
    const describeQuestion = (q: Question) => {
      const qResponses = respByQuestion.get(q.id) ?? [];
      const base = {
        questionId: q.id,
        questionCode: q.question_code,
        questionKind: q.question_kind,
      };

      // Socio-demo and feedback: English labels, in the options' own order.
      if (q.question_kind === 'socio-demo' || q.question_kind === 'feedback') {
        const index = q.question_kind === 'feedback' ? feedbackIndex : socioIndex;
        const meta = index.questionMeta.get(q.id);
        if (!meta || meta.disclaimer) return null;

        const counts = new Map<string, number>();
        let respondents = 0;
        for (const r of qResponses) {
          const labels = resolveAnswerLabels(r, meta, index.answerIdToEnglishLabel);
          if (labels.length === 0) continue;
          respondents += 1;
          for (const label of labels) counts.set(label, (counts.get(label) ?? 0) + 1);
        }
        const numeric = ['integer', 'number'].includes(meta.answerType.toLowerCase());
        const { chart, data } = buildDistribution(counts, respondents, meta.optionOrder, numeric);

        return {
          ...base,
          questionText: meta.text,
          totalResponses: respondents,
          distribution: data,
          chartType: chart,
        };
      }

      if (isDisclaimer(q.question_type, q.answer_profile_id != null)) return null;

      const questionText = questionTextMap.get(q.id) || q.question_code;
      const answeredCount = qResponses.filter((r) => r.answer_option_id || r.answer_text).length;

      // Static and adaptive items: count by answer option, in the options' order
      // with the skips last, as in every other chart (the kit lists them first).
      const opts = q.answer_profile_id ? (profileOptionsMap.get(q.answer_profile_id) ?? []) : [];
      const optCountMap = new Map<number, number>();
      // A skip saved as text rather than as an option (always the case on
      // adaptive items): counted under the skip option of the same name.
      const textSkips = new Map<string, number>();
      for (const r of qResponses) {
        if (r.answer_option_id) {
          optCountMap.set(r.answer_option_id, (optCountMap.get(r.answer_option_id) ?? 0) + 1);
        } else if (isSkipMarker(r.answer_text)) {
          const marker = r.answer_text!.trim();
          textSkips.set(marker, (textSkips.get(marker) ?? 0) + 1);
        }
      }
      const dist = [...opts]
        .sort(
          (a, b) =>
            Number(isSkipMarker(a.label)) - Number(isSkipMarker(b.label)) ||
            a.display_order - b.display_order
        )
        .map((opt) => {
          const count = (optCountMap.get(opt.id) ?? 0) + (textSkips.get(opt.label) ?? 0);
          textSkips.delete(opt.label);
          return { label: opt.label, count, percentage: percentage(count, answeredCount) };
        });
      // Skips the profile has no option for still show, after everything else.
      for (const [label, count] of [...textSkips].sort(([a], [b]) => a.localeCompare(b))) {
        dist.push({ label, count, percentage: percentage(count, answeredCount) });
      }
      // Options nobody chose are left out, as in the Demographics charts.
      const answered = dist.filter((d) => d.count > 0);

      return {
        ...base,
        questionText,
        totalResponses: answeredCount,
        distribution: answered,
        chartType: categoricalChart(answered.length),
      };
    };

    // Build output modules
    const modules = qModules.map((qm) => {
      const mod = qm.module;
      const questions = [
        ...mod.modules_questions.map((mq) => mq.question),
        ...(bankItemsByModule.get(mod.id) ?? []),
      ]
        .map(describeQuestion)
        .filter((q): q is NonNullable<typeof q> => q !== null);

      return {
        id: mod.id,
        name: mod.name,
        type: mod.type,
        questions,
      };
    });

    return res.json({ data: { questionnaire, totalRespondents, modules } });
  } catch (err) {
    return next(err);
  }
}
