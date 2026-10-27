import { QuestionnairePolicy } from '../policy/questionnairePolicy.js';
import { Resource, ResourceOptions } from './baseResource.js';
import { toPickerModuleType } from './modules.js';

/**
 * Base class for all Questionnaire resources.
 * Centralizes policy initialization so concrete classes only implement transform().
 */
abstract class QuestionnaireBaseResource extends Resource<any> {
  protected policy: QuestionnairePolicy | null = null;

  constructor(data: any, options: ResourceOptions = {}) {
    super(data, options);
    if (options.policy?.authUser) {
      this.policy = new QuestionnairePolicy(options.policy.authUser);
    }
  }

  protected getAuthorizations(): Record<string, boolean> | null {
    return this.policy?.getAuthorizations(this.data) ?? null;
  }
}

/**
 * List representation — used in the paginated survey-questionnaires list response.
 */
export class QuestionnaireResource extends QuestionnaireBaseResource {
  transform() {
    const {
      id,
      title,
      description,
      type,
      status,
      patient_group,
      moduleCount,
      assignmentCount,
      inProgressCount,
      max_completions,
      survey,
      surveyQuestionnaireId,
      surveyQuestionnaireIsActive,
      created_at,
      updated_at,
    } = this.data;

    return {
      id,
      title,
      description,
      type,
      status,
      patient_group: patient_group ?? null,
      survey: survey ? { id: survey.id, name: survey.name, status: survey.status } : null,
      moduleCount: moduleCount ?? 0,
      assignmentCount: assignmentCount ?? 0,
      inProgressCount: inProgressCount ?? 0,
      max_completions: max_completions ?? null,
      surveyQuestionnaireId,
      surveyQuestionnaireIsActive,
      created_at: created_at?.toISOString?.() ?? created_at ?? null,
      updated_at: updated_at?.toISOString?.() ?? updated_at ?? null,
    };
  }

  /**
   * Resolves the correct Resource class for a collection based on the requested type.
   */
  static resolveCollection(type: string, items: any[], options: ResourceOptions = {}): any[] {
    switch (type) {
      case 'detail':
        return QuestionnaireDetailResource.collection(items, options);
      default:
        return QuestionnaireResource.collection(items, options);
    }
  }

  /**
   * Resolves the correct Resource class for a single item based on the requested type.
   */
  static resolveItem(type: string, item: any, options: ResourceOptions = {}): any {
    switch (type) {
      default:
        return QuestionnaireDetailResource.make(item, options);
    }
  }
}

/**
 * Detailed representation — used in create/update/detail responses.
 */
export class QuestionnaireDetailResource extends QuestionnaireBaseResource {
  transform() {
    const {
      id,
      title,
      description,
      type,
      status,
      ctt_norms_version_id,
      ctt_norms_version,
      max_completions,
      patient_group,
      creator,
      survey,
      modules,
      totalQuestions,
      totalAssignments,
      created_at,
      updated_at,
    } = this.data;

    return {
      id,
      title,
      description,
      type,
      status,
      ctt_norms_version_id: ctt_norms_version_id ?? null,
      ctt_norms_version: ctt_norms_version ?? null,
      max_completions: max_completions ?? null,
      patient_group: patient_group ?? null,
      creator: creator ?? null,
      survey: survey ?? null,
      modules: modules?.map((m: any) => ({
        ...m,
        module: m.module ? { ...m.module, type: toPickerModuleType(m.module.type) } : m.module,
      })),
      totalQuestions: totalQuestions ?? undefined,
      totalAssignments: totalAssignments ?? undefined,
      created_at: created_at?.toISOString?.() ?? created_at ?? null,
      updated_at: updated_at?.toISOString?.() ?? updated_at ?? null,
    };
  }
}
