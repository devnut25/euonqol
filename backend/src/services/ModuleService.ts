import { prisma } from '../config/database.js';
import { QueryBuilder } from '../helpers/QueryBuilder.js';
import { ServiceError } from '../helpers/ServiceError.js';
import { getModuleBaseFilters, ModuleModelConfig, ModuleScopes, ModuleScopeResolvers } from '../models/Module.js';

export interface CreateModuleInput {
  kitVersionId: number;
  name: string;
  type: string;
  patientGroupId?: number | null;
  groupName?: string | null;
  catSettingId?: number | null;
  catItemBankId?: number | null;
  createdBy?: string | null;
  // A module cannot exist without questions: at least one is required.
  questions: ModuleQuestionData[];
}

export interface UpdateModuleInput {
  name?: string;
  is_active?: boolean;
  patientGroupId?: number | null;
  groupName?: string | null;
}

export interface ModuleQuestionOptions {
  languageId?: number;
  includeInactive?: boolean;
}

export interface ModuleQuestionData {
  questionId: number;
  position: number;
  isActive?: boolean;
}

const VALID_MODULE_TYPES = ['static', 'dynamic', 'socio-demo', 'feedback'] as const;

export class ModuleService {
  /**
   * Returns a paginated list of modules matching the query params.
   */
  static async getList(query: Record<string, any>) {
    // If filter[type] contains a scope key (e.g. 'kit-module', 'additional-module'),
    // resolve it to the DB `type` IN condition and strip it from the standard filter
    // so QueryBuilder doesn't try to match it as a literal DB value.
    const typeFilterValue = query.filter?.type as string | undefined;
    const baseFilter = getModuleBaseFilters(typeFilterValue);
    const isScope =
      typeFilterValue !== undefined && Object.keys(ModuleScopes).includes(typeFilterValue);
    const resolvedQuery = isScope
      ? { ...query, filter: { ...query.filter, type: undefined } }
      : query;

    const { where, orderBy, include, take, skip } = QueryBuilder.for(
      ModuleModelConfig,
      resolvedQuery
    )
      .withBaseFilters(baseFilter)
      .build();

    const [total, modules] = await Promise.all([
      prisma.modules.count({ where }),
      prisma.modules.findMany({
        where,
        include: {
          ...include,
          _count: {
            select: {
              modules_questions: { where: { is_active: true } },
              questionnaires_modules: true,
            },
          },
          patient_group: { select: { id: true, name: true, description: true } },
          cat_item_bank: { select: { id: true, name: true } },
        },
        orderBy,
        take,
        skip,
      }),
    ]);

    const moduleIds = modules.map((m) => m.id);
    let langCountMap = new Map<number, number>();
    let surveyCountMap = new Map<number, number>();
    if (moduleIds.length > 0) {
      const [langRows, surveyRows] = await Promise.all([
        prisma.$queryRaw<{ module_id: number; language_count: bigint }[]>`
          SELECT module_id, language_count
          FROM euonqol.module_language_counts
          WHERE module_id = ANY(${moduleIds}::int[])
        `,
        // Distinct surveys reached through the questionnaires that include the module
        prisma.$queryRaw<{ module_id: number; survey_count: bigint }[]>`
          SELECT qm.module_id, COUNT(DISTINCT sq.survey_id) AS survey_count
          FROM euonqol.questionnaires_modules qm
          JOIN euonqol.surveys_questionnaires sq ON sq.questionnaire_id = qm.questionnaire_id
          WHERE qm.module_id = ANY(${moduleIds}::int[])
          GROUP BY qm.module_id
        `,
      ]);
      langCountMap = new Map(langRows.map((r) => [r.module_id, Number(r.language_count)]));
      surveyCountMap = new Map(surveyRows.map((r) => [r.module_id, Number(r.survey_count)]));
    }

    const modulesWithLang = modules.map((m) => ({
      ...m,
      language_count: langCountMap.get(m.id) ?? 0,
      survey_count: surveyCountMap.get(m.id) ?? 0,
    }));

    return { modules: modulesWithLang, total, take, skip };
  }

