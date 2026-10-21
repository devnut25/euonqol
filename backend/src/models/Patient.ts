import { ModelConfig } from '../helpers/QueryBuilder.js';

/** Managers see only patients belonging to surveys they created or are assigned to. */
export function getPatientBaseFilters(user?: {
  user_type?: string;
  id?: string;
}): Record<string, any> {
  if (user?.user_type === 'manager' && user.id) {
    return {
      survey_questionnaire: {
        survey: {
          OR: [{ created_by: user.id }, { users_surveys: { some: { user_id: user.id } } }],
        },
      },
    };
  }
  return {};
}

export const PatientModelConfig: ModelConfig = {
  searchable: ['patient_id', 'mail'],
  attributeFields: [],
  sortable: ['created_at', 'patient_id', 'mail', 'is_active', 'is_anonymous'],
  sortableAttributes: [],
  includable: [],
  fieldMap: {
    patientId: 'patient_id',
    createdAt: 'created_at',
    isActive: 'is_active',
    isAnonymous: 'is_anonymous',
    surveyQuestionnaireId: 'survey_questionnaire_id',
  },
  attributeMap: {},
  customSorts: {
    assignmentCount: (direction) => [{ survey_assignments: { _count: direction } } as any],
  },
  defaultOrder: [{ created_at: 'desc' }],
};
