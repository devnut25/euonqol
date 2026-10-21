import { ModelConfig } from '../helpers/QueryBuilder.js';

export const CttNormModelConfig: ModelConfig = {
  searchable: ['name', 'description'],
  attributeFields: [],
  sortable: ['id', 'name', 'is_active', 'created_at', 'updated_at'],
  sortableAttributes: [],
  includable: [],
  fieldMap: {},
  customSorts: {},
  attributeMap: {},
  defaultOrder: [{ created_at: 'desc' }],
};
