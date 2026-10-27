import { Resource } from './baseResource.js';

export class UiTranslationResource extends Resource<any> {
  transform() {
    const t = this.data;
    return {
      // Row id for the admin table (keyField): the key is unique within a language
      id: t.key,
      key: t.key,
      section: t.section,
      hidden_text: !!t.hidden_text,
      language_id: t.language_id,
      reference: t.reference ?? null,
      value: t.value ?? null,
    };
  }
}
