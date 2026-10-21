import path from 'path';
import XLSX from 'xlsx';
import { PrismaClient } from '../../generated/app';

const prisma = new PrismaClient();

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

    // Upsert each country
    for (const row of data) {
      await prisma.eu_countries.upsert({
        where: { id: row.id },
        update: {
          language: row.language.trim(),
          original_lang: row.original_lang.trim(),
          alphabet: row.alphabet.trim(),
        },
        create: {
          id: row.id,
          language: row.language.trim(),
          original_lang: row.original_lang.trim(),
          alphabet: row.alphabet.trim(),
        },
      });
    }

    console.log(`✅ Successfully seeded ${data.length} EU countries`);
  } catch (error) {
    console.error('❌ Error seeding countries:', error);
    throw error;
  }
}
