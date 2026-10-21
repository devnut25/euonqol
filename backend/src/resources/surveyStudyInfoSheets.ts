import { SurveyStudyInfoSheetPolicy } from '../policy/surveyStudyInfoSheetPolicy.js';
import { Resource, ResourceOptions } from './baseResource.js';

/**
 * Base class for all SurveyStudyInfoSheet resources.
 * Centralizes policy initialization so concrete classes only implement transform().
 */
abstract class SurveyStudyInfoSheetBaseResource extends Resource<any> {
  protected policy: SurveyStudyInfoSheetPolicy | null = null;

  constructor(data: any, options: ResourceOptions = {}) {
    super(data, options);
    if (options.policy?.authUser) {
      this.policy = new SurveyStudyInfoSheetPolicy(options.policy.authUser);
    }
  }

  protected getAuthorizations(): Record<string, boolean> | null {
    return this.policy?.getAuthorizations(this.data) ?? null;
  }
}

export class SurveyStudyInfoSheetResource extends SurveyStudyInfoSheetBaseResource {
  transform() {
    const s = this.data;
    return {
      id: s.id,
      survey_id: s.survey_id,
      language_id: s.language_id,
      language: s.language?.language ?? null,
      original_lang: s.language?.original_lang ?? null,
      title: s.title,
      content: s.content,
      rejection_message: s.rejection_message,
      consent_questions: (s.consent_questions ?? []).map((q: any) => ({
        id: q.id,
        question_text: q.question_text,
        order_position: q.order_position,
      })),
      pdf_url: s.pdf_url ?? null,
      pdf_filename: s.pdf_filename ?? null,
      version: s.version,
      is_current: s.is_current,
      is_fallback: s.is_fallback,
      created_at: s.created_at,
    };
  }
}
