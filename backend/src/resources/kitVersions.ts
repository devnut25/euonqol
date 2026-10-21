import { KitVersionPolicy } from '@/policy/kitVersionPolicy.js';
import { Resource, ResourceOptions } from './baseResource.js';

/**
 * Base class for KitVersion resources.
 * Centralizes date formatting shared by all kit version representations.
 */
abstract class KitVersionBaseResource extends Resource<any> {
  protected policy: KitVersionPolicy | null = null;

  constructor(data: any, options: ResourceOptions = {}) {
    super(data, options);
    this.policy = new KitVersionPolicy(options.policy?.authUser ?? null);
  }

  protected getAuthorizations(): Record<string, boolean> {
    return this.policy!.getAuthorizations(this.data);
  }

  protected formatDate(date: Date | null | undefined): string | null {
    if (!date) return null;
    return date instanceof Date ? date.toISOString() : new Date(date).toISOString();
  }
}

/**
 * Minimal list representation — used in collection responses.
 * Includes question count from _count relation.
 */
export class KitVersionResource extends KitVersionBaseResource {
  transform() {
    const { id, name, is_active, created_at, updated_at, _count, language_count } = this.data;
    return {
      id,
      name,
      is_active,
      question_count: _count?.questions ?? 0,
      active_module_count: _count?.modules ?? 0,
      language_count: language_count ?? 0,
      created_at: this.formatDate(created_at),
      updated_at: this.formatDate(updated_at),
    };
  }
}

/**
 * Detailed representation — used in single item responses.
 * Includes question count broken down by kind (total / static / cat).
 */
export class KitVersionDetailResource extends KitVersionBaseResource {
  transform() {
    const { id, name, is_active, created_at, updated_at, question_counts } = this.data;
    return {
      id,
      name,
      is_active,
      question_count: question_counts,
      created_at: this.formatDate(created_at),
      updated_at: this.formatDate(updated_at),
    };
  }
}

/**
 * Write (create/update) response representation.
 * Includes creator and counts returned by Prisma after mutation.
 */
export class KitVersionWriteResource extends KitVersionBaseResource {
  transform() {
    const { id, name, is_active, creator, _count, created_at, updated_at } = this.data;
    return {
      id,
      name,
      is_active,
      created_by: creator ?? null,
      question_count: _count?.questions ?? 0,
      module_count: _count?.modules ?? 0,
      created_at: this.formatDate(created_at),
      updated_at: this.formatDate(updated_at),
    };
  }
}

/**
 * Delete response representation — minimal confirmation payload.
 */
export class KitVersionDeleteResource extends KitVersionBaseResource {
  transform() {
    const { id, name, is_active, hadQuestions, hadModules } = this.data;
    return { id, name, is_active, had_questions: hadQuestions, had_modules: hadModules };
  }
}

/**
 * Question representation within a kit version.
 * Handles translation resolution with fallback message when no translation is found.
 * Expects _lang_id to be tagged on each question by the service.
 */
export class KitQuestionResource extends Resource<any> {
  transform() {
    const q = this.data;

    let question_text = '';
    let question_head = '';
    let is_fallback = false;

    if (q.question_kind === 'static' && q.static_questions?.length > 0) {
      const translation = q.static_questions[0];
      question_text = translation.question || '';
      question_head = translation.head || '';
    } else if (q.question_kind === 'cat' && q.cat_questions?.length > 0) {
      question_text = q.cat_questions[0].question || '';
    } else if (q.question_kind === 'socio-demo' && q.socio_demo_questions.length > 0) {
      const translation = q.socio_demo_questions[0];
      question_text = translation.question_text || '';
    } else if (q.question_kind === 'feedback' && q.feedback_question_translations?.length > 0) {
      question_text = q.feedback_question_translations[0].question_text || '';
    } else {
      is_fallback = true;
      question_text = `[Translation missing for language ${q._lang_id}]`;
    }

    return {
      id: q.id,
      question_code: q.question_code,
      question_kind: q.question_kind,
      question_type: q.question_type,
      question_head,
      question_text,
      is_fallback,
      order_position: q.order_position,
      answer_profile: q.answer_profile
        ? { code: q.answer_profile.code, description: q.answer_profile.description }
        : null,
      patient_groups:
        q.patient_group_questions?.map((pg: any) => ({
          group_id: pg.patient_group_id,
          group_name: pg.patient_group.name,
          group_description: pg.patient_group.description,
        })) ?? [],
      created_at: q.created_at instanceof Date ? q.created_at.toISOString() : null,
    };
  }
}