  /**
   * Returns modules matching query params, with optional scope filters declared in ModuleScopeResolvers.
   * Active scope keys are stripped from the filter before QueryBuilder processes remaining params.
   */
  static async getAll(query: Record<string, any>) {
    const filter = (query.filter as Record<string, any>) ?? {};
    const baseFilters: Record<string, any>[] = [];
    const cleanedFilter = { ...filter };

    for (const [scopeKey, resolver] of Object.entries(ModuleScopeResolvers)) {
      if (filter[scopeKey]) {
        const { where, consumedKeys } = resolver(filter);
        baseFilters.push(where);
        for (const key of consumedKeys) delete cleanedFilter[key];
      }
    }

    const resolvedQuery = { ...query, filter: cleanedFilter };

    const { where, orderBy, include, take, skip } = QueryBuilder.for(ModuleModelConfig, resolvedQuery)
      .withBaseFilters(baseFilters)
      .build();

    const effectiveTake = take > 0 ? take : undefined;

    const [total, modules] = await Promise.all([
      prisma.modules.count({ where }),
      prisma.modules.findMany({
        where,
        include,
        orderBy,
        ...(effectiveTake !== undefined ? { take: effectiveTake } : {}),
        skip,
      }),
    ]);

    return { modules, total, take: effectiveTake ?? total, skip };
  }

  /**
   * Returns a single module by ID, or null if not found.
   */
  static async getById(id: number) {
    const module = await prisma.modules.findUnique({
      where: { id },
      include: {
        patient_group: { select: { id: true, name: true, description: true } },
        cat_setting: { select: { id: true, name: true, description: true } },
        cat_item_bank: { select: { id: true, name: true } },
        _count: {
          select: {
            modules_questions: true,
            questionnaires_modules: true,
          },
        },
      },
    });

    if (!module) return null;

    const [langRow] = await prisma.$queryRaw<{ languages: any }[]>`
      SELECT languages FROM euonqol.module_language_counts WHERE module_id = ${id}
    `;

    // Dynamic modules are now structured group-based just like static ones — the
    // question list (with per-question `scale`) is loaded the same way for both.
    const { questions } = await ModuleService.getModuleQuestions(id, { languageId: 29 });

    return { ...module, languages: langRow?.languages ?? [], questions };
  }

  /**
   * Creates a new module after validating input.
   * Throws ServiceError on business-level failures.
   */
  static async create(data: CreateModuleInput, userId?: string | null) {
    const {
      kitVersionId,
      name,
      type,
      patientGroupId,
      groupName,
      catSettingId,
      catItemBankId,
      questions,
    } = data;

    if (!VALID_MODULE_TYPES.includes(type as any)) {
      throw new ServiceError(`type must be one of: ${VALID_MODULE_TYPES.join(', ')}`, 400);
    }

    if (!Array.isArray(questions) || !questions.some((q) => q.isActive !== false)) {
      throw new ServiceError('A module must contain at least one active question', 400);
    }

    if (type === 'dynamic' && !catItemBankId) {
      throw new ServiceError('catItemBankId is required for dynamic (CAT) modules', 400);
    }

    const kitVersion = await prisma.kit_versions.findUnique({ where: { id: kitVersionId } });
    if (!kitVersion) throw new ServiceError('Kit version not found', 404);

    if (patientGroupId) {
      const patientGroup = await prisma.patient_groups.findUnique({
        where: { id: patientGroupId },
      });
      if (!patientGroup) throw new ServiceError('Patient group not found', 404);
    }

    // catSettingId is kept only for backward-compat with any direct API caller still
    // passing it — dynamic modules now resolve their CAT setting(s) per-scale via the
    // module's cat_item_bank_id, not this single FK.
    if (catSettingId) {
      const catSetting = await prisma.cat_settings.findUnique({ where: { id: catSettingId } });
      if (!catSetting) throw new ServiceError('CAT setting not found', 404);
    }

    if (catItemBankId) {
      const catItemBank = await prisma.cat_item_banks.findUnique({ where: { id: catItemBankId } });
      if (!catItemBank) throw new ServiceError('CAT item bank not found', 404);
    }

    await ModuleService.assertQuestionsMatchModule(
      { type, kit_version_id: kitVersionId, cat_item_bank_id: catItemBankId ?? null },
      questions.map((q) => q.questionId)
    );

    // Module and its questions are written in a single nested create, so a module
    // never exists without its questions.
    return prisma.modules.create({
      data: {
        kit_version_id: kitVersionId,
        name,
        type,
        is_active: true,
        patient_group_id: patientGroupId ?? null,
        group_name: groupName ?? null,
        cat_setting_id: catSettingId ?? null,
        cat_item_bank_id: catItemBankId ?? null,
        created_by: userId ?? null,
        modules_questions: {
          createMany: {
            data: questions.map(({ questionId, position, isActive = true }) => ({
              question_id: questionId,
              position,
              is_active: isActive,
              created_by: userId ?? null,
            })),
          },
        },
      },
      include: {
        kit_version: { select: { id: true, name: true } },
        patient_group: { select: { id: true, name: true, description: true } },
        cat_setting: { select: { id: true, name: true, description: true } },
        cat_item_bank: { select: { id: true, name: true } },
        _count: { select: { modules_questions: true, questionnaires_modules: true } },
      },
    });
  }

