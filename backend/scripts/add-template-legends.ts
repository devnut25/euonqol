/**
 * (Re)writes the "Legend" sheet of every Excel template in data/templates.
 *
 * The Legend is documentation only: every import skips it (backend by sheet name,
 * frontend in helpers/upload/excel.ts readWorkbookSheets). It is always the LAST
 * sheet, so the data sheet stays the one the file opens on.
 *
 * The workbook is NOT re-serialized by a spreadsheet library: round-tripping through
 * exceljs/SheetJS corrupts the Excel tables of Static/Dynamic and drops custom XML.
 * Instead the Legend is injected straight into the .xlsx package (its own worksheet
 * part with inline strings, a few styles appended to styles.xml, plus the workbook,
 * relationship and content-type entries); every other part is left byte-for-byte.
 * Re-running replaces the previous Legend (its old styles stay, unused and harmless).
 *
 * Run inside the backend container (jszip ships there with exceljs):
 *   docker exec euonqol-backend npx tsx scripts/add-template-legends.ts
 *
 * Keep the texts below in sync with the import rules when they change.
 */
import { readFile, writeFile } from 'fs/promises';
import JSZip from 'jszip';
import path from 'path';
import { fileURLToPath } from 'url';

const TEMPLATES_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'data', 'templates');
const LEGEND = 'Legend';

type Row = string[];
interface Section {
  title: string;
  intro?: string;
  headers: Row;
  rows: Row[];
}
interface Legend {
  title: string;
  notes: string[];
  sections: Section[];
}

const COLUMN_HEADERS: Row = ['Sheet', 'Column', 'Required', 'What to enter', 'Notes'];

// ─── Shared texts ─────────────────────────────────────────────────────────────

const LANGUAGE_NAME =
  'English name of the language, exactly as in the platform language list (e.g. "English", "Italian"). Not case-sensitive.';
const LANGUAGE_NAME_NOTE = 'Native names ("Italiano") and language IDs are not accepted.';
const HTML_CONTENT =
  'HTML text. Recommended tags: <p>, <h1>/<h2>/<h3>, <strong>, <em>, <u>, <a href="...">, <ul>/<ol> with <li>.';
const FALLBACK_REPLACE =
  '"yes" = this language is shown when the patient\'s language is not available (it replaces the previous fallback). Blank = keep the current setting. Any other value (e.g. "no") = not the fallback.';
const FALLBACK_REPLACE_NOTE =
  'The first text uploaded for a survey is always the fallback. Do not set "no" on the current fallback without marking another language "yes": the survey would be left without one.';

const SURVEY_NOTES = [
  'This sheet is documentation only: it is ignored by the import. You can keep it in the file you upload.',
  'Do not rename, translate or reorder the column headers of the data sheet: they are matched exactly (case-sensitive).',
  'One row per language. Re-uploading a language that already exists updates it; languages that are not in the file are left untouched.',
];

const KIT_NOTES = [
  'This sheet is documentation only: it is ignored by the import. You can keep it in the file you upload.',
  'Do not rename the sheets or the column headers: they are matched exactly (case-sensitive).',
  'Each question has one row per language, all with the same question ID. Question-level settings (order, type, scoring, groups, skip logic) are read from the first row of each question.',
  'The "Languages" sheet updates the platform-wide language list, and answer profiles are shared by every kit: a change there applies everywhere.',
];

const LANGUAGES_ROWS: Row[] = [
  ['Languages', 'ID', 'Yes', 'Numeric ID of the language.', 'This is the value to use in every Language_ID column. Rows without a numeric ID are skipped.'],
  ['Languages', 'Language', 'Yes', 'English name of the language.', 'This name is what the survey imports (presentations, privacy policies, …) match in their "language" column.'],
  ['Languages', 'Original_Language', 'Yes', 'Name of the language in the language itself (e.g. "Italiano").', ''],
  ['Languages', 'Alphabet', 'Yes', 'Writing system (e.g. "Latin", "Cyrillic", "Greek").', ''],
];

const SKIP_LOGIC: Section = {
  title: 'Skip logic — Parent / Operator / Value',
  intro:
    'A question with a Parent is shown only when the condition on the parent\'s answer is true. Leave Parent and Operator blank for a question that is always shown.',
  headers: ['Operator', 'Meaning', 'Value to enter', 'Example', 'Notes'],
  rows: [
    ['=  (or ==)', 'Equal to', 'Answer value, or the option label', 'Value 1 → shown if the answer with value 1 is selected', 'For Multiple Choice parents: shown if that option is among the selected ones.'],
    ['!=', 'Different from', 'Answer value, or the option label', 'Value 1 → shown if any other answer is selected', ''],
    ['>', 'Greater than', 'Number', 'Value 2 → shown for answers 3, 4, …', 'Numeric comparison only. Not available for Multiple Choice parents.'],
    ['<', 'Less than', 'Number', 'Value 3 → shown for answers 1, 2', 'Numeric comparison only. Not available for Multiple Choice parents.'],
    ['>=', 'Greater than or equal to', 'Number', 'Value 3 → shown for answers 3, 4, …', 'Numeric comparison only. Not available for Multiple Choice parents.'],
    ['<=', 'Less than or equal to', 'Number', 'Value 2 → shown for answers 1, 2', 'Numeric comparison only. Not available for Multiple Choice parents.'],
    ['IN', 'One of a list', 'Numbers separated by ";"', 'Value 2;3 → shown if answer 2 or 3 is selected', 'Write IN in capitals. No commas or decimals.'],
    ['is null', 'The parent was not answered', 'Leave blank', '', 'A skipped question counts as not answered.'],
    ['is not null', 'The parent was answered', 'Leave blank', '', ''],
  ],
};

