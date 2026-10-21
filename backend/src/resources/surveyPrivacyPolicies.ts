import { SurveyPrivacyPolicyPolicy } from '../policy/surveyPrivacyPolicyPolicy.js';
import { Resource, ResourceOptions } from './baseResource.js';

/**
 * Base class for all SurveyPrivacyPolicy (survey-scoped link) resources.
 * Centralizes policy initialization so concrete classes only implement transform().
 */
abstract class SurveyPrivacyPolicyBaseResource extends Resource<any> {
  protected policy: SurveyPrivacyPolicyPolicy | null = null;

  constructor(data: any, options: ResourceOptions = {}) {
    super(data, options);
    if (options.policy?.authUser) {
      this.policy = new SurveyPrivacyPolicyPolicy(options.policy.authUser);
    }
  }

  protected getAuthorizations(): Record<string, boolean> | null {
    return this.policy?.getAuthorizations(this.data) ?? null;
  }
}

export class SurveyPrivacyPolicyResource extends SurveyPrivacyPolicyBaseResource {
  transform() {
    const {
      id,
      title,
      content,
      patient_type,
      language_id,
      language,
      is_active,
      created_by,
      is_fallback,
      pdf_url,
      pdf_filename,
    } = this.data;

    return {
      id,
      title,
      content,
      patient_type,
      language_id,
      language,
      is_active,
      created_by,
      is_fallback,
      pdf_url: pdf_url ?? null,
      pdf_filename: pdf_filename ?? null,
    };
  }
}
