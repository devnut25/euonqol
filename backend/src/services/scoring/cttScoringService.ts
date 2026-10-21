/**
 * CTT Scoring Service
 *
 * Computes CTT scale scores (raw 0–100 + T-score) for all CTT questions
 * belonging to a given module and patient assignment.
 *
 * Does NOT handle IRT scoring — that is the responsibility of irtScoringService.
 */

import type { CttNormEntry } from '../../config/cttNorms.js';
import { CTT_SCALE_NORMS } from '../../config/cttNorms.js';
import { PrismaClient } from '../../generated/app/index.js';
import { isRealValue, loadAnswerProfileInfo } from './answerProfileInfo.js';
import {
  computeTScore,
  isMissingWithinThreshold,
  ItemDirection,
  meanScore,
  scoreItem,
  ScoringError,
} from './cttItemScoring.js';
import type { CttScaleScore } from './types.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface QuestionWithProfile {
  id: number;
  scale: string | null;
  direction: string | null;
  answer_profile_id: number | null;
}

interface ResponseWithValue {
  question_id: number;
  answer_option: { value: number } | null;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** Groups an array of items by a string key derived from each item. */
function groupBy<T>(items: T[], keyFn: (item: T) => string): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const item of items) {
    const key = keyFn(item);
    const group = map.get(key);
    if (group) {
      group.push(item);
    } else {
      map.set(key, [item]);
    }
  }
  return map;
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

/**
 * Computes CTT scale scores for every CTT question in the given module.
 *
 * Steps:
 *  1. Fetch all active CTT questions in the module (via modules_questions join).
 *  2. Prefetch answer-profile ranges (real min/max) and SKIP_SYS sentinel values.
 *  3. Prefetch patient responses for those questions.
 *  4. For each scale: drop SKIP_SYS items entirely (never shown to the patient —
 *     not scored, not counted as missing, not counted in total_items); treat
 *     SKIP_PAT/NA/PNTA/unanswered items as missing; score the rest and compute
 *     mean + T-score.
 *
 * @param assignmentId  The patient assignment id.
 * @param moduleId      The module id to score.
 * @param prisma        The Prisma client instance.
 */
export async function computeCttScores(
  assignmentId: number,
  moduleId: number,
  prisma: PrismaClient,
  cttNorms: CttNormEntry[] = CTT_SCALE_NORMS
): Promise<CttScaleScore[]> {
  // 1. Fetch all active CTT questions in the module
  const moduleQuestions = await prisma.modules_questions.findMany({
    where: {
      module_id: moduleId,
      is_active: true,
      question: {
        score_system: 'CTT',
        scale: { not: null },
      },
    },
    include: {
      question: {
        select: {
          id: true,
          scale: true,
          direction: true,
          answer_profile_id: true,
        },
      },
    },
  });

  if (moduleQuestions.length === 0) {
    return [];
  }

  const cttQuestions: QuestionWithProfile[] = moduleQuestions.map((mq) => mq.question);
  const questionIds = cttQuestions.map((q) => q.id);

  // 2. Prefetch answer-profile ranges (real min/max) + SKIP_SYS sentinel values
  const profileIds = [
    ...new Set(
      cttQuestions.map((q) => q.answer_profile_id).filter((id): id is number => id !== null)
    ),
  ];
  const profileInfo = await loadAnswerProfileInfo(prisma, profileIds);

  // 3. Prefetch patient responses for these questions
  const responsesRaw = await prisma.responses.findMany({
    where: {
      assignment_id: assignmentId,
      question_id: { in: questionIds },
    },
    select: {
      question_id: true,
      answer_option: { select: { value: true } },
    },
  });

  // Build map: questionId → ResponseWithValue (only entries where answer_option is set)
  const responseMap = new Map<number, ResponseWithValue>();
  for (const r of responsesRaw) {
    responseMap.set(r.question_id, r);
  }

  // 4. Group CTT questions by scale and compute per-scale results
  const byScale = groupBy(cttQuestions, (q) => q.scale!);
  const results: CttScaleScore[] = [];

  for (const [scaleName, scaleQuestionsRaw] of byScale) {
    // System-skipped items (SKIP_SYS) were never shown to the patient — ignore
    // them entirely: not scored, not counted as missing, not part of total_items.
    const scaleQuestions = scaleQuestionsRaw.filter((question) => {
      const value = responseMap.get(question.id)?.answer_option?.value;
      if (value === undefined || value === null) return true;
      const profileId = question.answer_profile_id;
      if (profileId === null) return true;
      const info = profileInfo.get(profileId);
      if (!info) return true;
      return !info.skipSystemValues.has(value);
    });

    const totalItems = scaleQuestions.length;

    const itemScores: number[] = [];
    let missingCount = 0;

    for (const question of scaleQuestions) {
      const value = responseMap.get(question.id)?.answer_option?.value;

      if (value === undefined || value === null) {
        missingCount++;
        continue;
      }

      const profileId = question.answer_profile_id;
      if (profileId === null) {
        missingCount++;
        console.warn(
          `[CTT] Question ${question.id} in scale "${scaleName}" has no answer_profile — item excluded.`
        );
        continue;
      }

      const info = profileInfo.get(profileId);
      if (!info) {
        missingCount++;
        console.warn(
          `[CTT] No answer options found for profile ${profileId} (question ${question.id}) — item excluded.`
        );
        continue;
      }

      // SKIP_PAT / NA / PNTA (or any other non-real value): missing item,
      // excluded from scoring but counted against the missing-items threshold.
      if (!isRealValue(info, value)) {
        missingCount++;
        continue;
      }

      try {
        const direction = question.direction as ItemDirection;
        const itemScore = scoreItem(value, info.min, info.max, direction);
        itemScores.push(itemScore);
      } catch (err) {
        missingCount++;
        if (err instanceof ScoringError) {
          console.warn(
            `[CTT] Scoring error for question ${question.id} in scale "${scaleName}": ${err.message}`
          );
        } else {
          throw err;
        }
      }
    }

    // 4a. Missing threshold check
    if (!isMissingWithinThreshold(missingCount, totalItems)) {
      results.push({
        scale: scaleName,
        score_system: 'CTT',
        raw_0_100_score: null,
        t_score: null,
        missing_items: missingCount,
        total_items: totalItems,
        status: 'missing_too_many_items',
      });
      continue;
    }

    // 4b. Compute mean (0–100) over non-missing items
    const raw0100 = meanScore(itemScores);

    if (raw0100 === null) {
      // All scored items were skipped (no profiles / range errors)
      results.push({
        scale: scaleName,
        score_system: 'CTT',
        raw_0_100_score: null,
        t_score: null,
        missing_items: missingCount,
        total_items: totalItems,
        status: 'missing_too_many_items',
      });
      continue;
    }

    // 4c. T-score — scaleName here is the raw ScaleCode (question.scale), matched
    // directly against each norms entry's scaleCode.
    const tScore = computeTScore(raw0100, scaleName, cttNorms);

    results.push({
      scale: scaleName,
      score_system: 'CTT',
      raw_0_100_score: raw0100,
      t_score: tScore,
      missing_items: missingCount,
      total_items: totalItems,
      status: tScore !== null ? 'computed' : 'no_norms',
    });
  }

  return results;
}
