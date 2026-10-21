/**
 * Scoring Orchestrator
 *
 * Coordinates CTT and IRT scoring for a single module of a patient assignment.
 *
 * Routing rules:
 *  - dynamic module → CAT session already completed; read estimates from saved session data.
 *  - static/feedback module → run CTT engine (cttScoringService) + optionally IRT routing
 *    for IRT-tagged questions (irtScoringService).
 *
 * This is the only entry-point that publicController should call for scoring.
 * It never throws — errors are captured and reflected in status fields.
 */

import type { CttNormEntry } from '../../config/cttNorms.js';
import { CTT_SCALE_NORMS } from '../../config/cttNorms.js';
import { PrismaClient } from '../../generated/app/index.js';
import * as catService from '../cat/catService.js';
import { CatSession } from '../cat/types.js';
import { computeCttScores } from './cttScoringService.js';
import {
  computeIrtScoresForDynamicModuleFixedQuestions,
  computeIrtScoresForStaticModule,
} from './irtScoringService.js';
import type { CttScaleScore, ModuleScoreResult, ScaleScoreStatus } from './types.js';

// ---------------------------------------------------------------------------
// Module shape expected by the orchestrator
// ---------------------------------------------------------------------------

export interface OrchestratorModule {
  id: number;
  name: string;
  type: string; // 'static' | 'dynamic' | 'feedback'
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

/**
 * Computes the full scoring result for a single module.
 *
 * @param assignmentId  The patient assignment id.
 * @param module        The module descriptor (id, name, type, cat_setting).
 * @param prisma        The Prisma client instance.
 * @param cttNorms      The CTT normative dictionary to use for T-score computation.
 *                      Falls back to the static CTT_SCALE_NORMS file if not provided.
 */
export async function orchestrateModuleScoring(
  assignmentId: number,
  module: OrchestratorModule,
  prisma: PrismaClient,
  cttNorms: CttNormEntry[] = CTT_SCALE_NORMS
): Promise<ModuleScoreResult> {
  const completedAt = new Date().toISOString();

  // ------------------------------------------------------------------
  // Dynamic modules — a mix of up to three scoring paths per scale:
  //  - genuinely adaptive scales: one cat_module_sessions row each, scored via
  //    the session-based getEstimates call;
  //  - fixed IRT scales (IRT-scored, no CatSettings mapping for this group):
  //    presented/answered like static questions, scored via the same stateless
  //    CAT estimate call used for static-module IRT questions;
  //  - fixed CTT scales: presented/answered like static questions, scored via
  //    the normal classical CTT engine (computeCttScores already scopes itself
  //    to score_system='CTT' regardless of module type).
  // A module with only fixed scales (no adaptive session at all) is a fully
  // valid outcome now, not an error — each path fails independently so one
  // scale's failure doesn't blank out the others' already-computed results.
  // ------------------------------------------------------------------
  if (module.type === 'dynamic') {
    const sessions = await prisma.cat_module_sessions.findMany({
      where: { assignment_id: assignmentId, module_id: module.id },
    });
    const adaptiveScales = new Set(sessions.map((s) => s.scale));

    const irtDimensions: NonNullable<ModuleScoreResult['irt_dimensions']> = [];
    let anyIrtFailed = false;

    for (const catSession of sessions) {
      try {
        const session = catSession.session_data as unknown as CatSession;
        const estimates = await catService.getEstimates(session);

        for (const [dimension, score] of Object.entries(estimates)) {
          const dimensionProgress = session.progress?.dimensions?.find((d) => d.name === dimension);
          const usedItems = dimensionProgress?.usedItemKeys?.length ?? 0;
          irtDimensions.push({
            dimension,
            scale: catSession.scale,
            irt: score.irt,
            information: score.information,
            // A completed adaptive session answers every item it asks — there is
            // no "missing" concept distinct from CTT/static-module scoring here.
            missing_items: 0,
            total_items: usedItems,
            status: 'computed' as const,
          });
        }
      } catch (error) {
        anyIrtFailed = true;
        console.error(
          `[Scoring] Failed CAT scoring for module ${module.id}, scale "${catSession.scale}" (assignment ${assignmentId}):`,
          error
        );
      }
    }

    try {
      const fixedIrtResult = await computeIrtScoresForDynamicModuleFixedQuestions(
        assignmentId,
        module.id,
        adaptiveScales,
        prisma
      );
      if (fixedIrtResult.irt_dimensions) {
        irtDimensions.push(...fixedIrtResult.irt_dimensions.map((d) => ({ ...d, scale: d.dimension })));
      }
      if (fixedIrtResult.irt_status === 'cat_error') anyIrtFailed = true;
    } catch (error) {
      anyIrtFailed = true;
      console.error(
        `[Scoring] Unexpected error in fixed-IRT scoring for dynamic module ${module.id} (assignment ${assignmentId}):`,
        error
      );
    }

    let cttScales: CttScaleScore[] = [];
    try {
      cttScales = await computeCttScores(assignmentId, module.id, prisma, cttNorms);
    } catch (error) {
      console.error(
        `[Scoring] Unexpected error in CTT scoring for dynamic module ${module.id} (assignment ${assignmentId}):`,
        error
      );
    }

    return {
      type: 'dynamic',
      module_name: module.name,
      completed_at: completedAt,
      ctt_scales: cttScales,
      irt_dimensions: irtDimensions.length > 0 ? irtDimensions : null,
      irt_status:
        irtDimensions.length > 0 || anyIrtFailed
          ? anyIrtFailed
            ? 'cat_error'
            : 'computed'
          : 'not_applicable',
      ctt_norms_version_id: null,
      ctt_norms_version_name: null,
    };
  }

  // ------------------------------------------------------------------
  // Static / feedback modules
  // ------------------------------------------------------------------
  const moduleType = module.type === 'feedback' ? 'feedback' : 'static';

  // CTT scoring — never throws; errors logged internally and reflected in status
  let cttScales: CttScaleScore[] = [];
  try {
    cttScales = await computeCttScores(assignmentId, module.id, prisma, cttNorms);
  } catch (error) {
    console.error(
      `[Scoring] Unexpected error in CTT scoring for module ${module.id} (assignment ${assignmentId}):`,
      error
    );
  }

  // IRT scoring for static modules with IRT questions
  let irtDimensions = null;
  let irtStatus: ScaleScoreStatus = 'not_applicable';
  if (module.type === 'static') {
    try {
      const irtResult = await computeIrtScoresForStaticModule(assignmentId, module.id, prisma);
      irtDimensions = irtResult.irt_dimensions;
      irtStatus = irtResult.irt_status;
    } catch (error) {
      console.error(
        `[Scoring] Unexpected error in IRT scoring for module ${module.id} (assignment ${assignmentId}):`,
        error
      );
      irtStatus = 'cat_error';
    }
  }

  return {
    type: moduleType,
    module_name: module.name,
    completed_at: completedAt,
    ctt_scales: cttScales,
    irt_dimensions: irtDimensions,
    irt_status: irtStatus,
    ctt_norms_version_id: null,
    ctt_norms_version_name: null,
  };
}