  /**
   * Updates an existing module.
   * Throws ServiceError if not found.
   */
  static async update(id: number, data: UpdateModuleInput) {
    const existing = await prisma.modules.findUnique({ where: { id } });
    if (!existing) throw new ServiceError('Module not found', 404);

    if (data.patientGroupId) {
      const patientGroup = await prisma.patient_groups.findUnique({
        where: { id: data.patientGroupId },
      });
      if (!patientGroup) throw new ServiceError('Patient group not found', 404);
    }

    return prisma.modules.update({
      where: { id },
      data: {
        name: data.name ?? existing.name,
        is_active: data.is_active ?? existing.is_active,
        patient_group_id:
          data.patientGroupId !== undefined ? data.patientGroupId : existing.patient_group_id,
        group_name: data.groupName !== undefined ? data.groupName : existing.group_name,
      },
      include: {
        kit_version: { select: { id: true, name: true } },
        patient_group: { select: { id: true, name: true, description: true } },
        cat_setting: { select: { id: true, name: true, description: true } },
        cat_item_bank: { select: { id: true, name: true } },
        _count: { select: { modules_questions: true, questionnaires_modules: true } },
      },
    });
  }

  /**
   * Deletes a module.
   * Throws ServiceError if not found or if in use by questionnaires.
   * If this was the last module of its kit version, the kit version is removed too, so
   * its name (unique) can be used again for a new upload:
   * - its questions have no recorded answers → the kit version is deleted along with
   *   its questions (translations and files cascade);
   * - otherwise the answers must be kept, so the kit version is deactivated and renamed
   *   to free the name.
   */
  static async delete(id: number) {
    const module = await prisma.modules.findUnique({
      where: { id },
      include: { _count: { select: { questionnaires_modules: true } } },
    });

    if (!module) throw new ServiceError('Module not found', 404);

    if (module._count.questionnaires_modules > 0) {
      throw new ServiceError(
        `Cannot delete module: it is used in ${module._count.questionnaires_modules} questionnaire(s)`,
        400
      );
    }

    let kitVersionDeleted = false;

    await prisma.$transaction(async (tx) => {
      await tx.modules.delete({ where: { id } });

      const kitVersionId = module.kit_version_id;
      const remainingModules = await tx.modules.count({ where: { kit_version_id: kitVersionId } });
      if (remainingModules > 0) return;

      // Feedback/socio-demo answers would cascade away with the questions, so any
      // recorded answer means the kit version must be kept.
      const ofKit = { kit_version_id: kitVersionId };
      const [responses, feedbackAnswers, socioDemoAnswers] = await Promise.all([
        tx.responses.count({ where: { question: ofKit } }),
        tx.feedback_answers.count({ where: { question_rel: ofKit } }),
        tx.socio_demo_answers.count({ where: { question_rel: ofKit } }),
      ]);

      if (responses + feedbackAnswers + socioDemoAnswers === 0) {
        // init.sql declares patient_group_questions ON DELETE RESTRICT.
        await tx.patient_group_questions.deleteMany({ where: { question: ofKit } });
        await tx.kit_versions.delete({ where: { id: kitVersionId } });
      } else {
        const kitVersion = await tx.kit_versions.findUniqueOrThrow({ where: { id: kitVersionId } });
        const suffix = ` (deleted #${kitVersionId})`;
        await tx.kit_versions.update({
          where: { id: kitVersionId },
          data: { name: kitVersion.name.slice(0, 120 - suffix.length) + suffix, is_active: false },
        });
      }
      kitVersionDeleted = true;
    });

    return { ...module, kitVersionDeleted };
  }

