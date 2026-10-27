import { Resource } from './baseResource.js';

/** A manager invitation on a survey (`users_surveys` row with its Keycloak user and survey). */
export class SurveyManagerInvitationResource extends Resource<any> {
  transform() {
    const i = this.data;
    return {
      id: i.id,
      surveyId: i.survey_id,
      surveyName: i.survey?.name ?? null,
      manager: i.user ?? null,
      accessType: i.access_type,
      createdAt: i.created_at,
    };
  }
}
