import { ModelConfig } from '../helpers/QueryBuilder.js';

export const PrivacyPolicyModelConfig: ModelConfig = {
  searchable: ['title'],
  attributeFields: [],
  sortable: ['id', 'title', 'patient_type', 'language_id', 'is_active', 'created_at', 'updated_at'],
  sortableAttributes: [],
  includable: ['language'],
  fieldMap: {
    patientType: 'patient_type',
    languageId: 'language_id',
    isActive: 'is_active',
    createdAt: 'created_at',
    updatedAt: 'updated_at',
  },
  attributeMap: {},
  defaultOrder: [{ created_at: 'desc' }],
};
