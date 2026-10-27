import { ModelConfig } from '../helpers/QueryBuilder.js';

export const SurveyPresentationModelConfig: ModelConfig = {
  searchable: ['title'],
  attributeFields: [],
  sortable: ['language_id', 'title', 'version', 'created_at'],
  sortableAttributes: [],
  includable: [],
  fieldMap: {},
  customSorts: {},
  attributeMap: {},
  defaultOrder: [{ language_id: 'asc' }],
};
