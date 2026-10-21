import readXlsxFile, { readSheetNames } from 'read-excel-file/browser';

export const EXCEL_MIME_TYPES = [
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-excel',
];

export const MAX_EXCEL_FILE_SIZE_MB = 10;

export type SheetData = Record<string, (string | number | null)[][]>;

/** Reads every sheet of an Excel file into a plain row-matrix keyed by sheet name. */
export async function readWorkbookSheets(
  file: File
): Promise<{ names: string[]; sheets: SheetData }> {
  const names = await readSheetNames(file);
  const sheets: SheetData = {};
  for (const name of names) {
    const rows = await readXlsxFile(file, { sheet: name });
    sheets[name] = rows as (string | number | null)[][];
  }
  return { names, sheets };
}

export async function fileToBase64(file: File): Promise<string> {
  const arrayBuffer = await file.arrayBuffer();
  const bytes = new Uint8Array(arrayBuffer);
  let binary = '';
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary);
}
