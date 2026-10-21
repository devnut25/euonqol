import { Resource } from './baseResource.js';

export class LanguageResource extends Resource<any> {
  transform() {
    const l = this.data;
    return {
      id: l.id,
      language: l.language,
      original_lang: l.original_lang,
      alphabet: l.alphabet,
    };
  }
}
