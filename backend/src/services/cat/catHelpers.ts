/**
 * CAT Helper Functions
 * Utilities for mapping CAT items to local database questions, and for resolving
 * which scale(s)/CAT session(s) a dynamic module drives.
 */

import { PrismaClient } from '../../generated/app';

const prisma = new PrismaClient();

/**
 * Fixed preamble text (in the given language) for a CAT scale's session, from
 * cat_item_bank_scale_preambles — imported from the Questions sheet's "Pramble"
 * column. Shown on every question of the scale, not just the first. Returns ''
 * when the scale has no mapping or no preamble authored for that language.
 */
export async function getScalePreamble(
  catItemBankId: number,
  scaleCode: string,
  patientGroupId: number,
  languageId: number
): Promise<string> {
  const mapping = await prisma.cat_item_bank_scales.findUnique({
    where: {
      cat_item_bank_id_scale_code_patient_group_id: {
        cat_item_bank_id: catItemBankId,
        scale_code: scaleCode,
        patient_group_id: patientGroupId,
      },
    },
    select: { preambles: { where: { language_id: languageId }, select: { preamble: true } } },
  });
  return mapping?.preambles[0]?.preamble ?? '';
}

/**
 * Map CAT itemKey (e.g., "PF1") to local question_id.
 * Uses question_code as the mapping field, scoped to the CAT item bank the module
 * was populated from (items are bank-owned, not kit_version-owned).
 *
 * @param itemKey - The item key returned by CAT API
 * @param catItemBankId - The CAT item bank to search in
 * @returns Promise with question details or null if not found
 */
export async function mapCatItemToQuestion(
  itemKey: string,
  catItemBankId: number
): Promise<{
  id: number;
  question_code: string;
  question_kind: string;
  question_type: string | null;
  answer_profile_id: number | null;
  scale: string | null;
} | null> {
  try {
    const question = await prisma.questions.findFirst({
      where: {
        question_code: itemKey,
        cat_item_bank_id: catItemBankId,
        question_kind: 'cat',
      },
      select: {
        id: true,
        question_code: true,
        question_kind: true,
        question_type: true,
        answer_profile_id: true,
        scale: true,
      },
    });

    if (!question) {
      console.warn(`[CAT Helper] Question not found for itemKey: ${itemKey}, bank: ${catItemBankId}`);
      return null;
    }

    return question;
  } catch (error) {
    console.error(`[CAT Helper] Error mapping itemKey ${itemKey}:`, error);
    throw error;
  }
}

/**
 * Get full question details with translations for a CAT question
 *
 * @param questionId - The question ID from local database
 * @param languageId - Language ID for translations
 * @returns Promise with full question details including translations and answer options
 */
export async function getCatQuestionDetails(
  questionId: number,
  languageId: number
): Promise<any> {
  try {
    const question = await prisma.questions.findUnique({
      where: { id: questionId },
      include: {
        cat_questions: {
          where: {
            language_id: languageId,
          },
        },
        answer_profile: {
          include: {
            answer_options: {
              orderBy: {
                display_order: 'asc',
              },
              include: {
                answer_option_i18n: {
                  where: {
                    language_id: languageId,
                  },
                },
              },
            },
          },
        },
      },
    });

    if (!question) {
      console.warn(`[CAT Helper] Question ${questionId} not found`);
      return null;
    }

    // Get translation text
    const catTranslation = question.cat_questions[0];
    const questionText = catTranslation?.question || 'Translation not available';
    const isFallback = !catTranslation;

    // Get answer options
    const answerOptions = question.answer_profile?.answer_options.map((opt) => ({
      id: opt.id,
      value: opt.value,
      label: opt.answer_option_i18n[0]?.label || `Option ${opt.value}`,
      display_order: opt.display_order,
    })) || [];

    return {
      questionId: question.id,
      questionCode: question.question_code,
      questionKind: question.question_kind,
      questionType: question.question_type,
      questionText,
      // Overwritten by callers with getScalePreamble's result when the scale
      // this question belongs to has one — cat_questions itself never carries
      // a preamble (see getScalePreamble).
      questionPramble: '',
      isFallback,
      answerProfile: question.answer_profile ? {
        code: question.answer_profile.code,
        description: question.answer_profile.description,
      } : null,
      answerOptions,
    };
  } catch (error) {
    console.error(`[CAT Helper] Error getting question details for ${questionId}:`, error);
    throw error;
  }
}

/**
 * Get module details including the CAT item bank it was populated from.
 *
 * @param moduleId - The module ID
 * @returns Promise with module details including cat_item_bank
 */
