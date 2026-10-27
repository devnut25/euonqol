import { SurveyPolicy } from '../policy/surveyPolicy.js';
import { Resource, ResourceOptions } from './baseResource.js';

/**
 * Base class for all Survey resources.
 * Centralizes policy initialization so concrete classes only implement transform().
 */
abstract class SurveyBaseResource extends Resource<any> {
  protected policy: SurveyPolicy | null = null;

  constructor(data: any, options: ResourceOptions = {}) {
    super(data, options);
    if (options.policy?.authUser) {
      this.policy = new SurveyPolicy(options.policy.authUser);
    }
  }

  protected getAuthorizations(): Record<string, boolean> | null {
    return this.policy?.getAuthorizations(this.data) ?? null;
  }
}

export class SurveyResource extends SurveyBaseResource {
  transform() {
    const s = this.data;
    return {
      id: s.id,
      name: s.name,
      starting_date: s.starting_date,
      end_date: s.end_date,
      max_completions: s.max_completions,
      reminder: s.reminder,
      frequency_tipology: s.frequency_tipology,
      frequency: s.frequency,
      reminder_max_count: s.reminder_max_count,
      send_mode: s.send_mode,
      send_delay_hours: s.send_delay_hours,
      send_scheduled_at: s.send_scheduled_at,
      status: s.status,
      access_mode: s.access_mode,
      questionnaireCount: s._count?.surveys_questionnaires ?? s.questionnaireCount,
      privacy_policy_count: s._count?.survey_privacy_policies ?? s.privacy_policy_count,
      assignmentStats: s.assignmentStats,
      creator: s.creator,
      isOwner: s.isOwner,
      accessType: s.accessType,
      created_at: s.created_at,
      updated_at: s.updated_at,
    };
  }
}

/**
 * Minimal representation for GET /surveys/all (selects and table filters).
 */
export class SurveyResourceAll extends Resource<any> {
  transform() {
    const { id, name, status } = this.data;
    return { id, name, status };
  }
}

export class SurveyDetailResource extends SurveyBaseResource {
  protected getFullName(last?: string | null, first?: string | null): string {
    return `${last ?? ''} ${first ?? ''}`.trim() || 'N/A';
  }

  transform() {
    const s = this.data;
    return {
      id: s.id,
      name: s.name,
      starting_date: s.starting_date,
      end_date: s.end_date,
      max_completions: s.max_completions,
      reminder: s.reminder,
      frequency_tipology: s.frequency_tipology,
      frequency: s.frequency,
      reminder_max_count: s.reminder_max_count,
      send_mode: s.send_mode,
      send_delay_hours: s.send_delay_hours,
      send_scheduled_at: s.send_scheduled_at,
      status: s.status,
      access_mode: s.access_mode,
      ctt_norms_version_id: s.ctt_norms_version_id,
      creator: s.creator,
      // `creator` e' nullo quando l'utente Keycloak che ha creato la survey non
      // esiste piu': l'id resta sulla riga ma non si risolve piu' a nessuno.
      full_name: this.getFullName(s.creator?.last_name, s.creator?.first_name),
      questionnaires: s.questionnairesWithStats,
      overallStats: s.overallStats,
      created_at: s.created_at,
      updated_at: s.updated_at,
    };
  }
}

export class SurveyWriteResource extends SurveyBaseResource {
  transform() {
    const s = this.data;
    return {
      id: s.id,
      name: s.name,
      starting_date: s.starting_date,
      end_date: s.end_date,
      max_completions: s.max_completions,
      reminder: s.reminder,
      frequency_tipology: s.frequency_tipology,
      frequency: s.frequency,
      reminder_max_count: s.reminder_max_count,
      send_mode: s.send_mode,
      send_delay_hours: s.send_delay_hours,
      send_scheduled_at: s.send_scheduled_at,
      status: s.status,
      access_mode: s.access_mode,
      ctt_norms_version_id: s.ctt_norms_version_id,
      creator: s.creator,
      created_at: s.created_at,
      updated_at: s.updated_at,
    };
  }
}