const SKIP_LOGIC_NOTES_STATIC: Row[] = [
  ['Parent', 'QuestionID of the question whose answer decides visibility.', '', '', 'Must be a question of the same module, i.e. assigned to the same patient groups. Case-sensitive. If the parent is not found, the question is never shown.'],
  ['Value (number)', 'The answer value: the column number (1–9) of the option in the "Answers" sheet.', '', '', ''],
  ['Value (text)', 'The option label in the patient\'s language (not case-sensitive).', '', '', 'Works with = and != only.'],
  ['Chains', 'If the parent is itself hidden, the question is hidden too.', '', '', ''],
  ['Pairs', 'Two consecutive questions with the same Parent, Operator and Value are shown together, the second under the first.', '', '', ''],
];

const SKIP_LOGIC_NOTES_ORDER: Row[] = [
  ['Parent', 'Question_ID of the question whose answer decides visibility.', '', '', 'Case-sensitive. If the parent is not found, the question is never shown.'],
  ['Value (number)', 'The "Order" of the option in the "Answers" sheet.', '', '', ''],
  ['Value (text)', 'The option label in the patient\'s language (not case-sensitive).', '', '', 'Works with = and != only.'],
  ['Chains', 'If the parent is itself hidden, the question is hidden too.', '', '', ''],
];

function skipLogic(extra: Row[]): Section[] {
  return [
    SKIP_LOGIC,
    {
      title: 'Skip logic — how Parent and Value are read',
      headers: ['Item', 'Rule', '', '', 'Notes'],
      rows: extra,
    },
  ];
}

// ─── Kit versions: Static / Dynamic ──────────────────────────────────────────

function staticDynamicQuestions(dynamic: boolean): Section {
  return {
    title: 'Sheet "Questions"',
    headers: COLUMN_HEADERS,
    rows: [
      ['Questions', 'QuestionID', 'Yes', 'Text code of the question (e.g. "EUonQoL_001"), max 50 characters.', 'Same code on every language row of the question. Codes starting with "Disclaimer_" are information screens.'],
      ['Questions', 'IRT_ItemCode', 'For IRT items', dynamic ? 'Item code used by the CAT engine and by IRT scoring (e.g. "PF15").' : 'Item code used by IRT scoring (e.g. "PF15").', 'Leave blank for items that are not IRT-scored.'],
      ['Questions', 'Question_Order', 'Yes', 'Whole number: position of the question in its module.', ''],
      ['Questions', 'Language', 'No', 'Language name, for readability only.', 'Not read by the import: Language_ID is what counts.'],
      ['Questions', 'Language_ID', 'Yes', 'ID of the language from the "Languages" sheet.', ''],
      ['Questions', 'ScaleCode', 'For scored items', 'Code of the scale (e.g. "PF_S").', dynamic ? 'Groups items for scoring and selects the norms. For adaptive scales it must match a ScaleCode in "CatSettings".' : 'Groups items for CTT scoring and selects the norms.'],
      ['Questions', 'Scale', 'No', 'Display name of the scale.', ''],
      ['Questions', 'Reverse', 'For scored items', '"1" = reverse scored (100 − score), "0" = direct.', 'Enter it as text. Blank = direct.'],
      ['Questions', 'Scoring_System', 'For scored items', '"IRT" or "CTT", in capitals.', 'Blank = the question is not scored.'],
      ['Questions', 'Score', 'No', '—', 'Not used by the import.'],
      ['Questions', 'Pramble', 'No', 'Introductory text shown highlighted above the question. HTML allowed.', dynamic ? 'For adaptive scales it is also the preamble of the scale in that language.' : ''],
      ['Questions', 'Parent / Operator / Value', 'No', 'Condition to show the question.', 'See "Skip logic" below.'],
      ['Questions', 'Items', 'Yes', 'Text of the question in this language. HTML allowed.', ''],
      ['Questions', 'Type', 'Yes', '"Question" or "Disclaimer".', '"Disclaimer" = information screen with no answers.'],
      ['Questions', 'Answer_Profile', 'For questions', 'Code of an answer profile of the "Answers" sheet (e.g. "extent_4").', 'Blank = information screen. A code that does not exist leaves the question without options.'],
      ['Questions', 'AnswerType', 'For questions', '"Checkbox" or "Text".', 'See "Answer types" below. Any other value makes the import fail.'],
      ['Questions', 'ACTIVE (Group A)', 'Yes', '1 = the question is in the module of this patient group, 0 = it is not.', 'Enter a number, not text. The same rule applies to the other three group columns.'],
      ['Questions', 'SURVIVORS (Group B)', 'Yes', '1 or 0.', ''],
      ['Questions', 'PALLIATIVE (Group C)', 'Yes', '1 or 0.', ''],
      ['Questions', 'POPULATION-INDEPENDENT (Group D)', 'Yes', '1 or 0.', 'At least one question must be in a group, otherwise no module is created.'],
    ],
  };
}

