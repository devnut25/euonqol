// Funzione helper per serializzare qualsiasi tipo di valore
export function serializeValue(value: any): string {
  if (value === null || value === undefined) {
    return "all";
  }
  return JSON.stringify(value);
}

// Funzione helper per deserializzare
export function deserializeValue(raw: string): any {
  if (raw === "all") {
    return undefined;
  }
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}

/**
 * Normalizza il valore del filtro
 * Rimuove solo valori vuoti (stringa vuota, null, undefined)
 * Mantiene false, 0, "false", "0"
 */
export function normalizeFilterValue(value: any): any {
  if (value === "" || value === null || value === undefined) {
    return undefined;
  }
  return value;
}