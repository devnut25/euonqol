import path from 'path';
import XLSX from 'xlsx';
import { PrismaClient } from '../../generated/app';

const prisma = new PrismaClient();

interface AnswerRow {
  Answer_Profile: string;
  Language: string;
  Language_ID: number;
  '-2'?: string; // Skipped by system
  '-1'?: string; // Skipped by patient
  '1'?: string;
  '2'?: string;
  '3'?: string;
  '4'?: string;
  '5'?: string;
  '6'?: string;
  '7'?: string;
  '8'?: string;
  '9'?: string;
}

export async function importAnswers() {
  console.log('📋 Importing answer catalog from Excel...');

  try {
    // Read Excel file
    const filePath = path.join(process.cwd(), 'data', 'QuestionsTemplate_Static_20260408.xlsx');
    const workbook = XLSX.readFile(filePath);
    const sheet = workbook.Sheets['Answers'];

    if (!sheet) {
      throw new Error('Answers sheet not found in Excel file');
    }

    // Parse sheet to JSON
    const data = XLSX.utils.sheet_to_json(sheet) as AnswerRow[];

    console.log(`Found ${data.length} answer rows in Excel`);

    // Group by Answer_Profile
    const profilesMap = new Map<string, Map<number, AnswerRow>>();

    for (const row of data) {
      if (!row.Answer_Profile) continue;

      if (!profilesMap.has(row.Answer_Profile)) {
        profilesMap.set(row.Answer_Profile, new Map());
      }

      profilesMap.get(row.Answer_Profile)!.set(row.Language_ID, row);
    }

    console.log(`Processing ${profilesMap.size} unique answer profiles...`);

    let profileCount = 0;
    let optionCount = 0;
    let i18nCount = 0;

    for (const [profileCode, languageRows] of profilesMap) {
      // 1. Upsert answer_profile
      const profile = await prisma.answer_profiles.upsert({
        where: { code: profileCode },
        update: { code: profileCode },
        create: {
          code: profileCode,
          description: `Answer profile ${profileCode}`,
        },
      });
      profileCount++;

      // 2. Get all possible values from first language row
      const firstRow = Array.from(languageRows.values())[0];
      const valueColumns = ['-2', '-1', '1', '2', '3', '4', '5', '6', '7', '8', '9'];

      // Collect values that have labels in at least one language
      const valuesWithLabels = new Set<string>();
      for (const row of languageRows.values()) {
        for (const col of valueColumns) {
          const label = row[col as keyof AnswerRow];
          if (label && typeof label === 'string' && label.trim()) {
            valuesWithLabels.add(col);
          }
        }
      }

      let displayOrder = 1;

      for (const valueStr of valueColumns) {
        if (!valuesWithLabels.has(valueStr)) continue;

        const value = parseInt(valueStr);

        // Determine option_code and is_selectable
        let option_code: string | null = null;
        let is_selectable = true;

        if (value === -2) {
          option_code = 'SKIP_SYS';
          is_selectable = false; // System skip, not user selectable
        } else if (value === -1) {
          option_code = 'SKIP_PAT';
          is_selectable = true; // Patient can choose to skip
        } else if (value === 8) {
          option_code = 'NA'; // Not Applicable
        } else if (value === 9) {
          option_code = 'PNTA'; // Prefer Not To Answer
        }

        // 3. Upsert answer_option
        const option = await prisma.answer_options.upsert({
          where: {
            answer_profile_id_value: {
              answer_profile_id: profile.id,
              value: value,
            },
          },
          update: {
            option_code,
            display_order: displayOrder,
            is_selectable,
          },
          create: {
            answer_profile_id: profile.id,
            value: value,
            option_code,
            display_order: displayOrder,
            is_selectable,
          },
        });
        optionCount++;

        // 4. Upsert i18n for each language
        for (const [langId, row] of languageRows) {
          const label = row[valueStr as keyof AnswerRow];
          if (!label || typeof label !== 'string' || !label.trim()) continue;

          await prisma.answer_option_i18n.upsert({
            where: {
              answer_option_id_language_id: {
                answer_option_id: option.id,
                language_id: langId,
              },
            },
            update: {
              label: label.trim(),
            },
            create: {
              answer_option_id: option.id,
              language_id: langId,
              label: label.trim(),
            },
          });
          i18nCount++;
        }

        displayOrder++;
      }
    }

    console.log(`✅ Successfully imported answer catalog:`);
    console.log(`   - ${profileCount} answer profiles`);
    console.log(`   - ${optionCount} answer options`);
    console.log(`   - ${i18nCount} translations`);
  } catch (error) {
    console.error('❌ Error importing answers:', error);
    throw error;
  }
}
