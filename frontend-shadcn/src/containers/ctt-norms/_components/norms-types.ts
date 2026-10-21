export interface CttNormEntry {
  name: string;
  scaleCode: string;
  average: number;
  sd: number;
}

export function emptyNorms(): CttNormEntry[] {
  return [{ name: '', scaleCode: '', average: 0, sd: 1 }];
}
