/** Names that appear more than once (case-sensitive, exact match). */
export function findDuplicateNames(names: string[]): string[] {
  const seen = new Set<string>();
  const duplicates: string[] = [];
  for (const name of names) {
    if (seen.has(name)) {
      if (!duplicates.includes(name)) duplicates.push(name);
    } else {
      seen.add(name);
    }
  }
  return duplicates;
}

export interface NameMatchResult {
  valid: string[];
  missing: string[];
  typos: { found: string; expected: string }[];
}

/**
 * Matches `required` names against `names` (sheet names, or column headers):
 * exact matches go to `valid`, a case-insensitive-only match is a likely typo,
 * anything not found at all is `missing`. Shared by both the sheet-name-level
 * and column-level matching in module-library/form-upload.tsx and
 * cat-item-banks/upload-form.tsx.
 */
export function matchNamesAgainstRequired(names: string[], required: string[]): NameMatchResult {
  const valid: string[] = [];
  const missing: string[] = [];
  const typos: { found: string; expected: string }[] = [];

  for (const req of required) {
    if (names.includes(req)) {
      valid.push(req);
      continue;
    }
    const typo = names.find((n) => n.toLowerCase() === req.toLowerCase() && n !== req);
    if (typo) {
      typos.push({ found: typo, expected: req });
    } else {
      missing.push(req);
    }
  }

  return { valid, missing, typos };
}
