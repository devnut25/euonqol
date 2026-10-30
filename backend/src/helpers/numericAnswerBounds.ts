/**
 * Min/Max bounds of numeric free-input answers — socio-demo 'Integer' / 'Date' (a year,
 * e.g. "Year of birth") and feedback 'Number' / 'Date' (a year) rows of the kit upload's "Answers" sheet
 * (optional "Min" / "Max" columns).
 *
 * Same rules as the upload preview check in
 * frontend-shadcn/src/containers/module-library/_helpers/validation.ts
 * (validateAnswerBounds) — keep the two in sync.
 */

export const NUMERIC_ANSWER_TYPES = ['integer', 'number', 'date'];

/** Types whose bounds must be whole numbers ('date' bounds are years). */
const INTEGER_ANSWER_TYPES = ['integer', 'date'];

export interface AnswerBoundsRow {
  Question_ID?: string | number;
  Type?: string;
  Min?: string | number | null;
  Max?: string | number | null;
  /** 0-based sheet row index, set (non-enumerable) by XLSX.utils.sheet_to_json. */
  __rowNum__?: number;
}

export interface AnswerBounds {
  min_value: number | null;
  max_value: number | null;
}

export function isNumericAnswerType(type: string | null | undefined): boolean {
  return NUMERIC_ANSWER_TYPES.includes(String(type ?? '').trim().toLowerCase());
}

function isBlank(value: unknown): boolean {
  return value === undefined || value === null || String(value).trim() === '';
}

function toNumber(value: unknown): number {
  return typeof value === 'number' ? value : Number(String(value).trim());
}

/** Bounds to persist for an Answers row — always null for non-numeric answer types. */
export function parseAnswerBounds(row: AnswerBoundsRow): AnswerBounds {
  if (!isNumericAnswerType(row.Type)) return { min_value: null, max_value: null };
  const parse = (value: unknown) => {
    if (isBlank(value)) return null;
    const num = toNumber(value);
    return Number.isFinite(num) ? num : null;
  };
  return { min_value: parse(row.Min), max_value: parse(row.Max) };
}

/**
 * Validates the Min/Max cells of every Answers row. Returns one message per problem
 * (empty array = valid). Row numbers are 1-based Excel rows (header = row 1).
 */
export function validateAnswerBoundsRows(rows: AnswerBoundsRow[]): string[] {
  const errors: string[] = [];

  rows.forEach((row, i) => {
    // sheet_to_json skips blank rows, so prefer its own row index over the array index
    const excelRow = row.__rowNum__ !== undefined ? row.__rowNum__ + 1 : i + 2;
    const where = `Answers row ${excelRow} (Question_ID ${row.Question_ID ?? '-'})`;
    const numericType = isNumericAnswerType(row.Type);
    const isInteger = INTEGER_ANSWER_TYPES.includes(String(row.Type ?? '').trim().toLowerCase());
    const bounds: Record<'Min' | 'Max', number | null> = { Min: null, Max: null };

    for (const column of ['Min', 'Max'] as const) {
      const raw = row[column];
      if (isBlank(raw)) continue;
      if (!numericType) {
        errors.push(`${where}: ${column} is allowed only for Integer, Number or Date answers`);
        continue;
      }
      const num = toNumber(raw);
      if (!Number.isFinite(num)) {
        errors.push(`${where}: ${column} "${raw}" is not a number`);
        continue;
      }
      if (isInteger && !Number.isInteger(num)) {
        errors.push(`${where}: ${column} "${raw}" must be an integer`);
        continue;
      }
      bounds[column] = num;
    }

    if (bounds.Min !== null && bounds.Max !== null && bounds.Min > bounds.Max) {
      errors.push(`${where}: Min (${bounds.Min}) is greater than Max (${bounds.Max})`);
    }
  });

  return errors;
}
