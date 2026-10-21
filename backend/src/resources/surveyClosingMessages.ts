import { SurveyClosingMessagePolicy } from '../policy/surveyClosingMessagePolicy.js';
import { Resource, ResourceOptions } from './baseResource.js';

/**
 * Base class for all SurveyClosingMessage resources.
 * Centralizes policy initialization so concrete classes only implement transform().
 */
abstract class SurveyClosingMessageBaseResource extends Resource<any> {
  protected policy: SurveyClosingMessagePolicy | null = null;

  constructor(data: any, options: ResourceOptions = {}) {
    super(data, options);
    if (options.policy?.authUser) {
      this.policy = new SurveyClosingMessagePolicy(options.policy.authUser);
    }
  }

  protected getAuthorizations(): Record<string, boolean> | null {
    return this.policy?.getAuthorizations(this.data) ?? null;
  }
}

export class SurveyClosingMessageResource extends SurveyClosingMessageBaseResource {
  transform() {
    const m = this.data;
    return {
      id: m.id,
      survey_id: m.survey_id,
      language_id: m.language_id,
      language: m.language?.language ?? null,
      original_lang: m.language?.original_lang ?? null,
      content: m.content,
      link_used_message: m.link_used_message ?? null,
      survey_closed_message: m.survey_closed_message ?? null,
      resume_message: m.resume_message ?? null,
      version: m.version,
      is_current: m.is_current,
      is_fallback: m.is_fallback,
      created_at: m.created_at,
      updated_at: m.updated_at,
    };
  }
}

/** Public (no-auth) closing messages for a link: already merged per field with the fallback language. */
export class PublicSurveyClosingMessageResource extends Resource<any> {
  transform() {
    const m = this.data;
    return {
      id: m.id,
      language_id: m.language_id,
      version: m.version,
      is_fallback: m.is_fallback,
      content: m.content,
      link_used_message: m.link_used_message ?? null,
      survey_closed_message: m.survey_closed_message ?? null,
      resume_message: m.resume_message ?? null,
    };
  }
}
