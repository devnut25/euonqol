import { AssignmentPolicy } from '../policy/assignmentPolicy.js';
import { Resource, ResourceOptions } from './baseResource.js';

/**
 * Base class for all Assignment resources.
 * Centralizes policy initialization so concrete classes only implement transform().
 */
abstract class AssignmentBaseResource extends Resource<any> {
  protected policy: AssignmentPolicy | null = null;

  constructor(data: any, options: ResourceOptions = {}) {
    super(data, options);
    if (options.policy?.authUser) {
      this.policy = new AssignmentPolicy(options.policy.authUser);
    }
  }

  protected getAuthorizations(): Record<string, boolean> | null {
    return this.policy?.getAuthorizations(this.data) ?? null;
  }
}

/**
 * List representation — used in paginated survey-assignments responses.
 */
export class AssignmentResource extends AssignmentBaseResource {
  transform() {
    const {
      id,
      survey_questionnaire,
      patient,
      link,
      access_mode,
      send_status,
      completion_status,
      sent_at,
      sender,
      completed_at,
      scheduled_send_at,
      reminder_count,
      next_reminder_at,
      created_at,
      email_logs,
    } = this.data;

    const lastEmailLog = email_logs?.[0] ?? null;

    return {
      id,
      questionnaire: survey_questionnaire?.questionnaire ?? null,
      patient,
      link,
      access_mode,
      send_status,
      completion_status,
      sent_at,
      sent_by: sender ?? null,
      completed_at,
      scheduled_send_at: scheduled_send_at ?? null,
      reminder_count: reminder_count ?? null,
      next_reminder_at: next_reminder_at ?? null,
      created_at,
      last_email_error: lastEmailLog?.status === 'failed' ? lastEmailLog.error_message : null,
    };
  }

  static resolveCollection(items: any[], options: ResourceOptions = {}): any[] {
    return AssignmentResource.collection(items, options);
  }
}

/**
 * Detailed representation — used in single-assignment (get-by-id) responses.
 */
export class AssignmentDetailResource extends AssignmentBaseResource {
  transform() {
    const {
      id,
      survey_questionnaire,
      patient,
      link,
      access_mode,
      send_status,
      completion_status,
      sent_at,
      sender,
      completed_at,
      responses,
      created_at,
      updated_at,
    } = this.data;

    return {
      id,
      survey: survey_questionnaire?.survey ?? null,
      questionnaire: survey_questionnaire?.questionnaire ?? null,
      patient,
      link,
      access_mode,
      send_status,
      completion_status,
      sent_at,
      sent_by: sender ?? null,
      completed_at,
      responseCount: responses?.length ?? 0,
      created_at,
      updated_at,
    };
  }
}
