import { COMPARE_FIELDS, REQUIRED_COLUMNS, REQUIRED_SHEETS } from '@/features/config/kit-version';
import type { SheetData } from '@/helpers/upload/excel';
import { findDuplicateNames, matchNamesAgainstRequired } from '@/helpers/upload/validation';
import { KitVersionTypeEnum } from '@/utils/enum';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface CountryItem {
  id: number;
  language: string;
  original_lang: string;
  alphabet: string;
}

export interface FileLanguageItem {
  id: number;
  language: string;
  original_lang: string;
  alphabet: string;
}

interface ChangedField {
  field: string;
  fileValue: string;
  dbValue: string;
}

export interface LanguageDiffData {
  onlyInDb: CountryItem[];
  onlyInFile: FileLanguageItem[];
  changed: { id: number; language: string; changes: ChangedField[] }[];
}

// One entry per (ScaleCode, patient group) that's used by an active question in
// "Questions" but has no setting_key at all for that group in "CatSettings" —
// a file-internal inconsistency, distinct from MissingCatSetting below (which is
// about settings that ARE declared in the file but don't exist in the DB yet).
export interface MissingScaleMapping {
  scaleCode: string;
  group: string;
}

// One entry per (ScaleCode, patient group) — the "CatSettings" sheet has one
// setting_key column PER GROUP, since the same scale can be driven by a different
// external CAT engine setting depending on the group.
export interface MissingCatSetting {
  scaleCode: string;
  group: string;
  settingKey: string;
}

export interface ColumnValidation {
  missing: string[];
  typos: { found: string; expected: string }[];
  duplicates: string[];
  extra?: string[];
  invalidInValues: InvalidInValueRow[];
  invalidBounds: InvalidBoundsRow[];
}

export interface InvalidInValueRow {
  row: number; // 1-based Excel row number (header = row 1)
  value: string;
}

export type InvalidBoundsReason = 'not_numeric' | 'not_integer' | 'min_gt_max' | 'wrong_type';

export interface InvalidBoundsRow {
  row: number; // 1-based Excel row number (header = row 1)
  column: 'Min' | 'Max';
  value: string;
  reason: InvalidBoundsReason;
}

export interface SheetValidation {
  missing: string[];
  typos: { found: string; expected: string }[];
  valid: string[];
  extra: string[];
  columns: Record<string, ColumnValidation>;
}

// ─── Sheet/column validation ─────────────────────────────────────────────────

// Operator === 'IN' expects Value as answer positions separated by ';' (e.g. "2;3").
// Anything else (commas, decimals, blank, non-numeric) is flagged so it doesn't silently
// evaluate to "always hidden" at runtime (see player-helpers.ts evaluateCondition).
const IN_VALUE_PATTERN = /^\d+(\s*;\s*\d+)*$/;

function validateInOperatorValues(rows: (string | number | null)[][]): InvalidInValueRow[] {
  const headers = rows[0] ?? [];
  const headerStrings = headers.map((h) => String(h ?? ''));
  const operatorIdx = headerStrings.indexOf('Operator');
  const valueIdx = headerStrings.indexOf('Value');
  if (operatorIdx === -1 || valueIdx === -1) return [];

  const invalid: InvalidInValueRow[] = [];
  rows.slice(1).forEach((row, i) => {
    const operator = String(row[operatorIdx] ?? '').trim();
    if (operator.toUpperCase() !== 'IN') return;
    const value = String(row[valueIdx] ?? '').trim();
    if (!IN_VALUE_PATTERN.test(value)) {
      invalid.push({ row: i + 2, value }); // +2: skip header row, 1-based
    }
  });
  return invalid;
}

// Optional "Min"/"Max" columns of the socio-demo/feedback "Answers" sheet: bounds of a
// numeric free-input answer (Type 'Integer' / 'Number'). Same rules as the backend import
// (backend/src/helpers/numericAnswerBounds.ts validateAnswerBoundsRows) — keep in sync.
const BOUNDS_KIT_TYPES = [KitVersionTypeEnum.SocioDemo, KitVersionTypeEnum.Feedback];
const NUMERIC_ANSWER_TYPES = ['integer', 'number'];

