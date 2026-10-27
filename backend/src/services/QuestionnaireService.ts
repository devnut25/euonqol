import crypto from 'crypto';
import { type Prisma } from '../generated/app/index.js';
import { prisma } from '../config/database.js';
import { getScalesForModule } from './cat/catHelpers.js';
import { QueryBuilder } from '../helpers/QueryBuilder.js';
import { ServiceError } from '../helpers/ServiceError.js';
import { assertManualTransition } from '../helpers/statusTransitions.js';
import { getSurveyPrerequisites } from '../helpers/surveyPrerequisites.js';
import { QuestionnaireModelConfig } from '../models/Questionnaire.js';
import { ModuleTypeEnum } from '../config/enums.js';
import { attachUserRefOne } from './keycloakUserRefs.js';
import type {
  CreateQuestionnaireInput,
  UpdateQuestionnaireInput,
} from '../validators/schemas/questionnaire.js';

export type { CreateQuestionnaireInput, UpdateQuestionnaireInput };

const QUESTIONNAIRE_DETAIL_INCLUDE = {
  patient_group: { select: { id: true, name: true, description: true } },
  ctt_norms_version: { select: { id: true, name: true } },
};

/** Fields the questionnaire payloads have always exposed for the creating user. */
const CREATOR_FIELDS = ['id', 'username', 'email'] as const;

/**
 * A questionnaire must contain exactly one kit module: either a static or a dynamic
 * one, never both. Socio-demo and feedback modules are unrestricted.
 * Returns the kit module's type, which is the questionnaire's type.
 */
async function validateKitModules(
  moduleIds: number[],
  db: Pick<Prisma.TransactionClient, 'modules'> = prisma
): Promise<'static' | 'dynamic'> {
  const foundModuleTypes = await db.modules.findMany({
    where: { id: { in: moduleIds } },
    select: { id: true, type: true },
  });
  const kitModules = foundModuleTypes.filter(
    (m) => m.type === ModuleTypeEnum.STATIC || m.type === ModuleTypeEnum.DYNAMIC
  );
  const kitModulesCount = kitModules.length;
  if (kitModulesCount === 0) {
    throw new ServiceError(
      'A questionnaire must include at least one kit module (static or dynamic)',
      400
    );
  }
  if (kitModulesCount > 1) {
    throw new ServiceError(
      'A questionnaire can include only one kit module: either static or dynamic, not both',
      400
    );
  }
  return kitModules[0].type as 'static' | 'dynamic';
}

export class QuestionnaireService {
  /**
   * Creates a questionnaire within a survey, links it, and optionally attaches modules.
   * Throws ServiceError on business-level failures.
   */
  static async create(surveyId: number, data: CreateQuestionnaireInput, userId?: string | null) {
    const {
      title,
      description,
      patient_group_id,
      modules: modulesPayload,
      ctt_norms_version_id,
      max_completions,
    } = data;

    const survey = await prisma.surveys.findUnique({
      where: { id: surveyId },
    });

    if (!survey) {
      throw new ServiceError('Survey not found', 404);
    }

    // The survey's questionnaire composition is locked as soon as it leaves DRAFT.
    if (survey.status !== 'draft') {
      throw new ServiceError(
        'Cannot create a questionnaire: the survey composition is locked once it leaves draft status',
        409
      );
    }

    const prerequisites = await getSurveyPrerequisites(surveyId);
    if (!prerequisites.canCreateQuestionnaire) {
      throw new ServiceError(
        'Cannot create a questionnaire until the survey has at least one presentation, one active eligibility question, one active privacy policy, and one closing message configured.',
        422
      );
    }

    if (survey.access_mode === 'anonymous_spontaneous') {
      const activeCount = await prisma.surveys_questionnaires.count({
        where: { survey_id: surveyId, questionnaire: { status: 'public' } },
      });
      if (activeCount >= 1) {
        throw new ServiceError(
          'Anonymous Spontaneous surveys can only contain one active questionnaire. Disable the existing active questionnaire before adding a new one.',
          422
        );
      }
    }

    const patientGroup = await prisma.patient_groups.findUnique({
      where: { id: patient_group_id },
    });

    if (!patientGroup) {
      throw new ServiceError('Patient group not found', 404);
    }

    try {
      const created = await prisma.$transaction(async (tx) => {
        const moduleIds = modulesPayload.map((m) => Number(m.moduleId));
        // The type always follows the kit module, never the client payload.
        const type = await validateKitModules(moduleIds, tx);
        if (type === 'static' && !ctt_norms_version_id) {
          throw new ServiceError('ctt_norms_version_id is required for static questionnaires', 400);
        }

        const questionnaire = await tx.questionnaires.create({
          data: {
            title,
            description,
            patient_group_id,
            type,
            status: 'draft',
            ctt_norms_version_id: ctt_norms_version_id ?? null,
            max_completions: max_completions ?? null,
            created_by: userId || null,
          },
          include: QUESTIONNAIRE_DETAIL_INCLUDE,
        });

        await tx.surveys_questionnaires.create({
          data: {
            survey_id: surveyId,
            questionnaire_id: questionnaire.id,
            is_active: true,
          },
        });

        if (Array.isArray(modulesPayload) && modulesPayload.length > 0) {
          await Promise.all(
            modulesPayload.map((m, index) =>
              tx.questionnaires_modules.create({
                data: {
                  questionnaire_id: questionnaire.id,
                  module_id: Number(m.moduleId),
                  position: m.position ?? index,
                  is_active: true,
                },
              })
            )
          );
        }

        return questionnaire;
      });

      // Outside the transaction: this reads from Keycloak, a different connection.
      return attachUserRefOne(created, (q) => q.created_by, 'creator', CREATOR_FIELDS);
    } catch (error: any) {
      if (error instanceof ServiceError) throw error;
      if (error.code === 'P2002') {
        throw new ServiceError('This questionnaire is already linked to this survey', 409);
      }
      throw error;
    }
  }

