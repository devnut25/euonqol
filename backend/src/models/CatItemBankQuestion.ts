import { ModelConfig } from '../helpers/QueryBuilder.js';

/**
 * QueryBuilder configuration for the questions of a CAT item bank
 * (GET /cat-item-banks/:id/questions).
 */
export const CatItemBankQuestionModelConfig: ModelConfig = {
  // Search spans the translated text (relation), built by the service as a base filter
  searchable: [],
  attributeFields: [],
  sortable: ['question_code', 'scale', 'order_position'],
  sortableAttributes: [],
  includable: [],
  fieldMap: { questionCode: 'question_code' },
  customSorts: {},
  attributeMap: {},
  defaultOrder: [{ order_position: 'asc' }],
};