const STATIC_DYNAMIC_ANSWERS: Section = {
  title: 'Sheet "Answers" — answer profiles',
  intro: 'One row per profile and language. Each numbered column is an answer value; the cell is the label the patient sees.',
  headers: COLUMN_HEADERS,
  rows: [
    ['Answers', 'Answer_Profile', 'Yes', 'Code of the profile (e.g. "extent_4", "quality_7").', 'Used in the Answer_Profile column of "Questions". Profiles are shared by every kit.'],
    ['Answers', 'Language', 'No', 'Language name, for readability only.', ''],
    ['Answers', 'Language_ID', 'Yes', 'ID of the language from the "Languages" sheet.', ''],
    ['Answers', '-2', 'Yes', '"Skipped by system"', 'The question was not shown to the patient. Never selectable.'],
    ['Answers', '-1', 'Yes', '"Skipped by patient"', 'Saved when the patient goes on without answering. Never selectable.'],
    ['Answers', '1 … 7', 'As needed', 'Label of each answer.', 'The column number is the value used for scoring and for skip logic. Leave blank the values the profile does not use.'],
    ['Answers', '8', 'No', 'Label for "Not applicable".', 'Selectable, but counts as missing in scoring.'],
    ['Answers', '9', 'No', 'Label for "Prefer not to answer".', 'Selectable, but counts as missing in scoring.'],
    ['Answers', 'Labels', '', 'Labels must be text cells.', 'Keep the English words "Skipped by system" / "Skipped by patient" in the -2 and -1 labels of every language: they are what hides these values from the patient.'],
  ],
};

const STATIC_DYNAMIC_ANSWER_TYPES: Section = {
  title: 'Answer types (AnswerType column)',
  headers: ['AnswerType', 'What the patient sees', 'Answer_Profile', '', 'Notes'],
  rows: [
    ['Checkbox', 'List of the profile\'s answers; the patient selects ONE (single choice).', 'Required', '', 'Lists with more than 8 answers are shown in a grid.'],
    ['Text', 'Free-text box, max 300 characters, with a character counter.', 'Leave blank', '', ''],
  ],
};

const CAT_SETTINGS: Section = {
  title: 'Sheet "CatSettings" — adaptive scales',
  intro: 'One row per adaptive (CAT) scale.',
  headers: COLUMN_HEADERS,
  rows: [
    ['CatSettings', 'ScaleCode', 'Yes', 'Code of the scale (e.g. "EF_S").', 'Must match the ScaleCode of the scale\'s items in "Questions".'],
    ['CatSettings', 'Scale', 'No', 'Display name of the scale.', ''],
    ['CatSettings', 'Group A … Group D', 'As needed', 'CAT engine setting key for this scale and patient group (e.g. "EUonQOL_CAT_setting_EF_V3_AT_S_PC").', 'Every key is checked against the CAT engine on upload: an unknown key blocks the upload. Blank = no adaptive administration for that group: the IRT items are asked as fixed questions.'],
  ],
};

// ─── Kit versions: Additional information / Feedback ─────────────────────────

function orderQuestions(withMandatory: boolean): Section {
  const rows: Row[] = [
    ['Questions', 'Question_ID', 'Yes', 'Text code of the question (e.g. "SD00001").', 'Same code on every language row of the question. Use text codes, not plain numbers.'],
    ['Questions', 'Language', 'Yes', 'Language name, for readability only.', 'Not read by the import: Language_ID is what counts.'],
    ['Questions', 'Language_ID', 'Yes', 'ID of the language from the "Languages" sheet.', ''],
    ['Questions', 'Type', 'Yes', '"Question" or "Disclaimer".', 'A question with no rows in "Answers" is shown as information text.'],
    ['Questions', 'Question_Order', 'Yes', 'Whole number: position of the question.', ''],
  ];
  if (withMandatory) {
    rows.push(['Questions', 'IsMandatory', 'Yes', '"yes" or "no".', 'Stored for reference only: the patient can currently skip any question.']);
  }
  rows.push(
    ['Questions', 'Parent / Operator / Value', withMandatory ? 'Yes (may be blank)' : 'No', 'Condition to show the question.', 'See "Skip logic" below.'],
    ['Questions', 'Question_Text', 'Yes', 'Text of the question in this language. HTML allowed.', '']
  );
  return { title: 'Sheet "Questions"', headers: COLUMN_HEADERS, rows };
}

function orderAnswers(types: string): Section {
  return {
    title: 'Sheet "Answers"',
    intro: 'One row per answer option and language. A question with a single input (Text, Integer, Number, Date) has one row.',
    headers: COLUMN_HEADERS,
    rows: [
      ['Answers', 'ID', 'No', 'Progressive row number.', 'Not used by the import.'],
      ['Answers', 'Question_ID', 'Yes', 'Question_ID of the question this option belongs to.', 'Must exist in "Questions", otherwise the row is ignored.'],
      ['Answers', 'Language', 'No', 'Language name, for readability only.', ''],
      ['Answers', 'Language_ID', 'Yes', 'ID of the language from the "Languages" sheet.', ''],
      ['Answers', 'Order', 'Yes', 'Whole number: display order of the option.', 'It is also the number that skip logic compares with Value.'],
      ['Answers', 'Type', 'Yes', `Answer type: ${types}.`, 'See "Answer types" below. Not case-sensitive.'],
      ['Answers', 'Min', 'No', 'Lowest accepted value.', 'Only for Integer, Number and Date (for Date: a year, e.g. 1900). Must be a number; whole number for Integer and Date.'],
      ['Answers', 'Max', 'No', 'Highest accepted value.', 'Same rules as Min. Min must not be greater than Max. Invalid bounds block the upload.'],
      ['Answers', 'Text', 'Yes', 'Label of the option shown to the patient.', ''],
    ],
  };
}