  /**
   * Returns a paginated list of questionnaires linked to a survey.
   */
  static async getSurveyQuestionnaires(surveyId: number, query: Record<string, any>) {
    const survey = await prisma.surveys.findUnique({
      where: { id: surveyId },
      select: { id: true, name: true, status: true },
    });

    if (!survey) {
      throw new ServiceError('Survey not found', 404);
    }

    const { questionnaires, total, take, skip } =
      await QuestionnaireService.listSurveyQuestionnaires({ survey_id: surveyId }, query);

    const activeQuestionnairesCount = await prisma.surveys_questionnaires.count({
      where: { survey_id: surveyId, questionnaire: { status: 'active' } },
    });

    return { questionnaires, total, take, skip, survey, activeQuestionnairesCount };
  }

  /**
   * Paginated questionnaires listing rooted on `surveys_questionnaires`, so every row
   * carries its survey and completion counts. `baseWhere` scopes the listing (a survey,
   * a CTT norms version, ...); the table query params are applied on top.
   */
  private static async listSurveyQuestionnaires(
    baseWhere: Prisma.surveys_questionnairesWhereInput,
    query: Record<string, any>
  ) {
    const {
      where: questionnaireWhere,
      orderBy: questionnaireOrderBy,
      take,
      skip,
    } = QueryBuilder.for(QuestionnaireModelConfig, query).build();

    // Root entity for this listing is `surveys_questionnaires`, so the questionnaire-level
    // where/orderBy built above must be nested under the `questionnaire` relation.
    const surveyQuestionnaireWhere: Prisma.surveys_questionnairesWhereInput = {
      ...baseWhere,
      questionnaire: { ...(baseWhere.questionnaire as object), ...questionnaireWhere },
    };
    const resolvedOrderBy = questionnaireOrderBy
      ? questionnaireOrderBy.map((o) => ({
          questionnaire: o as Record<string, 'asc' | 'desc'>,
        }))
      : [{ questionnaire: { created_at: 'asc' as const } }];

    const [total, surveyQuestionnaires] = await Promise.all([
      prisma.surveys_questionnaires.count({ where: surveyQuestionnaireWhere }),
      prisma.surveys_questionnaires.findMany({
        where: surveyQuestionnaireWhere,
        include: {
          questionnaire: {
            include: {
              patient_group: { select: { id: true, name: true, description: true } },
              _count: { select: { questionnaires_modules: true } },
            },
          },
          survey: { select: { id: true, name: true, status: true } },
          _count: {
            select: { survey_assignments: { where: { completion_status: 'completed' } } },
          },
        },
        orderBy: resolvedOrderBy,
        skip,
        take,
      }),
    ]);

    const inProgressGroups = await prisma.survey_questionnaire_patients_assignment.groupBy({
      by: ['survey_questionnaire_id'],
      where: {
        survey_questionnaire_id: { in: surveyQuestionnaires.map((sq) => sq.id) },
        completion_status: 'in_progress',
      },
      _count: { id: true },
    });
    const inProgressBySq = new Map(
      inProgressGroups.map((g) => [g.survey_questionnaire_id, g._count.id])
    );

    const questionnaires = surveyQuestionnaires.map((sq) => ({
      id: sq.questionnaire.id,
      title: sq.questionnaire.title,
      description: sq.questionnaire.description,
      type: sq.questionnaire.type,
      status: sq.questionnaire.status,
      patient_group: sq.questionnaire.patient_group,
      moduleCount: sq.questionnaire._count.questionnaires_modules,
      assignmentCount: sq._count.survey_assignments,
      // Started (opened the link) but never submitted — completion_status stays
      // 'in_progress' from first open until final submit (see publicController.ts).
      inProgressCount: inProgressBySq.get(sq.id) ?? 0,
      max_completions: (sq.questionnaire as any).max_completions ?? null,
      has_public_link: !!sq.public_link,
      survey: sq.survey,
      surveyQuestionnaireId: sq.id,
      surveyQuestionnaireIsActive: sq.is_active,
      created_at: sq.questionnaire.created_at,
      updated_at: sq.questionnaire.updated_at,
    }));

    return { questionnaires, total, take, skip };
  }

