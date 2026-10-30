/**
 * Row of the "Languages" sheet of the module workbooks. The sheet is only used to check the
 * file against eu_countries (LanguageService.assertWorkbookLanguages): uploads never write
 * languages, they are added from Settings > Languages.
 */
export interface LanguageRow {
  ID: number;
  Language: string;
  Original_Language: string;
  Alphabet: string;
}