  /**
   * Returns the ordered list of questions for a module, with translations.
   */
  static async getModuleQuestions(id: number, options: ModuleQuestionOptions = {}) {
    const { languageId = 14, includeInactive = false } = options;

    const module = await prisma.modules.findUnique({
      where: { id },
      include: { kit_version: { select: { id: true, name: true } } },
    });

    if (!module) throw new ServiceError('Module not found', 404);

    const moduleQuestions = await prisma.modules_questions.findMany({
      where: {
        module_id: id,
        ...(includeInactive ? {} : { is_active: true }),
      },
      include: {
        question: {
          include: {
            answer_profile: { select: { code: true, description: true } },
            static_questions: {
              where: { language_id: languageId },
              select: { head: true, question: true },
            },
            cat_questions: {
              where: { language_id: languageId },
              select: { question: true },
            },
            socio_demo_questions: {
              where: { language_id: languageId },
              select: { question_text: true },
            },
            feedback_question_translations: {
              where: { language_id: languageId },
              select: { question_text: true },
            },
            socio_demo_answers: {
              where: { language_id: languageId },
              select: { id: true, answer_text: true, answer_type: true, display_order: true },
              orderBy: { display_order: 'asc' },
            },
          },
        },
      },
      orderBy: { position: 'asc' },
    });

    const formattedQuestions = moduleQuestions.map((mq) => {
      const q = mq.question;
      let questionText = '';
      let questionHead = '';
      let isFallback = false;

      if (q.question_kind === 'static' && q.static_questions.length > 0) {
        questionText = q.static_questions[0].question || '';
        questionHead = q.static_questions[0].head || '';
      } else if (q.question_kind === 'cat' && q.cat_questions.length > 0) {
        questionText = q.cat_questions[0].question || '';
      } else if (q.question_kind === 'socio-demo' && q.socio_demo_questions.length > 0) {
        questionText = q.socio_demo_questions[0].question_text || '';
      } else if (q.question_kind === 'feedback' && q.feedback_question_translations.length > 0) {
        questionText = q.feedback_question_translations[0].question_text || '';
      } else {
        isFallback = true;
        questionText = `[Translation missing for language ${languageId}]`;
      }

      return {
        moduleQuestionId: mq.id,
        questionId: q.id,
        questionCode: q.question_code,
        questionKind: q.question_kind,
        questionType: q.question_type,
        questionHead,
        questionText,
        isFallback,
        position: mq.position,
        isActive: mq.is_active,
        answerProfile: q.answer_profile
          ? { code: q.answer_profile.code, description: q.answer_profile.description }
          : null,
        createdAt: mq.created_at,
        // CTT scale grouping (matches cttScoringService.ts's own question filter) — used by
        // the questionnaire's "Norms" step to check the selected version covers every scale.
        scale: q.scale,
        scoreSystem: q.score_system,
      };
    });

    return { module, questions: formattedQuestions };
  }

  /**
   * Bulk upserts the questions of a module.
   * Validates that all question IDs exist and match the module type.
   */
  static async updateModuleQuestions(
    id: number,
    questions: ModuleQuestionData[],
    userId?: string | null
  ) {
    const module = await prisma.modules.findUnique({ where: { id } });
    if (!module) throw new ServiceError('Module not found', 404);

    await ModuleService.assertQuestionsMatchModule(
      module,
      questions.map((q) => q.questionId)
    );

    for (const questionData of questions) {
      const { questionId, position, isActive = true } = questionData;
      await prisma.modules_questions.upsert({
        where: { module_id_question_id: { module_id: id, question_id: questionId } },
        update: { position, is_active: isActive },
        create: {
          module_id: id,
          question_id: questionId,
          position,
          is_active: isActive,
          created_by: userId ?? null,
        },
      });
    }

    const activeQuestions = await prisma.modules_questions.count({
      where: { module_id: id, is_active: true },
    });

    return { module, affectedCount: questions.length, activeQuestions };
  }

  /**
   * Checks that every question ID exists, belongs to the module's kit version (or CAT
   * item bank for dynamic modules) and has the question kind matching the module type.
   * Throws ServiceError otherwise.
   */
  private static async assertQuestionsMatchModule(
    module: { type: string; kit_version_id: number; cat_item_bank_id: number | null },
    questionIds: number[]
  ) {
    // Dynamic modules' questions are bank-owned, not kit_version-owned.
    const existingQuestions = await prisma.questions.findMany({
      where:
        module.type === 'dynamic'
          ? { id: { in: questionIds }, cat_item_bank_id: module.cat_item_bank_id }
          : { id: { in: questionIds }, kit_version_id: module.kit_version_id },
    });

    if (existingQuestions.length !== questionIds.length) {
      throw new ServiceError(
        module.type === 'dynamic'
          ? 'Some question IDs do not exist or do not belong to the same CAT item bank'
          : 'Some question IDs do not exist or do not belong to the same kit version',
        400
      );
    }

    const kindMap: Record<string, string> = {
      static: 'static',
      dynamic: 'cat',
      'socio-demo': 'socio-demo',
      feedback: 'feedback',
    };
    const expectedKind = kindMap[module.type];

    const invalidQuestions = existingQuestions.filter((q) => q.question_kind !== expectedKind);
    if (invalidQuestions.length > 0) {
      throw new ServiceError(
        `Module type "${module.type}" requires questions of kind "${expectedKind}"`,
        400
      );
    }
  }
}
