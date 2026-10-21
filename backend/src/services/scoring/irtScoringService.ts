/**
 * IRT Scoring Service (static modules)
 *
 * Handles IRT-scored questions that appear inside static modules.
 * These questions have score_system='IRT' and a cat_id stored in
 * static_questions.cat_id (the item key used by the CAT API).
 *
 * Computes estimates via the stateless CAT endpoint
 * `POST /runner/estimates/{instrument}` — one call per module, covering every
 * IRT dimension (scale) the patient answered in that module. This does NOT
 * create or replay a session: it has no dependency on module.cat_setting,
 * unlike the dynamic (adaptive CAT) module flow, which is handled elsewhere
 * (catController.ts + the `dynamic` branch of scoringOrchestrator.ts) and is
 * unaffected by this service.
 */

import { PrismaClient } from '../../generated/app/index.js';
import * as catService from '../cat/catService.js';
import { isRealValue, loadAnswerProfileInfo } from './answerProfileInfo.js';
import type { IrtDimensionScore, ScaleScoreStatus } from './types.js';

const IRT_INSTRUMENT = 'QLQ-CAT';
const IRT_SCORE_ESTIMATION_METHOD = 'Eap';
const IRT_INFORMATION_ESTIMATION_METHOD = 'Fisher';
const IRT_ITEM_SELECTION_METHOD = 'MaxInformation';

/** questions.scale stores the ScaleCode (e.g. "PF_S"); the CAT engine's real
 *  dimension name drops the "_S" suffix (e.g. "PF"). */
function toDimensionKey(scaleCode: string): string {
  return scaleCode.replace(/_S$/, '');
}

// ---------------------------------------------------------------------------
// Return type
// ---------------------------------------------------------------------------

export interface IrtScoringResult {
  irt_dimensions: IrtDimensionScore[] | null;
  irt_status: ScaleScoreStatus;
}

