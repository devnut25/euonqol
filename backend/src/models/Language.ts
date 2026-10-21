import { ModelConfig } from '../helpers/QueryBuilder.js';

export const LanguageModelConfig: ModelConfig = {
  searchable: ['language', 'original_lang', 'alphabet'],
  attributeFields: [],
  sortable: ['id', 'language', 'original_lang', 'alphabet'],
  sortableAttributes: [],
  includable: [],
  fieldMap: {
    originalLang: 'original_lang',
  },
  customSorts: {},
  attributeMap: {},
  defaultOrder: [{ language: 'asc' }],
};
