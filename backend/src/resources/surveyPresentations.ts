import { SurveyPresentationPolicy } from '../policy/surveyPresentationPolicy.js';
import { Resource, ResourceOptions } from './baseResource.js';

/**
 * Base class for all SurveyPresentation resources.
 * Centralizes policy initialization so concrete classes only implement transform().
 */
abstract class SurveyPresentationBaseResource extends Resource<any> {
  protected policy: SurveyPresentationPolicy | null = null;

  constructor(data: any, options: ResourceOptions = {}) {
    super(data, options);
    if (options.policy?.authUser) {
      this.policy = new SurveyPresentationPolicy(options.policy.authUser);
    }
  }

  protected getAuthorizations(): Record<string, boolean> | null {
    return this.policy?.getAuthorizations(this.data) ?? null;
  }
}

export class SurveyPresentationResource extends SurveyPresentationBaseResource {
  transform() {
    const p = this.data;
    return {
      id: p.id,
      survey_id: p.survey_id,
      language_id: p.language_id,
      language: p.language?.language ?? null,
      original_lang: p.language?.original_lang ?? null,
      title: p.title,
      content: p.content,
      pdf_url: p.pdf_url ?? null,
      pdf_filename: p.pdf_filename ?? null,
      version: p.version,
      is_current: p.is_current,
      is_fallback: p.is_fallback,
      created_at: p.created_at,
      updated_at: p.updated_at,
    };
  }
}
