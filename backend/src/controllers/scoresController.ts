import { NextFunction, Request, Response } from 'express';
import { PrismaClient } from '../generated/app/index.js';
import {
  buildDateRange,
  completionWhere,
  questionnaireScope,
  readStatusFilters,
} from '../helpers/statusFilters.js';
import { getVisibleSurveyIds } from '../helpers/surveyScope.js';
import {
  ALL_SCORE_METRICS,
  combinedScales,
  inspectMetric,
  isMetricSelection,
  SCORE_METRICS,
  scoreExtractor,
  type MetricSelection,
} from '../services/scores/scoreExtraction.js';
import {
  loadQuestionLabelIndex,
  resolveAnswerLabels,
  resolveEnglishLanguageIds,
} from '../services/scores/questionLabels.js';
import { byQuestionPosition, loadQuestionPositions } from '../services/dashboard/answerDistribution.js';
import { loadSurveyScaleNames } from '../services/scores/surveyScaleNames.js';
import { describe } from '../services/scores/statistics.js';

const prisma = new PrismaClient();

/**
 * The `questionId` that asks for no breakdown at all: every respondent in one
 * category, to read the scores of the whole sample.
 */
const OVERALL_VARIABLE = 'overall';
const OVERALL_CATEGORY = 'All respondents';

/**
 * Upper bound on assignments pulled into one cross-tab. Each carries a `scores`
 * JSONB blob, so this caps both memory and response time.
 */
const MAX_ASSIGNMENTS = Number(process.env.MAX_SCORE_CROSSTAB_ASSIGNMENTS ?? 20_000);

/**
 * Cap on raw values returned per cell when `includeValues` is set.
 *
 * Density estimates and strip plots are visually identical past a few hundred
 * points, so beyond this the values are thinned by even sampling rather than
 * truncated — truncating would bias the distribution towards the lowest scores.
 */
const MAX_CELL_VALUES = 300;

function thin(values: number[], limit: number): number[] {
  if (values.length <= limit) return values;
  const step = values.length / limit;
  const out: number[] = [];
  for (let i = 0; i < limit; i++) out.push(values[Math.floor(i * step)]);
  return out;
}

function parseIntParam(value: unknown): number | undefined {
  if (typeof value !== 'string' || !value.trim()) return undefined;
  const parsed = parseInt(value, 10);
  return Number.isNaN(parsed) ? undefined : parsed;
}

function parseStringParam(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value : undefined;
}

/** Assignment filter shared by both endpoints, mirroring the dashboard dock. */
function buildAssignmentWhere(surveyId: number, req: Request): Record<string, unknown> {
  const questionnaireId = parseIntParam(req.query.questionnaireId);
  const groupId = parseIntParam(req.query.groupId);
  const accessMode = parseStringParam(req.query.accessMode);
  const dateFrom = parseStringParam(req.query.dateFrom);
  const dateTo = parseStringParam(req.query.dateTo);

  // The survey was picked explicitly, so only the questionnaire and assignment
  // levels of the dock's status filters apply. Scoring only runs on completion,
  // so in-progress assignments carry no scores and simply contribute nothing.
  const statuses = readStatusFilters(req.query);

  const where: Record<string, unknown> = {
    ...completionWhere(statuses.completion, buildDateRange(dateFrom, dateTo)),
    survey_questionnaire: {
      survey_id: surveyId,
      questionnaire: questionnaireScope(statuses.questionnaire, groupId),
      ...(questionnaireId ? { questionnaire_id: questionnaireId } : {}),
    },
  };

  if (accessMode) where.access_mode = accessMode;

  return where;
}

/** Resolves the survey and checks the caller may read it. */
async function requireVisibleSurvey(
  req: Request,
  res: Response
): Promise<{ id: number; name: string } | null> {
  const surveyId = parseIntParam(req.query.surveyId);
  if (surveyId === undefined) {
    res.status(400).json({ success: false, message: 'A surveyId is required' });
    return null;
  }

  const visibleIds = await getVisibleSurveyIds(
    req.user?.id,
    req.user?.user_type === 'manager',
    String(surveyId)
  );
  if (!visibleIds.includes(surveyId)) {
    res.status(403).json({ success: false, message: 'You do not have access to this survey' });
    return null;
  }

  const survey = await prisma.surveys.findUnique({
    where: { id: surveyId },
    select: { id: true, name: true },
  });
  if (!survey) {
    res.status(404).json({ success: false, message: 'Survey not found' });
    return null;
  }

  return survey;
}