function validateAnswerBounds(
  kitType: KitVersionTypeEnum,
  sheetName: string,
  rows: (string | number | null)[][]
): InvalidBoundsRow[] {
  if (sheetName !== 'Answers' || !BOUNDS_KIT_TYPES.includes(kitType)) return [];
  const headerStrings = (rows[0] ?? []).map((h) => String(h ?? ''));
  const typeIdx = headerStrings.indexOf('Type');
  const minIdx = headerStrings.indexOf('Min');
  const maxIdx = headerStrings.indexOf('Max');
  if (minIdx === -1 && maxIdx === -1) return [];

  const invalid: InvalidBoundsRow[] = [];
  rows.slice(1).forEach((row, i) => {
    const excelRow = i + 2; // +2: skip header row, 1-based
    const type = String(row[typeIdx] ?? '').trim().toLowerCase();
    const numericType = NUMERIC_ANSWER_TYPES.includes(type);
    const bounds: Record<'Min' | 'Max', number | null> = { Min: null, Max: null };

    for (const [column, idx] of [
      ['Min', minIdx],
      ['Max', maxIdx],
    ] as const) {
      if (idx === -1) continue;
      const value = String(row[idx] ?? '').trim();
      if (value === '') continue;
      const num = Number(value);
      const reason: InvalidBoundsReason | null = !numericType
        ? 'wrong_type'
        : !Number.isFinite(num)
          ? 'not_numeric'
          : type === 'integer' && !Number.isInteger(num)
            ? 'not_integer'
            : null;
      if (reason) invalid.push({ row: excelRow, column, value, reason });
      else bounds[column] = num;
    }

    if (bounds.Min !== null && bounds.Max !== null && bounds.Min > bounds.Max) {
      invalid.push({ row: excelRow, column: 'Min', value: String(bounds.Min), reason: 'min_gt_max' });
    }
  });
  return invalid;
}

function validateColumns(
  kitType: KitVersionTypeEnum,
  sheetName: string,
  rows: (string | number | null)[][]
): ColumnValidation {
  const required = REQUIRED_COLUMNS[kitType]?.[sheetName];
  const headers = rows[0] ?? [];
  const headerStrings = headers.map((h) => String(h ?? ''));
  const invalidInValues = validateInOperatorValues(rows);
  const invalidBounds = validateAnswerBounds(kitType, sheetName, rows);
  // Detect duplicates regardless of required columns config
  const duplicates = findDuplicateNames(headerStrings);

  if (!required) return { missing: [], typos: [], duplicates, invalidInValues, invalidBounds };

  const { missing, typos } = matchNamesAgainstRequired(headerStrings, required);
  return { missing, typos, duplicates, invalidInValues, invalidBounds };
}

export function validateSheets(
  kitType: KitVersionTypeEnum,
  names: string[],
  allSheets: SheetData
): SheetValidation {
  const { valid, missing, typos } = matchNamesAgainstRequired(names, REQUIRED_SHEETS[kitType]);

  const columns: Record<string, ColumnValidation> = {};
  for (const sheetName of valid) {
    columns[sheetName] = validateColumns(kitType, sheetName, allSheets[sheetName] ?? []);
  }

  // Sheets present in the file but not required (not valid, not a typo match)
  const knownNames = new Set([...valid, ...typos.map((t) => t.found)]);
  const extra = names.filter((name) => !knownNames.has(name));

  return { missing, typos, valid, extra, columns };
}

// ─── Language diff ────────────────────────────────────────────────────────────

export function extractFileLanguages(sheetsData: SheetData): FileLanguageItem[] {
  const rows = sheetsData['Languages'];
  if (!rows || rows.length < 2) return [];

  const headers = rows[0].map((h) => String(h ?? '').toLowerCase());
  const idx = (col: string) => headers.indexOf(col.toLowerCase());
  const idIdx = idx('ID');

  if (idIdx === -1) return [];

  const str = (row: (string | number | null)[], i: number) =>
    i !== -1 ? String(row[i] ?? '').trim() : '';

  return rows
    .slice(1)
    .filter((row) => row[idIdx] != null && !isNaN(Number(row[idIdx])))
    .map((row) => ({
      id: Number(row[idIdx]),
      language: str(row, idx('Language')),
      original_lang: str(row, idx('Original_Language')),
      alphabet: str(row, idx('Alphabet')),
    }));
}

export const CAT_SETTINGS_GROUP_COLUMNS = ['Group A', 'Group B', 'Group C', 'Group D'];

export function extractCatSettingsSheet(sheetsData: SheetData): MissingCatSetting[] {
  const rows = sheetsData['CatSettings'];
  if (!rows || rows.length < 2) return [];

  const headers = rows[0].map((h) => String(h ?? ''));
  const idx = (col: string) => headers.findIndex((h) => h.toLowerCase() === col.toLowerCase());
  const scaleIdx = idx('ScaleCode');
  const groupIdxs = CAT_SETTINGS_GROUP_COLUMNS.map((group) => ({ group, index: idx(group) })).filter(
    (g) => g.index !== -1
  );

  if (scaleIdx === -1 || groupIdxs.length === 0) return [];

  const str = (row: (string | number | null)[], i: number) =>
    i !== -1 ? String(row[i] ?? '').trim() : '';

  const result: MissingCatSetting[] = [];
  for (const row of rows.slice(1)) {
    const scaleCode = str(row, scaleIdx);
    if (!scaleCode) continue;
    for (const { group, index } of groupIdxs) {
      const settingKey = str(row, index);
      if (!settingKey) continue;
      result.push({ scaleCode, group, settingKey });
    }
  }
  return result;
}