const SOCIO_DEMO_ANSWER_TYPES: Section = {
  title: 'Answer types (Type column of "Answers")',
  headers: ['Type', 'What the patient sees', 'Min / Max', '', 'Notes'],
  rows: [
    ['Radio Button', 'Single choice among the question\'s options.', 'Not allowed', '', 'One row per option.'],
    ['Radio Button+Text', 'An option that, when selected, shows a free-text box (e.g. "Other, please specify").', 'Not allowed', '', 'Combine with Radio Button rows of the same question.'],
    ['Multiple Choice', 'Check boxes: the patient can select several options.', 'Not allowed', '', 'One row per option.'],
    ['Text', 'Single-line free-text box.', 'Not allowed', '', ''],
    ['Integer', 'Whole-number field with + / − buttons.', 'Allowed: value range', '', 'Values outside Min/Max are corrected. Without Min, negative numbers are not accepted.'],
    ['Date', 'Drop-down list of YEARS, from Max (default: current year) down to Min (default: 1900).', 'Allowed: years', '', 'Saved as a 4-digit year (YYYY).'],
    ['Not supported', 'Checkbox, Number, Multiple Choice+Text', '', '', 'These types are not displayed in this kit.'],
  ],
};

const FEEDBACK_ANSWER_TYPES: Section = {
  title: 'Answer types (Type column of "Answers")',
  headers: ['Type', 'What the patient sees', 'Min / Max', '', 'Notes'],
  rows: [
    ['Radio Button', 'Single choice among the question\'s options.', 'Not allowed', '', '"Checkbox" behaves the same (single choice).'],
    ['Multiple Choice', 'Check boxes: the patient can select several options.', 'Not allowed', '', 'One row per option.'],
    ['Multiple Choice+Text', 'A check box that shows a free-text box while ticked.', 'Not allowed', '', 'Combine with Multiple Choice rows of the same question.'],
    ['Text', 'Single-line free-text box.', 'Not allowed', '', ''],
    ['Number', 'Numeric field with + / − buttons; decimals allowed.', 'Allowed: value range', '', ''],
    ['Date', 'Calendar date picker (day, month, year).', 'Not applied', '', ''],
    ['Not supported', 'Integer, Radio Button+Text', '', '', 'These types are not displayed in this kit.'],
  ],
};

// ─── Legends per template ─────────────────────────────────────────────────────

