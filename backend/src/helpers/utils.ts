/**
 * Converte un valore in boolean
 */
export function toBoolean(val: string | boolean | undefined): boolean {
  if (typeof val === 'boolean') return val;
  if (typeof val === 'string') {
    return val.toLowerCase() === 'true' || val === '1';
  }
  return false;
}