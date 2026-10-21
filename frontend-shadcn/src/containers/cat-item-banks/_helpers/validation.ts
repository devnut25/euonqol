import {
  CAT_ITEM_BANK_REQUIRED_COLUMNS,
  CAT_ITEM_BANK_REQUIRED_SHEETS,
} from '@/features/config/cat-item-bank';
import type { SheetData } from '@/helpers/upload/excel';
import { findDuplicateNames, matchNamesAgainstRequired } from '@/helpers/upload/validation';

interface ColumnValidation {
  missing: string[];
  typos: { found: string; expected: string }[];
  duplicates: string[];
  // Not applicable to CAT item banks (no Operator/Value nor Min/Max columns), but
  // required for structural compatibility with TabPreview's getTabStatus, which
  // reads col.invalidInValues.length and col.invalidBounds.length unconditionally.
  invalidInValues: never[];
  invalidBounds: never[];
}

export interface SheetValidation {
  missing: string[];
  typos: { found: string; expected: string }[];
  valid: string[];
  extra: string[];
  columns: Record<string, ColumnValidation>;
}

function validateColumns(sheetName: string, headers: (string | number | null)[]): ColumnValidation {
  const required = CAT_ITEM_BANK_REQUIRED_COLUMNS[sheetName];
  const headerStrings = headers.map((h) => String(h ?? ''));
  const duplicates = findDuplicateNames(headerStrings);

  if (!required)
    return { missing: [], typos: [], duplicates, invalidInValues: [], invalidBounds: [] };

  const { missing, typos } = matchNamesAgainstRequired(headerStrings, required);
  return { missing, typos, duplicates, invalidInValues: [], invalidBounds: [] };
}

export function validateSheets(names: string[], allSheets: SheetData): SheetValidation {
  const { valid, missing, typos } = matchNamesAgainstRequired(names, CAT_ITEM_BANK_REQUIRED_SHEETS);

  const columns: Record<string, ColumnValidation> = {};
  for (const sheetName of valid) {
    columns[sheetName] = validateColumns(sheetName, allSheets[sheetName]?.[0] ?? []);
  }

  const knownNames = new Set([...valid, ...typos.map((t) => t.found)]);
  const extra = names.filter((name) => !knownNames.has(name));

  return { missing, typos, valid, extra, columns };
}

/** True when the parsed validation blocks a safe upload. */
export function hasBlockingSheetErrors(sheetValidation: SheetValidation | null): boolean {
  if (!sheetValidation) return false;
  const hasColumnErrors = Object.values(sheetValidation.columns).some(
    (c) => c.missing.length > 0 || c.typos.length > 0 || c.duplicates.length > 0
  );
  return (
    sheetValidation.missing.length > 0 ||
    sheetValidation.typos.length > 0 ||
    hasColumnErrors ||
    sheetValidation.extra.length > 0
  );
}
