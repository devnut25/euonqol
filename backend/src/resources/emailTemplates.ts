import { EmailTemplatePolicy } from '../policy/emailTemplatePolicy.js';
import { Resource, ResourceOptions } from './baseResource.js';

/**
 * Base class for all EmailTemplate resources.
 * Centralizes policy initialization so concrete classes only implement transform().
 */
abstract class EmailTemplateBaseResource extends Resource<any> {
  protected policy: EmailTemplatePolicy | null = null;

  constructor(data: any, options: ResourceOptions = {}) {
    super(data, options);
    if (options.policy?.authUser) {
      this.policy = new EmailTemplatePolicy(options.policy.authUser);
    }
  }

  protected getAuthorizations(): Record<string, boolean> | null {
    return this.policy?.getAuthorizations(this.data) ?? null;
  }
}

export class EmailTemplateResource extends EmailTemplateBaseResource {
  transform() {
    const {
      id,
      survey_questionnaire_id,
      language_id,
      subject,
      body,
      is_fallback,
      language,
      created_at,
      updated_at,
    } = this.data;

    return {
      id,
      survey_questionnaire_id,
      language_id,
      subject,
      body,
      is_fallback,
      language: language ?? null,
      created_at: created_at?.toISOString?.() ?? created_at ?? null,
      updated_at: updated_at?.toISOString?.() ?? updated_at ?? null,
    };
  }
}
