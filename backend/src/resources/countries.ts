import { Resource } from './baseResource.js';

export class CountryResource extends Resource<any> {
  transform() {
    const { id, language, original_lang, alphabet } = this.data;
    return { id, language, original_lang, alphabet };
  }
}
