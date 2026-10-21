import { ModelConfig } from '../helpers/QueryBuilder.js';

export const EmailTemplateModelConfig: ModelConfig = {
  searchable: ['subject', 'body'],
  attributeFields: [],
  sortable: ['language_id', 'subject', 'created_at', 'updated_at'],
  sortableAttributes: [],
  includable: [],
  fieldMap: {},
  customSorts: {},
  attributeMap: {},
  defaultOrder: [{ language_id: 'asc' }],
};
