import { ModelConfig } from '../helpers/QueryBuilder.js';

/**
 * QueryBuilder configuration for the survey_questionnaire_patients_assignment entity.
 */
export const AssignmentModelConfig: ModelConfig = {
  // No flat searchable columns — patient search (mail/patient_id) is relation-based
  // and handled manually in AssignmentService (see buildPatientSearchFilter).
  searchable: [],

  attributeFields: [],

  sortable: [
    'created_at',
    'sent_at',
    'completed_at',
    'send_status',
    'completion_status',
    'scheduled_send_at',
  ],

  sortableAttributes: [],

  // Includes are fixed in the service, not client-driven
  includable: [],

  fieldMap: {
    sendStatus: 'send_status',
    completionStatus: 'completion_status',
    createdAt: 'created_at',
    sentAt: 'sent_at',
    completedAt: 'completed_at',
    scheduledSendAt: 'scheduled_send_at',
  },

  customSorts: {},

  attributeMap: {},

  defaultOrder: [{ created_at: 'desc' }],
};

/**
 * Computes the scheduled_send_at date based on the survey's send_mode.
 */
export function computeScheduledSendAt(survey: {
  send_mode: string;
  send_delay_hours: number | null;
  send_scheduled_at: Date | null;
}): Date | null {
  switch (survey.send_mode) {
    case 'immediate':
      return new Date();
    case 'after_delay':
      if (survey.send_delay_hours && survey.send_delay_hours > 0) {
        return new Date(Date.now() + survey.send_delay_hours * 3600 * 1000);
      }
      return null;
    case 'scheduled':
      return survey.send_scheduled_at ?? null;
    case 'manual':
    default:
      return null;
  }
}