const LEGENDS: Record<string, Legend> = {
  'Static_Template.xlsx': {
    title: 'Static kit version — how to fill in this template',
    notes: KIT_NOTES,
    sections: [
      staticDynamicQuestions(false),
      STATIC_DYNAMIC_ANSWER_TYPES,
      ...skipLogic(SKIP_LOGIC_NOTES_STATIC),
      STATIC_DYNAMIC_ANSWERS,
      { title: 'Sheet "Languages"', headers: COLUMN_HEADERS, rows: LANGUAGES_ROWS },
    ],
  },

  'Dynamic_Template.xlsx': {
    title: 'Dynamic (CAT) kit version — how to fill in this template',
    notes: [
      ...KIT_NOTES,
      'Fixed items (CTT, or IRT without a CAT setting for a group) are asked in Question_Order; adaptive scales are administered by the CAT engine at the position of their first item.',
    ],
    sections: [
      staticDynamicQuestions(true),
      STATIC_DYNAMIC_ANSWER_TYPES,
      ...skipLogic(SKIP_LOGIC_NOTES_STATIC),
      STATIC_DYNAMIC_ANSWERS,
      CAT_SETTINGS,
      { title: 'Sheet "Languages"', headers: COLUMN_HEADERS, rows: LANGUAGES_ROWS },
    ],
  },

  'Additional_Information_Template.xlsx': {
    title: 'Additional information kit version — how to fill in this template',
    notes: KIT_NOTES,
    sections: [
      orderQuestions(true),
      orderAnswers('Radio Button, Radio Button+Text, Multiple Choice, Text, Integer or Date'),
      SOCIO_DEMO_ANSWER_TYPES,
      ...skipLogic(SKIP_LOGIC_NOTES_ORDER),
      { title: 'Sheet "Languages"', headers: COLUMN_HEADERS, rows: LANGUAGES_ROWS },
    ],
  },

  'Feedback_Template.xlsx': {
    title: 'Feedback kit version — how to fill in this template',
    notes: KIT_NOTES,
    sections: [
      orderQuestions(false),
      orderAnswers('Radio Button, Multiple Choice, Multiple Choice+Text, Text, Number or Date'),
      FEEDBACK_ANSWER_TYPES,
      ...skipLogic(SKIP_LOGIC_NOTES_ORDER),
      { title: 'Sheet "Languages"', headers: COLUMN_HEADERS, rows: LANGUAGES_ROWS },
    ],
  },

  'CatItemBank_Template.xlsx': {
    title: 'CAT item bank — how to fill in this template',
    notes: [
      'This sheet is documentation only: it is ignored by the import. You can keep it in the file you upload.',
      'Do not rename the sheets or the column headers: they are matched exactly (case-sensitive). Note the space in "Language _ID".',
      'Each item has one row per language, all with the same Question_ID. Type, Answer, Version and Scale are read from the first row of each item.',
      'Re-uploading updates existing items; items that are not in the file are not deleted.',
      'The "Languages" sheet updates the platform-wide language list, and answer profiles are shared by every bank and kit: a change there applies everywhere.',
    ],
    sections: [
      {
        title: 'Sheet "Questions" — items',
        headers: COLUMN_HEADERS,
        rows: [
          ['Questions', 'Question_ID', 'Yes', 'Item code used by the CAT engine (e.g. "EF1"), max 50 characters.', 'Rows without it are ignored.'],
          ['Questions', 'Language', 'No', 'Language name, for readability only.', 'Not read by the import.'],
          ['Questions', 'Language _ID', 'Yes', 'ID of the language from the "Languages" sheet.', 'Blank = that translation is skipped. The ID must exist in the platform.'],
          ['Questions', 'Item', 'Yes', 'Text of the item in this language.', ''],
          ['Questions', 'Type', 'Yes', '"Question" or "Disclaimer" (drop-down).', ''],
          ['Questions', 'Answer', 'Yes', 'Code of an answer profile of the "Answers" sheet (e.g. "extent_4").', 'A code that does not exist leaves the item without answers.'],
          ['Questions', 'Version', 'No', 'Whole number: version of the item.', ''],
          ['Questions', 'Scale', 'Yes', 'Name of the scale the item belongs to (e.g. "Emotional functioning"), max 50 characters.', ''],
        ],
      },
      {
        title: 'Sheet "Answers" — answer profiles',
        intro: 'One row per profile and language. Each numbered column is an answer value; the cell is the label.',
        headers: COLUMN_HEADERS,
        rows: [
          ['Answers', 'Answer_Profile', 'Yes', 'Code of the profile (e.g. "extent_4").', 'Used in the Answer column of "Questions".'],
          ['Answers', 'Language', 'No', 'Language name, for readability only.', ''],
          ['Answers', 'Language_ID', 'Yes', 'ID of the language from the "Languages" sheet.', ''],
          ['Answers', '1, 2, 3, 4', 'Yes', 'Label of each answer value.', 'Labels must be text cells. Columns -2, -1 and 5 … 9 can be added if the profile needs them.'],
        ],
      },
      { title: 'Sheet "Languages"', headers: COLUMN_HEADERS, rows: LANGUAGES_ROWS },
    ],
  },

  'Presentations_Template.xlsx': {
    title: 'Presentations — how to fill in this template',
    notes: SURVEY_NOTES,
    sections: [
      {
        title: 'Sheet "Presentations"',
        headers: COLUMN_HEADERS,
        rows: [
          ['Presentations', 'language', 'Yes', LANGUAGE_NAME, LANGUAGE_NAME_NOTE],
          ['Presentations', 'title', 'No', 'Short title shown above the text, max 255 characters.', ''],
          ['Presentations', 'content', 'Yes', HTML_CONTENT, 'Text shown to the patient before the questionnaire starts.'],
          ['Presentations', 'is_fallback', 'No', FALLBACK_REPLACE, FALLBACK_REPLACE_NOTE],
        ],
      },
    ],
  },

  'PrivacyPolicies_Template.xlsx': {
    title: 'Privacy policies — how to fill in this template',
    notes: SURVEY_NOTES,
    sections: [
      {
        title: 'Sheet "PrivacyPolicies"',
        headers: COLUMN_HEADERS,
        rows: [
          ['PrivacyPolicies', 'language', 'Yes', LANGUAGE_NAME, LANGUAGE_NAME_NOTE],
          ['PrivacyPolicies', 'title', 'Yes', 'Policy title shown to the patient, max 255 characters.', ''],
          ['PrivacyPolicies', 'content', 'Yes', HTML_CONTENT, 'Full text of the privacy policy.'],
          ['PrivacyPolicies', 'is_fallback', 'No', '"yes" = this language is shown when the patient\'s language is not available (it replaces the previous fallback). Blank or "no" = keep the current setting.', 'The first policy uploaded for a survey becomes the fallback automatically.'],
        ],
      },
    ],
  },

  'Eligibility_Template.xlsx': {
    title: 'Eligibility questions — how to fill in this template',
    notes: [
      'This sheet is documentation only: it is ignored by the import. You can keep it in the file you upload.',
      'Do not rename, translate or reorder the column headers of the data sheet: they are matched exactly (case-sensitive).',
      'One row per question and language. Rows with the same order_position are the same question in different languages; do not repeat a language within the same order_position.',
      'Re-uploading an existing order_position updates that question; positions that are not in the file are left untouched.',
      'A patient who gives an answer other than expected_answer is disqualified: after Submit the questionnaire is closed and cannot be resumed.',
    ],
    sections: [
      {
        title: 'Sheet "Questions"',
        headers: COLUMN_HEADERS,
        rows: [
          ['Questions', 'order_position', 'Yes', 'Whole number: position of the question (1, 2, 3, …).', 'Questions are shown in ascending order.'],
          ['Questions', 'expected_answer', 'Yes', '"yes" or "no": the answer that lets the patient continue.', 'Read from the first row of each order_position.'],
          ['Questions', 'language', 'Yes', LANGUAGE_NAME, LANGUAGE_NAME_NOTE],
          ['Questions', 'question_text', 'Yes', 'Question shown to the patient, max 500 characters.', 'The patient answers Yes / No.'],
          ['Questions', 'disqualification_message', 'Yes', 'Message shown when the patient is disqualified.', ''],
          ['Questions', 'is_fallback', 'No', '"yes" = fallback language for all the eligibility questions of the survey. Blank or "no" = keep the current setting.', 'If several languages say "yes", the first one in the file wins.'],
        ],
      },
    ],
  },

  'Info_&_Consent_Template.xlsx': {
    title: 'Info & Consent — how to fill in this template',
    notes: [
      ...SURVEY_NOTES,
      'Each language needs its row in "Info&Consent" and its consent questions in "ConsentQuestions". Re-uploading a language replaces its consent questions.',
      'A patient who answers "I do not consent" to any question sees rejection_message: after Submit the questionnaire is closed and cannot be resumed.',
    ],
    sections: [
      {
        title: 'Sheet "Info&Consent"',
        headers: COLUMN_HEADERS,
        rows: [
          ['Info&Consent', 'language', 'Yes', LANGUAGE_NAME, LANGUAGE_NAME_NOTE],
          ['Info&Consent', 'title', 'Yes', 'Title shown to the patient, max 255 characters.', ''],
          ['Info&Consent', 'content', 'Yes', HTML_CONTENT, 'Full text of the study information sheet.'],
          ['Info&Consent', 'rejection_message', 'When there are consent questions', 'Message shown when the patient does not consent.', 'Required for every language that has consent questions.'],
          ['Info&Consent', 'is_fallback', 'No', FALLBACK_REPLACE, FALLBACK_REPLACE_NOTE],
        ],
      },
      {
        title: 'Sheet "ConsentQuestions"',
        headers: COLUMN_HEADERS,
        rows: [
          ['ConsentQuestions', 'language', 'Yes', 'Language name; must be one of the languages of the "Info&Consent" sheet.', ''],
          ['ConsentQuestions', 'order', 'No', 'Whole number: display order of the question within its language.', 'Blank = after the numbered questions, in row order.'],
          ['ConsentQuestions', 'question_text', 'Yes', 'Consent question shown to the patient.', 'The patient answers "I consent" / "I do not consent". At least one question is required by the upload form.'],
        ],
      },
    ],
  },

  'ClosingMessages_Template.xlsx': {
    title: 'Closing messages — how to fill in this template',
    notes: SURVEY_NOTES,
    sections: [
      {
        title: 'Sheet "ClosingMessages"',
        headers: COLUMN_HEADERS,
        rows: [
          ['ClosingMessages', 'language', 'Yes', LANGUAGE_NAME, LANGUAGE_NAME_NOTE],
          ['ClosingMessages', 'content', 'Yes', HTML_CONTENT, 'Shown once the patient has completed and submitted the questionnaire.'],
          ['ClosingMessages', 'link_used_message', 'Yes', 'HTML text.', 'Shown when a private link that has already completed the survey is opened again.'],
          ['ClosingMessages', 'survey_closed_message', 'Yes', 'HTML text.', 'Shown when the survey is not available (not started, ended, completed or disabled).'],
          ['ClosingMessages', 'is_fallback', 'No', FALLBACK_REPLACE, FALLBACK_REPLACE_NOTE],
        ],
      },
    ],
  },

  'Patients_Template.xlsx': {
    title: 'Patients — how to fill in this template',
    notes: [
      'This sheet is documentation only: it is ignored by the import. You can keep it in the file you upload.',
      'Only the columns patient_id and mail are accepted; do not add other columns.',
      'One row per patient. The upload only creates new patients: existing ones are never modified.',
      'All or nothing: if any row has an error, no patient is imported. Fix the errors and upload the whole file again.',
    ],
    sections: [
      {
        title: 'Sheet "Patients"',
        headers: COLUMN_HEADERS,
        rows: [
          ['Patients', 'patient_id', 'Yes', 'Identifier of the participant, max 255 characters.', 'Must be unique within the questionnaire and within the file.'],
          ['Patients', 'mail', 'No', 'E-mail address (e.g. name@example.com), max 255 characters.', 'Needed to send the invitation. Must be unique within the questionnaire and within the file; saved in lowercase.'],
        ],
      },
    ],
  },
};