  /**
   * Returns a paginated list of the questionnaires that use a CTT norms version.
   * Supports `filter[survey]` (one or more survey ids).
   */
  static async getCttNormQuestionnaires(normId: number, query: Record<string, any>) {
    const norm = await prisma.ctt_norms_versions.findUnique({
      where: { id: normId },
      select: { id: true },
    });

    if (!norm) {
      throw new ServiceError('CTT norms version not found', 404);
    }

    const { surveyWhere, query: listingQuery } = QuestionnaireService.extractSurveyFilter(query);

    return QuestionnaireService.listSurveyQuestionnaires(
      { questionnaire: { ctt_norms_version_id: normId }, ...surveyWhere },
      listingQuery
    );
  }

  /**
   * Returns a paginated list of the questionnaires that include a dynamic module
   * built on a CAT item bank. Supports `filter[survey]` (one or more survey ids).
   */
  static async getCatItemBankQuestionnaires(bankId: number, query: Record<string, any>) {
    const bank = await prisma.cat_item_banks.findUnique({
      where: { id: bankId },
      select: { id: true },
    });

    if (!bank) {
      throw new ServiceError('CAT item bank not found', 404);
    }

    const { surveyWhere, query: listingQuery } = QuestionnaireService.extractSurveyFilter(query);

    return QuestionnaireService.listSurveyQuestionnaires(
      {
        questionnaire: {
          questionnaires_modules: { some: { module: { cat_item_bank_id: bankId } } },
        },
        ...surveyWhere,
      },
      listingQuery
    );
  }

  /**
   * Returns a paginated list of the questionnaires that include a module.
   * Supports `filter[survey]` (one or more survey ids).
   */
  static async getModuleQuestionnaires(moduleId: number, query: Record<string, any>) {
    const module = await prisma.modules.findUnique({
      where: { id: moduleId },
      select: { id: true },
    });

    if (!module) {
      throw new ServiceError('Module not found', 404);
    }

    const { surveyWhere, query: listingQuery } = QuestionnaireService.extractSurveyFilter(query);

    return QuestionnaireService.listSurveyQuestionnaires(
      {
        questionnaire: { questionnaires_modules: { some: { module_id: moduleId } } },
        ...surveyWhere,
      },
      listingQuery
    );
  }

  /**
   * `filter[survey]` targets surveys_questionnaires, not the questionnaire QueryBuilder
   * nests the filters under: pull it out of the query and turn it into a root condition.
   */
  private static extractSurveyFilter(query: Record<string, any>) {
    const { survey: surveyFilter, ...filter } = (query.filter as Record<string, any>) ?? {};
    const surveyIds = [surveyFilter]
      .flat()
      .filter((v) => v !== undefined && v !== '')
      .map((v) => parseInt(String(v), 10))
      .filter((v) => !isNaN(v));

    return {
      surveyWhere: surveyIds.length > 0 ? { survey_id: { in: surveyIds } } : {},
      query: { ...query, filter },
    };
  }

  /**
   * Returns a single questionnaire with its survey, modules and computed counts.
   */
  static async getById(id: number) {
    const questionnaire = await prisma.questionnaires.findUnique({
      where: { id },
      include: {
        ctt_norms_version: { select: { id: true, name: true, description: true } },
        patient_group: { select: { id: true, name: true, description: true } },
        questionnaires_modules: {
          where: { is_active: true },
          orderBy: { position: 'asc' },
          include: {
            module: {
              include: {
                kit_version: { select: { id: true, name: true } },
                cat_setting: { select: { id: true, name: true, api_configuration: true } },
                _count: { select: { modules_questions: true } },
              },
            },
          },
        },
        surveys_questionnaires: {
          include: { survey: { select: { id: true, name: true, status: true } } },
        },
      },
    });

    if (!questionnaire) {
      throw new ServiceError('Questionnaire not found', 404);
    }

    const totalQuestions = questionnaire.questionnaires_modules.reduce(
      (sum, qm) => sum + qm.module._count.modules_questions,
      0
    );

    const totalAssignments = await prisma.survey_questionnaire_patients_assignment.count({
      where: { survey_questionnaire: { questionnaire_id: id } },
    });

    // A questionnaire is only ever associated with the single survey it was created under.
    const survey = questionnaire.surveys_questionnaires[0]?.survey ?? null;

    const modules = questionnaire.questionnaires_modules.map((qm) => ({
      questionnaireModuleId: qm.id,
      position: qm.position,
      is_active: qm.is_active,
      module: {
        id: qm.module.id,
        name: qm.module.name,
        type: qm.module.type,
        is_active: qm.module.is_active,
        kitVersion: qm.module.kit_version,
        catSetting: qm.module.cat_setting
          ? {
              id: qm.module.cat_setting.id,
              name: qm.module.cat_setting.name,
              api_configuration: qm.module.cat_setting.api_configuration,
            }
          : null,
        questionCount: qm.module._count.modules_questions,
      },
    }));

    const withCreator = await attachUserRefOne(
      questionnaire,
      (q) => q.created_by,
      'creator',
      CREATOR_FIELDS
    );

    return {
      ...withCreator,
      survey,
      modules,
      totalQuestions,
      totalAssignments,
      has_public_link: !!questionnaire.surveys_questionnaires[0]?.public_link,
    };
  }

