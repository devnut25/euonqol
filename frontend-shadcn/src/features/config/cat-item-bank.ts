// Sheet/column requirements for the standalone CAT Item Bank upload
// (Settings > CAT Item Bank > Upload) — distinct from the Module Library
// dynamic kit-version upload, which reuses the static "Questions" sheet shape.
// This upload only populates raw item content in a reusable bank: no
// patient-group flags, no kit_version tie-in.

export const CAT_ITEM_BANK_REQUIRED_SHEETS = ['Questions', 'Answers', 'Languages'];

export const CAT_ITEM_BANK_REQUIRED_COLUMNS: Record<string, string[]> = {
  Questions: [
    'Question_ID',
    'Language',
    'Language _ID',
    'Item',
    'Type',
    'Answer',
    'Version',
    'Scale',
  ],
  Answers: ['Answer_Profile', 'Language', 'Language_ID', '1', '2', '3', '4'],
  Languages: ['ID', 'Language', 'Original_Language', 'Alphabet'],
};
