import { KitVersionTypeEnum } from '@/utils/enum';

interface CountryItem {
  id: number;
  language: string;
  original_lang: string;
  alphabet: string;
}

interface FileLanguageItem {
  id: number;
  language: string;
  original_lang: string;
  alphabet: string;
}

export const REQUIRED_SHEETS: Record<KitVersionTypeEnum, string[]> = {
  [KitVersionTypeEnum.Static]: ['Questions', 'Answers', 'Languages'],
  // Dynamic (CAT) uploads are structured EXACTLY like static ones — same "Questions"
  // sheet (incl. the 4 patient-group columns) — plus one extra "CatSettings" sheet
  // mapping ScaleCode -> the external CAT engine's setting_key.
  [KitVersionTypeEnum.Cat]: ['Questions', 'Answers', 'Languages', 'CatSettings'],
  [KitVersionTypeEnum.SocioDemo]: ['Questions', 'Answers', 'Languages'],
  [KitVersionTypeEnum.Feedback]: ['Questions', 'Answers', 'Languages'],
};

// Shared by Static and Cat (dynamic) — both upload the exact same "Questions" sheet shape.
const STATIC_QUESTIONS_REQUIRED_COLUMNS = [
  'QuestionID',
  'Question_Order',
  'Language',
  'Language_ID',
  'Items',
  'Type',
  'ACTIVE (Group A)',
  'SURVIVORS (Group B)',
  'PALLIATIVE (Group C)',
  'POPULATION-INDEPENDENT (Group D)',
];
const STATIC_ANSWERS_REQUIRED_COLUMNS = [
  'Answer_Profile',
  'Language',
  'Language_ID',
  '-2',
  '-1',
  '1',
  '2',
  '3',
  '4',
];
const STATIC_LANGUAGES_REQUIRED_COLUMNS = ['ID', 'Language', 'Original_Language', 'Alphabet'];

export const REQUIRED_COLUMNS: Record<KitVersionTypeEnum, Record<string, string[]>> = {
  [KitVersionTypeEnum.Static]: {
    Questions: STATIC_QUESTIONS_REQUIRED_COLUMNS,
    Answers: STATIC_ANSWERS_REQUIRED_COLUMNS,
    Languages: STATIC_LANGUAGES_REQUIRED_COLUMNS,
  },
  [KitVersionTypeEnum.Cat]: {
    Questions: STATIC_QUESTIONS_REQUIRED_COLUMNS,
    Answers: STATIC_ANSWERS_REQUIRED_COLUMNS,
    Languages: STATIC_LANGUAGES_REQUIRED_COLUMNS,
    // One setting_key column per patient group — the same scale can be driven by a
    // different external CAT engine setting depending on the group.
    CatSettings: ['ScaleCode', 'Group A', 'Group B', 'Group C', 'Group D'],
  },
  [KitVersionTypeEnum.SocioDemo]: {
    Questions: [
      'Question_ID',
      'Language',
      'Language_ID',
      'Type',
      'Question_Order',
      'IsMandatory',
      'Parent',
      'Operator',
      'Value',
      'Question_Text',
    ],
    Answers: ['ID', 'Question_ID', 'Language', 'Language_ID', 'Order', 'Type', 'Text'],
    Languages: ['ID', 'Language', 'Original_Language', 'Alphabet'],
  },
  [KitVersionTypeEnum.Feedback]: {
    Questions: [
      'Question_ID',
      'Language',
      'Language_ID',
      'Type',
      'Question_Order',
      'Question_Text',
    ],
    Answers: ['ID', 'Question_ID', 'Language', 'Language_ID', 'Order', 'Type', 'Text'],
    Languages: ['ID', 'Language', 'Original_Language', 'Alphabet'],
  },
};

export const COMPARE_FIELDS: {
  field: string;
  fileKey: keyof FileLanguageItem;
  dbKey: keyof CountryItem;
}[] = [
  { field: 'language', fileKey: 'language', dbKey: 'language' },
  { field: 'original_lang', fileKey: 'original_lang', dbKey: 'original_lang' },
  { field: 'alphabet', fileKey: 'alphabet', dbKey: 'alphabet' },
];