  /**
   * Updates questionnaire details, enforcing the draft/public/disabled/completed
   * state machine. COMPLETED is terminal. draft/completed are automatic-only
   * targets and can never be requested manually — see helpers/statusTransitions.ts.
   */
  static async update(id: number, data: UpdateQuestionnaireInput) {
    const {
      title,
      description,
      status,
      modules: modulesPayload,
      ctt_norms_version_id,
      max_completions,
      patient_group_id,
    } = data;

    const existingQuestionnaire = await prisma.questionnaires.findUnique({ where: { id } });

    if (!existingQuestionnaire) {
      throw new ServiceError('Questionnaire not found', 404);
    }

    if (existingQuestionnaire.status === 'completed') {
      throw new ServiceError('Questionnaire is completed and can no longer be modified', 409);
    }

    if (status !== undefined && status !== existingQuestionnaire.status) {
      if (status === 'draft' || status === 'completed') {
        throw new ServiceError(
          `Questionnaire cannot be manually set to '${status}' (automatic-only transition)`,
          400
        );
      }
      assertManualTransition('questionnaire', existingQuestionnaire.status, status);

      if (status === 'public') {
        // Manual reactivation from disabled: survey must be public, and (unless
        // anonymous_spontaneous) the questionnaire must still have assignments and
        // not have already reached max_completions.
        const link = await prisma.surveys_questionnaires.findFirst({
          where: { questionnaire_id: id },
          select: { survey: { select: { status: true, access_mode: true } } },
        });
        if (!link || link.survey.status !== 'public') {
          throw new ServiceError('Cannot reactivate: the parent survey must be public', 409);
        }
        if (link.survey.access_mode !== 'anonymous_spontaneous') {
          const activeAssignments = await prisma.survey_questionnaire_patients_assignment.count({
            where: { survey_questionnaire: { questionnaire_id: id } },
          });
          if (activeAssignments === 0) {
            throw new ServiceError('Cannot reactivate: the questionnaire has no assignments', 409);
          }
        }
        if (existingQuestionnaire.max_completions) {
          const completedCount = await prisma.survey_questionnaire_patients_assignment.count({
            where: {
              survey_questionnaire: { questionnaire_id: id },
              completion_status: 'completed',
            },
          });
          if (completedCount >= existingQuestionnaire.max_completions) {
            throw new ServiceError(
              'Cannot reactivate: max_completions has already been reached',
              409
            );
          }
        }
      }
    }

    // The questionnaire's modules are chosen for a specific patient group, so the group
    // can never be changed after creation — doing so would leave mismatched modules.
    if (
      patient_group_id !== undefined &&
      patient_group_id !== existingQuestionnaire.patient_group_id
    ) {
      throw new ServiceError(
        'Patient group cannot be changed after the questionnaire has been created',
        403
      );
    }

    if (ctt_norms_version_id !== undefined && existingQuestionnaire.status !== 'draft') {
      throw new ServiceError(
        'CTT norms version can only be changed while the questionnaire is in draft status',
        403
      );
    }

    const updateData: any = {};
    if (title !== undefined) updateData.title = title;
    if (description !== undefined) updateData.description = description;
    if (status !== undefined) {
      updateData.status = status;
      if (status !== existingQuestionnaire.status) {
        // An actual manual transition (public<->disabled) is never survey-caused —
        // but resubmitting the current status unchanged must not clear the flag.
        updateData.disabled_by_survey = false;
      }
    }
    if (max_completions !== undefined) updateData.max_completions = max_completions ?? null;
    if (patient_group_id !== undefined) updateData.patient_group_id = patient_group_id;

    let effectiveType = existingQuestionnaire.type as string;

    if (Array.isArray(modulesPayload)) {
      if (existingQuestionnaire.status !== 'draft') {
        throw new ServiceError(
          'Modules can only be changed while the questionnaire is in draft status',
          403
        );
      }

      if (modulesPayload.length === 0) {
        throw new ServiceError(
          'A questionnaire must include at least one kit module (static or dynamic)',
          400
        );
      }

      // Swapping the kit module (static <-> dynamic) changes the questionnaire type.
      const moduleIds = modulesPayload.map((m) => Number(m.moduleId));
      effectiveType = await validateKitModules(moduleIds);
      updateData.type = effectiveType;
    }

    if (Array.isArray(modulesPayload) && effectiveType === 'dynamic') {
      // CTT norms only apply to static questionnaires.
      updateData.ctt_norms_version_id = null;
    } else if (ctt_norms_version_id !== undefined) {
      updateData.ctt_norms_version_id = ctt_norms_version_id ?? null;
    } else if (effectiveType === 'static' && !existingQuestionnaire.ctt_norms_version_id) {
      throw new ServiceError('ctt_norms_version_id is required for static questionnaires', 400);
    }

    const updatedQuestionnaire = await prisma.questionnaires.update({
      where: { id },
      data: updateData,
      include: QUESTIONNAIRE_DETAIL_INCLUDE,
    });

    if (Array.isArray(modulesPayload)) {
      await prisma.questionnaires_modules.deleteMany({ where: { questionnaire_id: id } });
      await Promise.all(
        modulesPayload.map((m, index) =>
          prisma.questionnaires_modules.create({
            data: {
              questionnaire_id: id,
              module_id: Number(m.moduleId),
              position: m.position ?? index,
              is_active: true,
            },
          })
        )
      );
    }

    return attachUserRefOne(
      updatedQuestionnaire,
      (q) => q.created_by,
      'creator',
      CREATOR_FIELDS
    );
  }