// ─── Writer: inject the Legend into the .xlsx package ────────────────────────

const LEGEND_PART = 'xl/worksheets/legend.xml';
const COL_WIDTHS = [20, 30, 18, 60, 70];
const MERGED_WIDTH = COL_WIDTHS.reduce((a, b) => a + b, 0);
const PURPLE = 'FF5B4FC4';

/** Logical styles of the Legend, resolved to cellXfs indexes per workbook. */
type Style = 'title' | 'note' | 'section' | 'intro' | 'header' | 'cell' | 'cellBold';

function escapeXml(text: string): string {
  return text
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Appends `items` to a styles.xml collection, returning the index of the first one. */
function appendToCollection(
  styles: { xml: string },
  tag: 'fonts' | 'fills' | 'borders' | 'cellXfs',
  items: string[]
): number {
  const open = new RegExp(`<${tag}(\\s[^>]*)?>`);
  const match = styles.xml.match(open);
  if (!match) throw new Error(`styles.xml has no <${tag}> collection`);
  const countMatch = match[0].match(/count="(\d+)"/);
  // Without a count attribute, count the existing children.
  const close = `</${tag}>`;
  const start = match.index! + match[0].length;
  const end = styles.xml.indexOf(close, start);
  const childTag = { fonts: 'font', fills: 'fill', borders: 'border', cellXfs: 'xf' }[tag];
  const existing = countMatch
    ? Number(countMatch[1])
    : (styles.xml.slice(start, end).match(new RegExp(`<${childTag}[\\s/>]`, 'g')) ?? []).length;
  const newOpen = countMatch
    ? match[0].replace(/count="\d+"/, `count="${existing + items.length}"`)
    : match[0].replace(`<${tag}`, `<${tag} count="${existing + items.length}"`);
  styles.xml =
    styles.xml.slice(0, match.index!) + newOpen + styles.xml.slice(start, end) + items.join('') + styles.xml.slice(end);
  return existing;
}

function addLegendStyles(styles: { xml: string }): Record<Style, number> {
  const font = appendToCollection(styles, 'fonts', [
    '<font><b/><sz val="14"/><name val="Calibri"/><family val="2"/></font>',
    '<font><b/><sz val="12"/><color rgb="FFFFFFFF"/><name val="Calibri"/><family val="2"/></font>',
    '<font><i/><sz val="11"/><name val="Calibri"/><family val="2"/></font>',
    '<font><b/><sz val="11"/><name val="Calibri"/><family val="2"/></font>',
    '<font><sz val="11"/><name val="Calibri"/><family val="2"/></font>',
  ]);
  const [fTitle, fSection, fIntro, fBold, fNormal] = [0, 1, 2, 3, 4].map((i) => font + i);

  const fill = appendToCollection(styles, 'fills', [
    `<fill><patternFill patternType="solid"><fgColor rgb="${PURPLE}"/><bgColor indexed="64"/></patternFill></fill>`,
    '<fill><patternFill patternType="solid"><fgColor rgb="FFE8E6F7"/><bgColor indexed="64"/></patternFill></fill>',
  ]);
  const [fillPurple, fillLight] = [fill, fill + 1];

  const side = (s: string) => `<${s} style="thin"><color rgb="FFD0D0D0"/></${s}>`;
  const border = appendToCollection(styles, 'borders', [
    `<border>${side('left')}${side('right')}${side('top')}${side('bottom')}<diagonal/></border>`,
  ]);

  const wrap = '<alignment vertical="top" wrapText="1"/>';
  const xf = (fontId: number, fillId: number, borderId: number, align: boolean) =>
    `<xf numFmtId="0" fontId="${fontId}" fillId="${fillId}" borderId="${borderId}" xfId="0" applyFont="1"` +
    `${fillId ? ' applyFill="1"' : ''}${borderId ? ' applyBorder="1"' : ''}` +
    (align ? ` applyAlignment="1">${wrap}</xf>` : '/>');
  const first = appendToCollection(styles, 'cellXfs', [
    xf(fTitle, 0, 0, false),
    xf(fNormal, 0, 0, true),
    xf(fSection, fillPurple, 0, false),
    xf(fIntro, 0, 0, true),
    xf(fBold, fillLight, border, true),
    xf(fNormal, 0, border, true),
    xf(fBold, 0, border, true),
  ]);
  const order: Style[] = ['title', 'note', 'section', 'intro', 'header', 'cell', 'cellBold'];
  return Object.fromEntries(order.map((s, i) => [s, first + i])) as Record<Style, number>;
}

/** Wrapped text height estimate: Excel does not auto-fit merged or pre-built rows. */
function rowHeight(texts: { text: string; width: number }[]): number {
  let lines = 1;
  for (const { text, width } of texts) {
    const perLine = Math.max(1, Math.floor(width * 1.1));
    const l = text.split('\n').reduce((sum, part) => sum + Math.max(1, Math.ceil(part.length / perLine)), 0);
    lines = Math.max(lines, l);
  }
  return lines * 15 + (lines > 1 ? 3 : 0);
}

function buildLegendSheet(legend: Legend, s: Record<Style, number>): string {
  const rows: string[] = [];
  const merges: string[] = [];
  const cols = ['A', 'B', 'C', 'D', 'E'];
  let r = 0;

  const cell = (col: number, text: string, style: number) =>
    `<c r="${cols[col]}${r}" s="${style}"${text ? ` t="inlineStr"><is><t xml:space="preserve">${escapeXml(text)}</t></is></c>` : '/>'}`;

  const merged = (text: string, style: number, height?: number) => {
    r++;
    const ht = height ?? rowHeight([{ text, width: MERGED_WIDTH }]);
    const filler = [1, 2, 3, 4].map((c) => cell(c, '', style)).join('');
    rows.push(`<row r="${r}" ht="${ht}" customHeight="1">${cell(0, text, style)}${filler}</row>`);
    merges.push(`<mergeCell ref="A${r}:E${r}"/>`);
  };
  const blank = () => {
    r++;
  };
  const table = (values: string[], styleFor: (col: number) => number) => {
    r++;
    const ht = rowHeight(values.map((text, i) => ({ text, width: COL_WIDTHS[i] })));
    const cells = cols.map((_, i) => cell(i, values[i] ?? '', styleFor(i))).join('');
    rows.push(`<row r="${r}" ht="${ht}" customHeight="1">${cells}</row>`);
  };

  merged(legend.title, s.title, 22);
  blank();
  for (const note of legend.notes) merged(`• ${note}`, s.note);
  for (const section of legend.sections) {
    blank();
    merged(section.title, s.section, 20);
    if (section.intro) merged(section.intro, s.intro);
    table(section.headers, () => s.header);
    for (const row of section.rows) table(row, (i) => (i === 1 ? s.cellBold : s.cell));
  }

  return (
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' +
    '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" ' +
    'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
    `<sheetPr><tabColor rgb="${PURPLE}"/></sheetPr>` +
    `<dimension ref="A1:E${r}"/>` +
    '<sheetViews><sheetView showGridLines="0" workbookViewId="0"/></sheetViews>' +
    '<sheetFormatPr defaultRowHeight="15"/>' +
    `<cols>${COL_WIDTHS.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join('')}</cols>` +
    `<sheetData>${rows.join('')}</sheetData>` +
    `<mergeCells count="${merges.length}">${merges.join('')}</mergeCells>` +
    '<pageMargins left="0.7" right="0.7" top="0.75" bottom="0.75" header="0.3" footer="0.3"/>' +
    '</worksheet>'
  );
}

// jszip would otherwise add empty folder entries ("xl/", …) the original package has not.
const NO_FOLDERS = { createFolders: false };

const WORKSHEET_REL_TYPE = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet';
const WORKSHEET_CONTENT_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml';

async function injectLegend(filePath: string, legend: Legend): Promise<string[]> {
  const zip = await JSZip.loadAsync(await readFile(filePath));
  const read = async (name: string) => {
    const f = zip.file(name);
    if (!f) throw new Error(`${name} missing`);
    return f.async('string');
  };

  let workbook = await read('xl/workbook.xml');
  let rels = await read('xl/_rels/workbook.xml.rels');
  let types = await read('[Content_Types].xml');

  // Drop a Legend written by a previous run.
  const old = workbook.match(/<sheet\b[^>]*\bname="Legend"[^>]*\/>/);
  if (old) {
    const rid = old[0].match(/r:id="([^"]+)"/)![1];
    workbook = workbook.replace(old[0], '');
    const rel = rels.match(new RegExp(`<Relationship\\b[^>]*\\bId="${rid}"[^>]*/>`));
    if (rel) {
      const target = rel[0].match(/Target="([^"]+)"/)![1].replace(/^\/?(xl\/)?/, '');
      zip.remove(`xl/${target}`);
      types = types.replace(new RegExp(`<Override\\b[^>]*PartName="/xl/${target}"[^>]*/>`), '');
      rels = rels.replace(rel[0], '');
    }
  }

  const stylesRef = { xml: await read('xl/styles.xml') };
  const styleIds = addLegendStyles(stylesRef);
  zip.file('xl/styles.xml', stylesRef.xml, NO_FOLDERS);
  zip.file(LEGEND_PART, buildLegendSheet(legend, styleIds), NO_FOLDERS);

  const usedIds = new Set([...rels.matchAll(/\bId="([^"]+)"/g)].map((m) => m[1]));
  let n = 1;
  while (usedIds.has(`rIdLegend${n}`)) n++;
  const rid = `rIdLegend${n}`;
  rels = rels.replace(
    '</Relationships>',
    `<Relationship Id="${rid}" Type="${WORKSHEET_REL_TYPE}" Target="worksheets/legend.xml"/></Relationships>`
  );

  const sheetIds = [...workbook.matchAll(/<sheet\b[^>]*\bsheetId="(\d+)"/g)].map((m) => Number(m[1]));
  const sheetId = Math.max(0, ...sheetIds) + 1;
  // Appended last: the data sheet stays first and active, localSheetId indexes are unchanged.
  workbook = workbook.replace('</sheets>', `<sheet name="${LEGEND}" sheetId="${sheetId}" r:id="${rid}"/></sheets>`);

  types = types.replace(
    '</Types>',
    `<Override PartName="/${LEGEND_PART}" ContentType="${WORKSHEET_CONTENT_TYPE}"/></Types>`
  );

  zip.file('xl/workbook.xml', workbook, NO_FOLDERS);
  zip.file('xl/_rels/workbook.xml.rels', rels, NO_FOLDERS);
  zip.file('[Content_Types].xml', types, NO_FOLDERS);

  await writeFile(
    filePath,
    await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE', compressionOptions: { level: 6 } })
  );
  return [...workbook.matchAll(/<sheet\b[^>]*\bname="([^"]+)"/g)].map((m) => m[1]);
}

async function main() {
  for (const [file, legend] of Object.entries(LEGENDS)) {
    const sheets = await injectLegend(path.join(TEMPLATES_DIR, file), legend);
    console.log(`✓ ${file}: ${sheets.join(', ')}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