export async function getModuleWithCatItemBank(moduleId: number): Promise<any> {
  try {
    const module = await prisma.modules.findUnique({
      where: { id: moduleId },
      include: {
        cat_item_bank: true,
        kit_version: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });

    if (!module) {
      console.warn(`[CAT Helper] Module ${moduleId} not found`);
      return null;
    }

    return module;
  } catch (error) {
    console.error(`[CAT Helper] Error getting module ${moduleId}:`, error);
    throw error;
  }
}

export interface ModuleScale {
  scale: string;
  catSettingId: number;
  settingKey: string;
  /**
   * The real `modules_questions.position` of this scale's first item — same
   * position space as the fixed questions returned by getFixedQuestionsForModule.
   * Lets the frontend merge fixed questions and adaptive scale entries into a
   * single walk order that matches the original Excel row order, instead of
   * always deferring every adaptive scale to the end of the module.
   */
  entryPosition: number;
  /**
   * The minimum number of items this scale's CAT engine setting requires
   * before it can stop (from the setting's own api_configuration, captured
   * when the cat_setting was fetched/created — see catService.
   * fetchApiConfiguration). Falls back to the maximum-items criterion, then
   * to 1, if the setting has no minimum-items criterion configured. Lets the
   * frontend progress bar count an in-progress adaptive scale's contribution
   * to "total items" without knowing in advance exactly which/how many items
   * the engine will end up asking.
   */
  minItems: number;
}

/**
 * Reads the minimum-items-to-stop count out of a cat_setting's stored
 * api_configuration (shape: { dimensionOrder, dimensions: {[name]: {
 * mininumNumberOfAnsweredItemsCriterion, maximumNumberOfAskedItemsCriterion }
 * } } — see catService.buildApiConfigurationFromSession). Single-dimension
 * settings are the norm here, so the first dimension in dimensionOrder is
 * used. Defaults to 1 when the configuration is missing/malformed (e.g. a
 * cat_setting that predates api_configuration being populated at all).
 */
function getMinItemsFromApiConfiguration(apiConfiguration: unknown): number {
  const config = apiConfiguration as
    | { dimensionOrder?: string[]; dimensions?: Record<string, any> }
    | null
    | undefined;
  const dimensionName = config?.dimensionOrder?.[0];
  const dimension = dimensionName ? config?.dimensions?.[dimensionName] : undefined;
  if (!dimension) return 1;

  const min = dimension.mininumNumberOfAnsweredItemsCriterion;
  if (min?.enable && typeof min.value === 'number' && min.value > 0) return min.value;

  const max = dimension.maximumNumberOfAskedItemsCriterion;
  if (max?.enable && typeof max.value === 'number' && max.value > 0) return max.value;

  return 1;
}

/**
 * Resolves the distinct IRT scales driven by a dynamic module's active questions
 * that are genuinely ADAPTIVE — i.e. IRT-scored AND mapped to a cat_setting for
 * this module's patient group in the "CatSettings" sheet. Scales are returned in a
 * stable order (by the minimum order_position of their questions) so the module
 * always walks through them in the same sequence for a given patient.
 *
 * Any scale that ISN'T in this list is handled as a FIXED question instead (see
 * getFixedQuestionsForModule below) — this covers two cases uniformly:
 *  - CTT-scored scales: never CAT-driven, scored classically. Always fixed.
 *  - IRT-scored scales with no CatSettings entry for this group: presented and
 *    answered like a static question, but still scored via a stateless CAT call
 *    at completion time (irtScoringService's dynamic-module variant) — there's
 *    just no adaptive SESSION for them, since no settingKey exists to drive one.
 *
 * The scale -> setting mapping is resolved for the module's OWN patient group — the
 * same scale can be driven by a different external CAT engine setting depending on
 * the group (the "CatSettings" sheet has one setting_key column per group).
 */
export async function getScalesForModule(moduleId: number): Promise<ModuleScale[]> {
  const module = await prisma.modules.findUnique({ where: { id: moduleId } });
  if (!module || !module.cat_item_bank_id) {
    throw new Error(`Module ${moduleId} is not a dynamic module with a CAT item bank`);
  }
  if (!module.patient_group_id) {
    throw new Error(`Module ${moduleId} has no patient group — cannot resolve CAT settings`);
  }

  const moduleQuestions = await prisma.modules_questions.findMany({
    where: { module_id: moduleId, is_active: true },
    include: { question: { select: { scale: true, score_system: true, order_position: true } } },
    orderBy: { position: 'asc' },
  });

  // Keyed by the real `position` column (not loop index) so it's directly
  // comparable to the positions getFixedQuestionsForModule returns.
  const firstPositionByScale = new Map<string, number>();
  moduleQuestions.forEach((mq) => {
    const scale = mq.question.scale;
    if (!scale) return;
    if ((mq.question.score_system ?? '').trim().toUpperCase() !== 'IRT') return;
    if (!firstPositionByScale.has(scale)) firstPositionByScale.set(scale, mq.position);
  });

  const scaleCodes = [...firstPositionByScale.keys()].sort(
    (a, b) => firstPositionByScale.get(a)! - firstPositionByScale.get(b)!
  );

  if (scaleCodes.length === 0) return [];

  const mappings = await prisma.cat_item_bank_scales.findMany({
    where: {
      cat_item_bank_id: module.cat_item_bank_id,
      scale_code: { in: scaleCodes },
      patient_group_id: module.patient_group_id,
    },
    include: {
      cat_setting: { select: { id: true, setting_key: true, api_configuration: true } },
    },
  });
  const mappingByScale = new Map(mappings.map((m) => [m.scale_code, m]));

  // Scales with no mapping are silently excluded (not thrown) — they're handled as
  // fixed questions instead, see getFixedQuestionsForModule.
  return scaleCodes.flatMap((scale) => {
    const mapping = mappingByScale.get(scale);
    if (!mapping || !mapping.cat_setting.setting_key) return [];
    return [
      {
        scale,
        catSettingId: mapping.cat_setting.id,
        settingKey: mapping.cat_setting.setting_key,
        entryPosition: firstPositionByScale.get(scale)!,
        minItems: getMinItemsFromApiConfiguration(mapping.cat_setting.api_configuration),
      },
    ];
  });
}

/**
 * Returns the active questions of a dynamic module that are NOT driven by an
 * adaptive CAT session — i.e. every question whose scale isn't in
 * getScalesForModule's result (CTT-scored questions, plus IRT-scored questions
 * whose scale has no CatSettings mapping for this module's group). These are
 * presented to the patient exactly like static-module questions.
 */
export async function getFixedQuestionsForModule(moduleId: number): Promise<
  { id: number; questionId: number; position: number }[]
> {
  const adaptiveScales = new Set((await getScalesForModule(moduleId)).map((s) => s.scale));

  const moduleQuestions = await prisma.modules_questions.findMany({
    where: { module_id: moduleId, is_active: true },
    select: { id: true, question_id: true, position: true, question: { select: { scale: true } } },
    orderBy: { position: 'asc' },
  });

  return moduleQuestions
    .filter((mq) => !mq.question.scale || !adaptiveScales.has(mq.question.scale))
    .map((mq) => ({ id: mq.id, questionId: mq.question_id, position: mq.position }));
}

/**
 * Finds the first scale of a module whose CAT session isn't complete yet (or hasn't
 * started), in the module's stable scale order. Returns null once every scale has a
 * completed session — i.e. the whole module is done.
 */
export async function getNextPendingScaleSession(
  moduleId: number,
  assignmentId: number
): Promise<ModuleScale | null> {
  const scales = await getScalesForModule(moduleId);
  if (scales.length === 0) return null;

  const sessions = await prisma.cat_module_sessions.findMany({
    where: { assignment_id: assignmentId, module_id: moduleId },
    select: { scale: true, is_completed: true },
  });
  const completedScales = new Set(sessions.filter((s) => s.is_completed).map((s) => s.scale));

  return scales.find((s) => !completedScales.has(s.scale)) ?? null;
}

/**
 * Batch map multiple CAT itemKeys to question IDs, scoped to a CAT item bank.
 * Useful for bulk operations.
 *
 * @param itemKeys - Array of item keys to map
 * @param catItemBankId - The CAT item bank to search in
 * @returns Promise with map of itemKey -> questionId
 */
export async function batchMapCatItems(
  itemKeys: string[],
  catItemBankId: number
): Promise<Map<string, number>> {
  try {
    const questions = await prisma.questions.findMany({
      where: {
        question_code: {
          in: itemKeys,
        },
        cat_item_bank_id: catItemBankId,
        question_kind: 'cat',
      },
      select: {
        id: true,
        question_code: true,
      },
    });

    const mapping = new Map<string, number>();
    questions.forEach((q) => {
      mapping.set(q.question_code, q.id);
    });

    // Log any missing mappings
    const missingKeys = itemKeys.filter((key) => !mapping.has(key));
    if (missingKeys.length > 0) {
      console.warn(`[CAT Helper] Missing questions for itemKeys:`, missingKeys);
    }

    return mapping;
  } catch (error) {
    console.error('[CAT Helper] Error in batch mapping:', error);
    throw error;
  }
}

export default {
  getScalePreamble,
  mapCatItemToQuestion,
  getCatQuestionDetails,
  getModuleWithCatItemBank,
  getScalesForModule,
  getNextPendingScaleSession,
  batchMapCatItems,
};