/**
 * GET /euonqol-api/dashboard/scores/options
 *
 * What the cross-tab can be built from for a given survey: the socio-demographic
 * questions its respondents actually answered, and the scales that actually carry
 * a computed score for each metric. Both are derived from the data rather than
 * from the catalogue, so the UI never offers a combination that yields nothing.
 */
export async function getScoreCrossOptions(req: Request, res: Response, next: NextFunction) {
  try {
    const survey = await requireVisibleSurvey(req, res);
    if (!survey) return;

    const assignmentWhere = buildAssignmentWhere(survey.id, req);

    const assignments = await prisma.survey_questionnaire_patients_assignment.findMany({
      where: assignmentWhere,
      select: { id: true, scores: true },
      take: MAX_ASSIGNMENTS,
    });

    const scaleNames = await loadSurveyScaleNames(prisma, survey.id);

    if (assignments.length === 0) {
      return res.json({
        data: {
          survey,
          respondents: 0,
          questions: [],
          scalesByMetric: {},
          skippedByMetric: {},
          scaleNames,
          metrics: SCORE_METRICS,
        },
      });
    }

    // Per metric: the scales that carry a usable value, plus how many entries
    // exist but were never computed — that count is what lets the UI say why a
    // metric is unavailable instead of quietly hiding it.
    const scoresList = assignments.map((a) => a.scores);
    const scalesByMetric: Record<string, string[]> = {};
    const skippedByMetric: Record<string, number> = {};

    for (const metric of ALL_SCORE_METRICS) {
      const { scales, skipped } = inspectMetric(scoresList, metric);
      scalesByMetric[metric] = scales;
      skippedByMetric[metric] = skipped;
    }
    // Both metrics together, as the `all` selection names them.
    scalesByMetric.all = combinedScales(scalesByMetric.ctt_t, scalesByMetric.irt);
    skippedByMetric.all = skippedByMetric.ctt_t + skippedByMetric.irt;

    // Which socio-demo questions these respondents answered.
    const socioResponses = await prisma.responses.findMany({
      where: {
        assignment_id: { in: assignments.map((a) => a.id) },
        question: { question_kind: 'socio-demo' },
      },
      select: { question_id: true },
      distinct: ['question_id'],
    });

    const questionIds = socioResponses.map((r) => r.question_id);
    const [{ questionMeta }, positions] = await Promise.all([
      loadQuestionLabelIndex(
        prisma,
        'socio-demo',
        questionIds,
        await resolveEnglishLanguageIds(prisma)
      ),
      loadQuestionPositions(prisma, questionIds),
    ]);

    // In questionnaire order, as the Demographics tab lists them. Disclaimers
    // have nothing to cross by.
    const questions = [...questionMeta.values()]
      .filter((q) => !q.disclaimer)
      .sort(byQuestionPosition(positions))
      .map((q) => ({ id: q.id, code: q.code, text: q.text, answerType: q.answerType }));

    return res.json({
      data: {
        survey,
        respondents: assignments.length,
        questions,
        scalesByMetric,
        skippedByMetric,
        scaleNames,
        metrics: SCORE_METRICS,
      },
    });
  } catch (err) {
    return next(err);
  }
}

/**
 * GET /euonqol-api/dashboard/scores/cross
 *
 * Crosses one socio-demographic question against the score scales: for every
 * (answer category × scale) pair it returns the distribution of scores, which the
 * heatmap reads as a single central value and the boxplot as a five-number
 * summary.
 *
 * Query: surveyId, questionId, metric, scales (csv, optional) + dock filters.
 * `questionId=overall` crosses by nothing: every respondent in one category.
 */
