import { PrismaClient } from '@/generated/app';

const prisma = new PrismaClient();

export interface LanguageRow {
  ID: number;
  Language: string;
  Original_Language: string;
  Alphabet: string;
}

export class Country {
  /**
   * Upserts eu_countries rows from the Languages sheet of the Excel file.
   * If the id already exists, updates the record; otherwise creates a new one.
   * Returns the number of languages processed.
   */
  static async upsertLanguages(rows: LanguageRow[]): Promise<number> {
    let count = 0;
    for (const row of rows) {
      if (!row.ID || isNaN(Number(row.ID))) continue;
      await prisma.eu_countries.upsert({
        where: { id: Number(row.ID) },
        update: {
          language: String(row.Language ?? '').trim(),
          original_lang: String(row.Original_Language ?? '').trim(),
          alphabet: String(row.Alphabet ?? '').trim(),
        },
        create: {
          id: Number(row.ID),
          language: String(row.Language ?? '').trim(),
          original_lang: String(row.Original_Language ?? '').trim(),
          alphabet: String(row.Alphabet ?? '').trim(),
        },
      });
      count++;
    }
    return count;
  }
}