interface IrtQuestion {
  id: number;
  scale: string | null;
  answer_profile_id: number | null;
  catId: string | null;
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

/**
 * Computes IRT scores for IRT-scored questions inside a static module.
 *
 * `not_applicable` is returned only when the module has no IRT question with
 * a resolvable cat_id (no dependency on cat_setting — the instrument is
 * fixed). `cat_error` is returned when the CAT API call itself fails.
 *
 * @param assignmentId The patient assignment id.
 * @param moduleId     The static module id.
 * @param prisma       The Prisma client instance.
 */
export async function computeIrtScoresForStaticModule(
  assignmentId: number,
  moduleId: number,
  prisma: PrismaClient
): Promise<IrtScoringResult> {
  // 1. Fetch IRT questions in the module (via modules_questions)
  const moduleQuestions = await prisma.modules_questions.findMany({
    where: {
      module_id: moduleId,
      is_active: true,
      question: { score_system: 'IRT' },
    },
    include: {
      question: {
        select: {
          id: true,
          scale: true,
          answer_profile_id: true,
          static_questions: {
            select: { cat_id: true, language_id: true },
          },
        },
      },
    },
  });

  const irtQuestions: IrtQuestion[] = moduleQuestions
    .map((mq) => ({
      id: mq.question.id,
      scale: mq.question.scale,
      answer_profile_id: mq.question.answer_profile_id,
      // Use the first static_questions row that has a cat_id (language-agnostic)
      catId: mq.question.static_questions.find((sq) => sq.cat_id)?.cat_id ?? null,
    }))
    .filter((q) => q.scale !== null && q.catId !== null);

  return computeIrtScoresCore(assignmentId, moduleId, irtQuestions, prisma);
}

/**
 * Computes IRT scores for a dynamic module's FIXED IRT questions — i.e. IRT-scored
 * scales with no CatSettings mapping for the module's patient group, so they were
 * presented and answered like static questions (fixed order, no adaptive session)
 * instead of via the external CAT engine's adaptive item selection. The score is
 * still computed via the same stateless CAT estimate call, keyed by the item key the
 * EORTC engine indexes its bank by: `cat_questions.cat_id` (the Questions sheet's
 * IRT_ItemCode, e.g. "AP4"), falling back to `question_code`.
 *
 * The fallback covers items loaded by the standalone CAT Item Bank upload, where
 * question_code IS the item key — the same assumption mapCatItemToQuestion makes for
 * the genuinely-adaptive flow. It does NOT hold for questions imported from a dynamic
 * kit version, whose question_code is the Excel QuestionID ("EUonQoL_014"): sending
 * that as an item key makes the engine find no usable response and return irt=0 with
 * information=0 for the whole dimension. Rows imported before cat_id existed still
 * have it null — re-run the dynamic upload to backfill them.
 *
 * @param assignmentId    The patient assignment id.
 * @param moduleId        The dynamic module id.
 * @param excludeScales   Scale codes to exclude — the module's genuinely-adaptive
 *                        scales (already scored via their own cat_module_sessions).
 * @param prisma          The Prisma client instance.
 */
export async function computeIrtScoresForDynamicModuleFixedQuestions(
  assignmentId: number,
  moduleId: number,
  excludeScales: Set<string>,
  prisma: PrismaClient
): Promise<IrtScoringResult> {
  const moduleQuestions = await prisma.modules_questions.findMany({
    where: {
      module_id: moduleId,
      is_active: true,
      question: { score_system: 'IRT' },
    },
    include: {
      question: {
        select: {
          id: true,
          scale: true,
          answer_profile_id: true,
          question_code: true,
          cat_questions: { select: { cat_id: true } },
        },
      },
    },
  });

  const irtQuestions: IrtQuestion[] = moduleQuestions
    .map((mq) => ({
      id: mq.question.id,
      scale: mq.question.scale,
      answer_profile_id: mq.question.answer_profile_id,
      // cat_questions has one row per language, all carrying the same item key —
      // take the first non-empty one, exactly as the static path does with
      // static_questions.cat_id.
      catId:
        mq.question.cat_questions.find((cq) => cq.cat_id)?.cat_id ?? mq.question.question_code,
    }))
    .filter((q) => q.scale !== null && q.catId !== null && !excludeScales.has(q.scale!));

  return computeIrtScoresCore(assignmentId, moduleId, irtQuestions, prisma);
}

/**
 * Shared scoring core for both the static-module and dynamic-module-fixed-questions
 * variants above — everything past "which questions, and what's each one's CAT item
 * key" is identical: prefetch answer-profile ranges, group by scale, call the
 * stateless CAT estimate endpoint once for the whole module, and shape the result.
 */
async function computeIrtScoresCore(
  assignmentId: number,
  moduleId: number,
  irtQuestions: IrtQuestion[],
  prisma: PrismaClient
): Promise<IrtScoringResult> {
  if (irtQuestions.length === 0) {
    return { irt_dimensions: null, irt_status: 'not_applicable' };
  }

  // 2. Prefetch answer-profile ranges (real min/max) + sentinel classification
  const profileIds = [
    ...new Set(irtQuestions.map((q) => q.answer_profile_id).filter((id): id is number => id !== null)),
  ];
  const profileInfo = await loadAnswerProfileInfo(prisma, profileIds);

  // 3. Fetch patient responses for those questions
  const questionIds = irtQuestions.map((q) => q.id);
  const responses = await prisma.responses.findMany({
    where: {
      assignment_id: assignmentId,
      question_id: { in: questionIds },
    },
    select: {
      question_id: true,
      answer_option: { select: { value: true } },
    },
  });
  const responseMap = new Map<number, number>();
  for (const r of responses) {
    if (r.answer_option?.value !== undefined && r.answer_option?.value !== null) {
      responseMap.set(r.question_id, r.answer_option.value);
    }
  }

  // 4. Group by scale (dimension) and build the request body
  const byScale = new Map<string, IrtQuestion[]>();
  for (const q of irtQuestions) {
    const arr = byScale.get(q.scale!) ?? [];
    arr.push(q);
    byScale.set(q.scale!, arr);
  }

  const body: Record<
    string,
    {
      scoreEstimationMethod: string;
      informationEstimationMethod: string;
      itemSelectionMethod: string;
      responses: Record<string, number | null>;
      lastScoreEstimation: { Irt: number };
    }
  > = {};
  const dimensionKeyToScale = new Map<string, string>();
  const dimensionTotals = new Map<string, number>();
  const dimensionMissing = new Map<string, number>();

  for (const [scale, questions] of byScale) {
    const dimensionKey = toDimensionKey(scale);
    const responsesForDimension: Record<string, number | null> = {};
    let missingCount = 0;

    for (const question of questions) {
      const value = responseMap.get(question.id);
      const info = question.answer_profile_id !== null ? profileInfo.get(question.answer_profile_id) : undefined;

      // Any non-real value (SKIP_PAT -1, SKIP_SYS -2, NA, PNTA, or no
      // response at all) is omitted from the payload entirely — only
      // genuine positive answers are sent to CAT, but it still counts as
      // missing/total_items for reporting.
      if (value === undefined || !info || !isRealValue(info, value)) {
        missingCount++;
        continue;
      }

      // Sent as stored locally (1-indexed): getResponseEstimates owns the
      // single 1->0-indexed conversion at the CAT API boundary, exactly like
      // setResponse does for the adaptive path. Converting here too would
      // shift every category down twice (a raw 1 would reach the engine as
      // -1, an invalid category the engine treats as unanswered).
      responsesForDimension[question.catId!] = value;
    }

    dimensionTotals.set(dimensionKey, questions.length);
    dimensionMissing.set(dimensionKey, missingCount);
    dimensionKeyToScale.set(dimensionKey, scale);

    if (Object.keys(responsesForDimension).length === 0) {
      continue; // nothing real to estimate for this dimension
    }

    body[dimensionKey] = {
      scoreEstimationMethod: IRT_SCORE_ESTIMATION_METHOD,
      informationEstimationMethod: IRT_INFORMATION_ESTIMATION_METHOD,
      itemSelectionMethod: IRT_ITEM_SELECTION_METHOD,
      lastScoreEstimation: { Irt: 0 },
      responses: responsesForDimension,
    };
  }

  // 5. Build the not_applicable entries for dimensions with no real answers
  const dimensionScores: IrtDimensionScore[] = [];
  for (const [dimensionKey, scale] of dimensionKeyToScale) {
    if (!body[dimensionKey]) {
      dimensionScores.push({
        dimension: scale,
        irt: null,
        information: null,
        missing_items: dimensionMissing.get(dimensionKey) ?? 0,
        total_items: dimensionTotals.get(dimensionKey) ?? 0,
        status: 'not_applicable',
      });
    }
  }

  if (Object.keys(body).length === 0) {
    return { irt_dimensions: dimensionScores, irt_status: 'not_applicable' };
  }

  // 6. One call for the whole module, covering every dimension with real answers
  try {
    const estimates = await catService.getResponseEstimates(IRT_INSTRUMENT, body);

    for (const [dimensionKey, scale] of dimensionKeyToScale) {
      if (!body[dimensionKey]) continue; // already added as not_applicable above
      const estimate = estimates[dimensionKey];
      dimensionScores.push({
        dimension: scale,
        irt: estimate?.irt ?? null,
        information: estimate?.information ?? null,
        missing_items: dimensionMissing.get(dimensionKey) ?? 0,
        total_items: dimensionTotals.get(dimensionKey) ?? 0,
        status: estimate ? 'computed' : 'cat_error',
      });
    }

    return { irt_dimensions: dimensionScores, irt_status: 'computed' };
  } catch (error) {
    console.error(
      `[IRT] Failed to retrieve CAT estimates for module ${moduleId} (assignment ${assignmentId}):`,
      error
    );

    for (const [dimensionKey, scale] of dimensionKeyToScale) {
      if (!body[dimensionKey]) continue;
      dimensionScores.push({
        dimension: scale,
        irt: null,
        information: null,
        missing_items: dimensionMissing.get(dimensionKey) ?? 0,
        total_items: dimensionTotals.get(dimensionKey) ?? 0,
        status: 'cat_error',
      });
    }

    return { irt_dimensions: dimensionScores, irt_status: 'cat_error' };
  }
}