  /**
   * Adds/reorders/removes modules in a questionnaire. Blocked once the questionnaire
   * has patient assignments (structure lock), or once it's no longer in draft status.
   */
  static async updateModules(
    id: number,
    modules: { moduleId: any; position?: number; is_active?: boolean }[]
  ) {
    const questionnaire = await prisma.questionnaires.findUnique({
      where: { id },
      select: { id: true, patient_group_id: true, type: true, status: true },
    });

    if (!questionnaire) {
      throw new ServiceError('Questionnaire not found', 404);
    }

    if (questionnaire.status !== 'draft') {
      throw new ServiceError(
        'Modules can only be changed while the questionnaire is in draft status',
        403
      );
    }

    const modulesAssignmentCount = await prisma.survey_questionnaire_patients_assignment.count({
      where: { survey_questionnaire: { questionnaire_id: id } },
    });
    if (modulesAssignmentCount > 0) {
      throw new ServiceError(
        'Cannot modify modules of an active questionnaire: this questionnaire already has patient assignments. Module structure is locked.',
        403
      );
    }

    const moduleIds = modules
      .map((m) => m.moduleId)
      .filter((mid) => mid)
      .map((mid) => Number(mid));

    if (moduleIds.length === 0) {
      await prisma.questionnaires_modules.deleteMany({ where: { questionnaire_id: id } });
      return { questionnaire: { id, type: questionnaire.type }, updatedCount: 0 };
    }

    const foundModules = await prisma.modules.findMany({
      where: { id: { in: moduleIds } },
      select: { id: true, patient_group_id: true, type: true, name: true },
    });

    if (foundModules.length !== moduleIds.length) {
      const missingIds = moduleIds.filter((mid) => !foundModules.find((m) => m.id === mid));
      throw new ServiceError(`Some modules not found: ${missingIds.join(', ')}`, 404);
    }

    const invalidGroupModules = foundModules.filter(
      (m) => m.patient_group_id !== questionnaire.patient_group_id
    );
    if (invalidGroupModules.length > 0) {
      throw new ServiceError(
        `All modules must belong to the same patient group as the questionnaire (id=${questionnaire.patient_group_id}): ${invalidGroupModules
          .map((m) => m.name)
          .join(', ')}`,
        400
      );
    }

    // Swapping the kit module (static <-> dynamic) changes the questionnaire type.
    const type = await validateKitModules(moduleIds);

    const result = await prisma.$transaction(async (tx) => {
      if (type !== questionnaire.type) {
        await tx.questionnaires.update({
          where: { id },
          data: { type, ...(type === 'dynamic' && { ctt_norms_version_id: null }) },
        });
      }
      await tx.questionnaires_modules.deleteMany({ where: { questionnaire_id: id } });

      return Promise.all(
        modules.map((moduleData, index) =>
          tx.questionnaires_modules.create({
            data: {
              questionnaire_id: id,
              module_id: Number(moduleData.moduleId),
              position: moduleData.position ?? index,
              is_active: moduleData.is_active ?? true,
            },
          })
        )
      );
    });

    return {
      questionnaire: { id, type },
      updatedCount: result.length,
    };
  }

