import path from 'path';
import XLSX from 'xlsx';
import { PrismaClient } from '../../generated/app';

const prisma = new PrismaClient();

/**
 * Seeds eu_countries from the Excel "Languages" sheet. Languages are append-only (their ids are
 * referenced by every translation table): rows already present are never updated, a row whose
 * id exists with different data is only reported.
 */
export async function seedCountries() {
  console.log('🌍 Seeding EU countries from Excel...');

  try {
    // Read Excel file
    const filePath = path.join(process.cwd(), 'data', 'QuestionsTemplate_Static.xlsx');
    const workbook = XLSX.readFile(filePath);
    const sheet = workbook.Sheets['Languages'];

    if (!sheet) {
      throw new Error('Languages sheet not found in Excel file');
    }

    // Parse sheet to JSON
    const data = XLSX.utils.sheet_to_json(sheet) as Array<{
      id: number;

      language: string;
      original_lang: string;
      alphabet: string;
    }>;

    console.log(`Found ${data.length} countries in Excel`);

    const existing = await prisma.eu_countries.findMany();
    const byId = new Map(existing.map((l) => [l.id, l]));
    const byName = new Map(existing.map((l) => [l.language.trim().toLowerCase(), l]));

    let created = 0;
    for (const row of data) {
      const language = row.language.trim();
      const found = byId.get(row.id) ?? byName.get(language.toLowerCase());

      if (found) {
        if (found.id !== row.id || found.language !== language) {
          console.warn(
            `⚠️  Skipped "${language}" (id ${row.id}): already stored as "${found.language}" (id ${found.id})`
          );
        }
        continue;
      }

      const country = await prisma.eu_countries.create({
        data: {
          id: row.id,
          language,
          original_lang: row.original_lang.trim(),
          alphabet: row.alphabet.trim(),
        },
      });
      byId.set(country.id, country);
      byName.set(language.toLowerCase(), country);
      created++;
    }

    // Rows were inserted with explicit ids: keep the sequence ahead of them
    await prisma.$executeRawUnsafe(
      `SELECT setval(pg_get_serial_sequence('euonqol.eu_countries', 'id'), (SELECT MAX(id) FROM euonqol.eu_countries))`
    );

    console.log(`✅ EU countries seeded: ${created} added, ${data.length - created} already present`);
  } catch (error) {
    console.error('❌ Error seeding countries:', error);
    throw error;
  }
}
