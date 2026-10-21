import { SurveyEligibilityQuestionPolicy } from '../policy/surveyEligibilityQuestionPolicy.js';
import { Resource, ResourceOptions } from './baseResource.js';

/**
 * Base class for all SurveyEligibilityQuestion resources.
 * Centralizes policy initialization so concrete classes only implement transform().
 */
abstract class SurveyEligibilityQuestionBaseResource extends Resource<any> {
  protected policy: SurveyEligibilityQuestionPolicy | null = null;

  constructor(data: any, options: ResourceOptions = {}) {
    super(data, options);
    if (options.policy?.authUser) {
      this.policy = new SurveyEligibilityQuestionPolicy(options.policy.authUser);
    }
  }

  protected getAuthorizations(): Record<string, boolean> | null {
    return this.policy?.getAuthorizations(this.data) ?? null;
  }
}

export class SurveyEligibilityQuestionResource extends SurveyEligibilityQuestionBaseResource {
  transform() {
    const q = this.data;
    return {
      id: q.id,
      survey_id: q.survey_id,
      expected_answer: q.expected_answer,
      order_position: q.order_position,
      version: q.version,
      is_active: q.is_active,
      is_current: q.is_current,
      created_at: q.created_at,
      translations: (q.translations ?? []).map((t: any) => ({
        id: t.id,
        language_id: t.language_id,
        language: t.language?.language ?? null,
        original_lang: t.language?.original_lang ?? null,
        question_text: t.question_text,
        disqualification_message: t.disqualification_message,
        is_fallback: t.is_fallback,
      })),
    };
  }
}