  /**
   * Builds the full questionnaire preview (all static questions + translations).
   * CAT (dynamic) modules return metadata only — their questions load dynamically.
   */
  static async getPreview(id: number, languageId: number) {
    const langIds = [languageId];

    const questionnaire = await prisma.questionnaires.findUnique({
      where: { id },
      include: {
        patient_group: true,
        questionnaires_modules: {
          where: { is_active: true },
          orderBy: { position: 'asc' },
          include: {
            module: {
              include: {
                cat_setting: {
                  select: { id: true, name: true, setting_key: true, description: true },
                },
                modules_questions: {
                  where: { is_active: true },
                  orderBy: { position: 'asc' },
                  include: {
                    question: {
                      include: {
                        static_questions: { where: { language_id: { in: langIds } } },
                        cat_questions: { where: { language_id: { in: langIds } } },
                        socio_demo_questions: { where: { language_id: { in: langIds } } },
                        feedback_question_translations: { where: { language_id: { in: langIds } } },
                        feedback_answers: {
                          where: { language_id: { in: langIds } },
                          orderBy: { display_order: 'asc' },
                        },
                        socio_demo_answers: {
                          where: { language_id: { in: langIds } },
                          orderBy: { display_order: 'asc' },
                        },
                        answer_profile: {
                          include: {
                            answer_options: {
                              orderBy: { display_order: 'asc' },
                              include: {
                                answer_option_i18n: { where: { language_id: { in: langIds } } },
                              },
                            },
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    });

    if (!questionnaire) {
      throw new ServiceError('Questionnaire not found', 404);
    }

    return {
      id: questionnaire.id,
      title: questionnaire.title,
      description: questionnaire.description,
      type: questionnaire.type,
      status: questionnaire.status,
      patient_group: questionnaire.patient_group,
      language_id: languageId,
      modules: await Promise.all(
        questionnaire.questionnaires_modules.map(async (qm) => {
          const module = qm.module;

          const buildQuestionPayload = (mq: (typeof module.modules_questions)[number]) => {
            const question = mq.question;

            let questionText = 'Translation not available';
            let questionHead = '';
            let questionPramble = '';

            if (question.question_kind === 'static') {
              const t = question.static_questions[0];
              questionText = t?.question || '';
              questionHead = t?.head || '';
              questionPramble = t?.pramble || '';
            } else if (question.question_kind === 'cat') {
              // Fixed (non-adaptive) CAT question — no adaptive session/scale
              // mapping exists for it (see the fixedQuestions filter below), so
              // its preamble comes straight from its own cat_questions row,
              // exactly like a static question's static_questions.pramble —
              // NOT from cat_item_bank_scale_preambles, which is scoped to
              // scales that DO have an adaptive session.
              questionText = question.cat_questions[0]?.question || '';
              questionPramble = question.cat_questions[0]?.pramble || '';
            } else if (question.question_kind === 'socio-demo') {
              questionText = question.socio_demo_questions[0]?.question_text || '';
            } else if (question.question_kind === 'feedback') {
              questionText = question.feedback_question_translations[0]?.question_text || '';
            }

            let answerOptions: any[] = [];
            if (question.question_kind === 'socio-demo') {
              answerOptions =
                question.socio_demo_answers?.map((ans) => ({
                  id: ans.id,
                  answer_text: ans.answer_text,
                  answer_type: ans.answer_type,
                  display_order: ans.display_order,
                  min_value: ans.min_value,
                  max_value: ans.max_value,
                })) || [];
            } else if (question.question_kind === 'feedback') {
              answerOptions =
                question.feedback_answers?.map((ans) => ({
                  id: ans.id,
                  answer_text: ans.answer_text,
                  answer_type: ans.answer_type,
                  display_order: ans.display_order,
                  min_value: ans.min_value,
                  max_value: ans.max_value,
                })) || [];
            } else {
              answerOptions =
                question.answer_profile?.answer_options.map((opt) => ({
                  id: opt.id,
                  value: opt.value,
                  label: opt.answer_option_i18n[0]?.label || `Option ${opt.value}`,
                  display_order: opt.display_order,
                  // Distinguishes genuine scale positions (null) from sentinel options like
                  // NA/PNTA (non-null) — needed by slider-style question types (quality_7) to
                  // know which options define the draggable range vs. which are extra,
                  // separately-selectable choices. Mirrors answerProfileInfo.ts's own
                  // option_code === null check used server-side for scoring.
                  option_code: opt.option_code,
                })) || [];
            }

            return {
              position: mq.position,
              questionId: question.id,
              questionCode: question.question_code,
              questionKind: question.question_kind,
              questionType: question.question_type,
              questionHead,
              questionPramble,
              questionText,
              parentQid: question.parent_qid,
              operator: question.operator,
              conditionValue: question.value,
              answerProfile: question.answer_profile
                ? {
                    code: question.answer_profile.code,
                    description: question.answer_profile.description,
                  }
                : null,
              answerOptions,
            };
          };

          if (module.type === 'dynamic') {
            // A dynamic module can mix genuinely-adaptive scales (driven by the
            // next-question polling flow, handled entirely client-side/CAT-side —
            // never listed here) with FIXED ones: CTT-scored scales, and IRT-scored
            // scales with no CatSettings mapping for this module's group. Fixed
            // questions are presented to the patient exactly like a static module's.
            let fixedQuestions: ReturnType<typeof buildQuestionPayload>[] = [];
            // Entry point (scale + its first item's position) for each genuinely
            // adaptive scale this module drives — lets the frontend merge fixed
            // questions and adaptive CAT sessions into a single walk order that
            // follows the original Excel row order, instead of always deferring
            // every adaptive scale to the end of the module.
            let adaptiveScalesInfo: { scale: string; entryPosition: number; minItems: number }[] = [];
            try {
              const scales = await getScalesForModule(module.id);
              adaptiveScalesInfo = scales.map((s) => ({
                scale: s.scale,
                entryPosition: s.entryPosition,
                minItems: s.minItems,
              }));
              const adaptiveScaleSet = new Set(scales.map((s) => s.scale));
              fixedQuestions = module.modules_questions
                .filter((mq) => !mq.question.scale || !adaptiveScaleSet.has(mq.question.scale))
                .map(buildQuestionPayload);
            } catch {
              // Module has no cat_item_bank/patient_group configured — nothing fixed to show.
            }

            return {
              position: qm.position,
              module: {
                id: module.id,
                name: module.name,
                type: module.type,
                cat_setting: module.cat_setting,
              },
              questions: fixedQuestions,
              adaptiveScales: adaptiveScalesInfo,
              isDynamic: true,
            };
          }

          return {
            position: qm.position,
            module: { id: module.id, name: module.name, type: module.type },
            questions: module.modules_questions.map(buildQuestionPayload),
          };
        })
      ),
      totalModules: questionnaire.questionnaires_modules.length,
      totalQuestions: questionnaire.questionnaires_modules.reduce(
        (sum, qm) => sum + qm.module.modules_questions.length,
        0
      ),
    };
  }

  /**
   * Deletes a questionnaire, blocked if it has existing assignments or if the
   * parent survey has left draft (deleting alters the survey's composition).
   */
  static async delete(id: number) {
    const questionnaire = await prisma.questionnaires.findUnique({
      where: { id },
      select: { id: true, title: true },
    });

    if (!questionnaire) {
      throw new ServiceError('Questionnaire not found', 404);
    }

    const link = await prisma.surveys_questionnaires.findFirst({
      where: { questionnaire_id: id },
      select: { survey: { select: { status: true } } },
    });
    if (link && link.survey.status !== 'draft') {
      throw new ServiceError(
        'Cannot delete a questionnaire once the survey has left draft status',
        409
      );
    }

    const assignmentCount = await prisma.survey_questionnaire_patients_assignment.count({
      where: { survey_questionnaire: { questionnaire_id: id } },
    });

    if (assignmentCount > 0) {
      throw new ServiceError('Cannot delete questionnaire with existing assignments', 400);
    }

    try {
      await prisma.questionnaires.delete({ where: { id } });
    } catch (error: any) {
      if (error.code === 'P2003') {
        throw new ServiceError(
          'Cannot delete questionnaire: it is referenced by active surveys',
          400
        );
      }
      throw error;
    }

    return questionnaire;
  }

  /**
   * Generates a public anonymous link for a questionnaire (anonymous mode 1: single shared link).
   * Anonymous_spontaneous questionnaires have no individual assignments, so they inherit
   * the parent survey's status directly instead of the assignment-driven rule.
   */
  static async generatePublicLink(surveyId: number, questionnaireId: number) {
    const surveyQuestionnaire = await prisma.surveys_questionnaires.findFirst({
      where: { survey_id: surveyId, questionnaire_id: questionnaireId },
      include: {
        survey: { select: { id: true, name: true, status: true } },
        questionnaire: { select: { id: true, title: true } },
      },
    });

    if (!surveyQuestionnaire) {
      throw new ServiceError('Questionnaire not found in this survey', 404);
    }

    if (!['draft', 'public'].includes(surveyQuestionnaire.survey.status)) {
      throw new ServiceError(
        'Cannot generate a public link while the survey is disabled or completed',
        409
      );
    }

    if (surveyQuestionnaire.public_link) {
      throw new ServiceError(
        'Public link already exists: a public anonymous link has already been generated for this questionnaire',
        409
      );
    }

    const publicLink = crypto.randomBytes(24).toString('hex');

    const [updated] = await prisma.$transaction([
      prisma.surveys_questionnaires.update({
        where: { id: surveyQuestionnaire.id },
        data: { public_link: publicLink },
      }),
      prisma.questionnaires.update({
        where: { id: questionnaireId },
        data: { status: surveyQuestionnaire.survey.status as 'draft' | 'public' },
      }),
    ]);

    return {
      survey_questionnaire_id: updated.id,
      survey: surveyQuestionnaire.survey,
      questionnaire: surveyQuestionnaire.questionnaire,
      public_link: publicLink,
      access_mode: 'anonymous',
      created_at: updated.created_at,
    };
  }

  /**
   * Returns the public anonymous link for a questionnaire, if one exists.
   */
  static async getPublicLink(surveyId: number, questionnaireId: number) {
    const surveyQuestionnaire = await prisma.surveys_questionnaires.findFirst({
      where: { survey_id: surveyId, questionnaire_id: questionnaireId },
      include: {
        survey: { select: { id: true, name: true } },
        questionnaire: { select: { id: true, title: true } },
      },
    });

    if (!surveyQuestionnaire) {
      throw new ServiceError('Questionnaire not found in this survey', 404);
    }

    if (!surveyQuestionnaire.public_link) {
      throw new ServiceError(
        'No public link found: no public anonymous link has been generated for this questionnaire',
        404
      );
    }

    return {
      survey_questionnaire_id: surveyQuestionnaire.id,
      survey: surveyQuestionnaire.survey,
      questionnaire: surveyQuestionnaire.questionnaire,
      public_link: surveyQuestionnaire.public_link,
      access_mode: 'anonymous',
      created_at: surveyQuestionnaire.created_at,
      updated_at: surveyQuestionnaire.updated_at,
    };
  }

  /**
   * Removes the public anonymous link for a questionnaire.
   */
  static async deletePublicLink(surveyId: number, questionnaireId: number) {
    const surveyQuestionnaire = await prisma.surveys_questionnaires.findFirst({
      where: { survey_id: surveyId, questionnaire_id: questionnaireId },
      include: {
        survey: { select: { status: true } },
        questionnaire: { select: { status: true } },
      },
    });

    if (!surveyQuestionnaire) {
      throw new ServiceError('Questionnaire not found in this survey', 404);
    }

    if (surveyQuestionnaire.survey.status === 'completed') {
      throw new ServiceError('Cannot modify a completed survey', 409);
    }

    if (!surveyQuestionnaire.public_link) {
      throw new ServiceError(
        'No public link to delete: this questionnaire does not have a public anonymous link',
        404
      );
    }

    const ops: any[] = [
      prisma.surveys_questionnaires.update({
        where: { id: surveyQuestionnaire.id },
        data: { public_link: null },
      }),
    ];
    if (surveyQuestionnaire.questionnaire.status !== 'completed') {
      ops.push(
        prisma.questionnaires.update({
          where: { id: questionnaireId },
          data: { status: 'draft' },
        })
      );
    }
    await prisma.$transaction(ops);

    return {
      survey_questionnaire_id: surveyQuestionnaire.id,
      deleted_link: surveyQuestionnaire.public_link,
    };
  }

  /**
   * DRAFT -> PUBLIC when the questionnaire's survey is public and it has at least
   * one assignment. Never applies to anonymous_spontaneous (no individual assignments —
   * it inherits the survey's status directly via generatePublicLink/deletePublicLink).
   */
  static async maybeActivateQuestionnaire(tx: any, questionnaireId: number): Promise<void> {
    const q = await tx.questionnaires.findUnique({
      where: { id: questionnaireId },
      select: {
        status: true,
        surveys_questionnaires: {
          select: { survey: { select: { status: true, access_mode: true } } },
        },
      },
    });
    if (!q || q.status !== 'draft') return;
    const survey = q.surveys_questionnaires[0]?.survey;
    if (!survey || survey.status !== 'public' || survey.access_mode === 'anonymous_spontaneous')
      return;

    const count = await tx.survey_questionnaire_patients_assignment.count({
      where: { survey_questionnaire: { questionnaire_id: questionnaireId } },
    });
    if (count > 0) {
      await tx.questionnaires.update({
        where: { id: questionnaireId },
        data: { status: 'public' },
      });
    }
  }

  /**
   * PUBLIC -> DRAFT when a questionnaire loses all of its (non-anonymous_spontaneous)
   * assignments. Never applied to already-COMPLETED questionnaires.
   */
  static async maybeRevertToDraftIfNoAssignments(tx: any, questionnaireId: number): Promise<void> {
    const q = await tx.questionnaires.findUnique({
      where: { id: questionnaireId },
      select: { status: true },
    });
    if (!q || q.status !== 'public') return;

    const remaining = await tx.survey_questionnaire_patients_assignment.count({
      where: {
        survey_questionnaire: { questionnaire_id: questionnaireId },
        access_mode: { not: 'anonymous_spontaneous' },
      },
    });
    if (remaining === 0) {
      await tx.questionnaires.update({ where: { id: questionnaireId }, data: { status: 'draft' } });
    }
  }
}
