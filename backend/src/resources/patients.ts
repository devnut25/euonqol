import { Resource } from './baseResource.js';

/**
 * List representation — used for GET /patients (paginated).
 */
export class PatientResource extends Resource<any> {
  transform() {
    const p = this.data;
    return {
      id: p.id,
      patientId: p.patient_id,
      surveyQuestionnaireId: p.survey_questionnaire_id,
      survey: p.survey_questionnaire?.survey
        ? { id: p.survey_questionnaire.survey.id, name: p.survey_questionnaire.survey.name }
        : null,
      questionnaire: p.survey_questionnaire?.questionnaire
        ? {
            id: p.survey_questionnaire.questionnaire.id,
            title: p.survey_questionnaire.questionnaire.title,
            patientGroup: p.survey_questionnaire.questionnaire.patient_group ?? null,
          }
        : null,
      mail: p.mail,
      phone_prefix: p.phone_prefix,
      phone: p.phone,
      createdBy: p.created_by,
      creator: p.creator ? { id: p.creator.id, username: p.creator.username } : null,
      isActive: p.is_active,
      isAnonymous: p.is_anonymous,
      assignmentCount: p._count.survey_assignments,
      completedAt: p.survey_assignments[0]?.completed_at ?? null,
      completionStatus: p.survey_assignments[0]?.completion_status ?? null,
      privacyAccepted: (p.survey_assignments[0]?.privacy_policy_acceptances?.length ?? 0) > 0,
      createdAt: p.created_at,
      updatedAt: p.updated_at,
    };
  }
}

/**
 * Full single-patient representation — used for getById/update responses.
 */
export class PatientDetailResource extends Resource<any> {
  transform() {
    const p = this.data;
    return {
      id: p.id,
      patientId: p.patient_id,
      mail: p.mail,
      phone_prefix: p.phone_prefix,
      phone: p.phone,
      createdBy: p.created_by,
      creator: p.creator
        ? { id: p.creator.id, username: p.creator.username, email: p.creator.email }
        : null,
      isActive: p.is_active,
      isAnonymous: p.is_anonymous,
      assignmentCount: p._count.survey_assignments,
      sessionCount: p._count.patient_sessions,
      createdAt: p.created_at,
      updatedAt: p.updated_at,
    };
  }
}