export async function getScoreCrossTab(req: Request, res: Response, next: NextFunction) {
  try {
    const survey = await requireVisibleSurvey(req, res);
    if (!survey) return;

    const overall = req.query.questionId === OVERALL_VARIABLE;
    const questionId = overall ? undefined : parseIntParam(req.query.questionId);
    if (!overall && questionId === undefined) {
      return res.status(400).json({ success: false, message: 'A questionId is required' });
    }

    const metricParam = parseStringParam(req.query.metric) ?? 'ctt_t';
    if (!isMetricSelection(metricParam)) {
      return res.status(400).json({ success: false, message: `Unknown metric: ${metricParam}` });
    }
    const metric: MetricSelection = metricParam;

    // Violin, ridgeline and strip plots need the distribution itself, not just
    // its summary; the other charts do not, so this is opt-in.
    const includeValues = req.query.includeValues === 'true';

    const requestedScales = parseStringParam(req.query.scales)
      ?.split(',')
      .map((s) => s.trim())
      .filter(Boolean);

    const assignmentWhere = buildAssignmentWhere(survey.id, req);

    const assignments = await prisma.survey_questionnaire_patients_assignment.findMany({
      where: assignmentWhere,
      select: { id: true, scores: true },
      take: MAX_ASSIGNMENTS,
    });

    if (assignments.length === 0) {
      return res.json({
        data: { survey, metric, question: null, categories: [], scales: [], cells: [] },
      });
    }

    // assignment → its category label(s). Multiple-choice answers put one
    // respondent in several categories at once.
    const labelsByAssignment = new Map<number, string[]>();
    let question: { id: number; code: string; text: string; answerType: string };

    if (questionId === undefined) {
      for (const a of assignments) labelsByAssignment.set(a.id, [OVERALL_CATEGORY]);
      question = { id: 0, code: OVERALL_VARIABLE, text: OVERALL_CATEGORY, answerType: '' };
    } else {
      // The chosen question's answers, one response per assignment.
      const responses = await prisma.responses.findMany({
        where: { assignment_id: { in: assignments.map((a) => a.id) }, question_id: questionId },
        select: { assignment_id: true, answer_text: true, socio_demo_answer_id: true },
      });

      const { answerIdToEnglishLabel, questionMeta } = await loadQuestionLabelIndex(
        prisma,
        'socio-demo',
        [questionId],
        await resolveEnglishLanguageIds(prisma)
      );
      const meta = questionMeta.get(questionId);
      if (!meta) {
        return res
          .status(404)
          .json({ success: false, message: 'Socio-demographic question not found' });
      }

      for (const r of responses) {
        const labels = resolveAnswerLabels(r, meta, answerIdToEnglishLabel);
        if (labels.length > 0) labelsByAssignment.set(r.assignment_id, labels);
      }
      question = { id: meta.id, code: meta.code, text: meta.text, answerType: meta.answerType };
    }

    // Collect raw values per (category, scale) before summarising.
    const buckets = new Map<string, number[]>();
    const categories = new Set<string>();
    const scalesSeen = new Set<string>();
    let respondentsWithBoth = 0;
    const extract = scoreExtractor(metric, assignments.map((a) => a.scores));

    for (const assignment of assignments) {
      const labels = labelsByAssignment.get(assignment.id);
      if (!labels) continue;

      const byScale = extract(assignment.scores);
      if (byScale.size === 0) continue;

      respondentsWithBoth++;

      for (const label of labels) {
        categories.add(label);
        for (const [scale, value] of byScale) {
          if (requestedScales && requestedScales.length > 0 && !requestedScales.includes(scale)) {
            continue;
          }
          scalesSeen.add(scale);
          const key = `${label} ${scale}`;
          const list = buckets.get(key);
          if (list) list.push(value);
          else buckets.set(key, [value]);
        }
      }
    }

    const scales = [...scalesSeen].sort();
    const cells: Record<string, unknown>[] = [];

    for (const category of categories) {
      for (const scale of scales) {
        const values = buckets.get(`${category} ${scale}`);
        const stats = values ? describe(values) : null;
        // Cells with no observations are emitted as null stats so the client can
        // draw them as absent rather than as a zero.
        cells.push({
          category,
          scale,
          stats,
          ...(includeValues && values
            ? { values: thin([...values].sort((a, b) => a - b), MAX_CELL_VALUES) }
            : {}),
        });
      }
    }

    return res.json({
      data: {
        survey,
        metric,
        question,
        respondents: respondentsWithBoth,
        categories: [...categories].sort(),
        scales,
        cells,
      },
    });
  } catch (err) {
    return next(err);
  }
}