const QUESTIONS_GROUP_FLAG_COLUMNS = [
  { flagColumn: 'ACTIVE (Group A)', group: 'Group A' },
  { flagColumn: 'SURVIVORS (Group B)', group: 'Group B' },
  { flagColumn: 'PALLIATIVE (Group C)', group: 'Group C' },
  { flagColumn: 'POPULATION-INDEPENDENT (Group D)', group: 'Group D' },
];

/**
 * Cross-checks the "Questions" sheet's ScaleCode/group-flag columns against the
 * "CatSettings" sheet's per-group setting_key columns — mirrors the same check the
 * backend runs before creating modules (KitVersionImportService.importDynamic),
 * so the admin sees it immediately instead of after a failed upload.
 *
 * Only IRT-scored rows (Scoring_System = "IRT") are checked — CTT scales are never
 * CAT-driven (fixed, scored classically), so they don't need a CatSettings mapping.
 */
export function validateScaleSettingsCoverage(sheetsData: SheetData): MissingScaleMapping[] {
  const questionRows = sheetsData['Questions'];
  const catSettingsRows = sheetsData['CatSettings'];
  if (!questionRows || questionRows.length < 2 || !catSettingsRows || catSettingsRows.length < 2) {
    return [];
  }

  const qHeaders = questionRows[0].map((h) => String(h ?? ''));
  const qIdx = (col: string) => qHeaders.findIndex((h) => h.toLowerCase() === col.toLowerCase());
  const scaleCodeIdx = qIdx('ScaleCode');
  const scoringSystemIdx = qIdx('Scoring_System');
  if (scaleCodeIdx === -1) return [];

  const csHeaders = catSettingsRows[0].map((h) => String(h ?? ''));
  const csIdx = (col: string) => csHeaders.findIndex((h) => h.toLowerCase() === col.toLowerCase());
  const csScaleIdx = csIdx('ScaleCode');
  if (csScaleIdx === -1) return [];

  // (scaleCode, group) pairs that DO have a non-empty setting_key in CatSettings.
  const covered = new Set<string>();
  for (const row of catSettingsRows.slice(1)) {
    const scaleCode = String(row[csScaleIdx] ?? '').trim();
    if (!scaleCode) continue;
    for (const { group } of QUESTIONS_GROUP_FLAG_COLUMNS) {
      const colIdx = csIdx(group);
      if (colIdx === -1) continue;
      if (String(row[colIdx] ?? '').trim()) covered.add(`${scaleCode}::${group}`);
    }
  }

  const missing = new Map<string, MissingScaleMapping>();
  for (const row of questionRows.slice(1)) {
    const scaleCode = String(row[scaleCodeIdx] ?? '').trim();
    if (!scaleCode) continue;
    const scoringSystem = scoringSystemIdx !== -1 ? String(row[scoringSystemIdx] ?? '').trim().toUpperCase() : '';
    if (scoringSystem !== 'IRT') continue;
    for (const { flagColumn, group } of QUESTIONS_GROUP_FLAG_COLUMNS) {
      const flagIdx = qIdx(flagColumn);
      if (flagIdx === -1) continue;
      const flagValue = row[flagIdx];
      const isActive = flagValue === 1 || String(flagValue ?? '').trim() === '1';
      if (!isActive) continue;

      const key = `${scaleCode}::${group}`;
      if (!covered.has(key) && !missing.has(key)) {
        missing.set(key, { scaleCode, group });
      }
    }
  }

  return [...missing.values()];
}

export function computeLanguageDiff(
  fileLanguages: FileLanguageItem[],
  dbCountries: CountryItem[]
): LanguageDiffData {
  const fileById = new Map(fileLanguages.map((l) => [l.id, l]));
  const dbById = new Map(dbCountries.map((c) => [c.id, c]));

  const onlyInDb = dbCountries.filter((c) => !fileById.has(c.id));
  const onlyInFile = fileLanguages.filter((l) => !dbById.has(l.id));

  const changed: LanguageDiffData['changed'] = [];
  for (const [id, fileItem] of fileById) {
    const dbItem = dbById.get(id);
    if (!dbItem) continue;
    const changes: ChangedField[] = COMPARE_FIELDS.flatMap(({ field, fileKey, dbKey }) => {
      const fileVal = String(fileItem[fileKey] ?? '').trim();
      const dbVal = String(dbItem[dbKey] ?? '').trim();

      return fileVal !== dbVal ? [{ field, fileValue: fileVal, dbValue: dbVal }] : [];
    });
    if (changes.length > 0)
      changed.push({ id, language: fileItem.language || dbItem.language, changes });
  }

  return { onlyInDb, onlyInFile, changed };
}
