import { ModelConfig } from '@/helpers/QueryBuilder';

export const SurveyModelConfig: ModelConfig = {
  searchable: ['name'],
  attributeFields: [],
  sortable: ['name', 'status', 'created_at', 'starting_date', 'end_date'],
  sortableAttributes: [],
  includable: [],
  fieldMap: {
    createdAt: 'created_at',
    startingDate: 'starting_date',
    endDate: 'end_date',
  },
  customSorts: {
    questionnaireCount: (dir) =>
      [{ surveys_questionnaires: { _count: dir } }] as Record<string, any>[],
  },
  attributeMap: {},
  defaultOrder: [{ status: 'asc' }, { created_at: 'desc' }],
};
