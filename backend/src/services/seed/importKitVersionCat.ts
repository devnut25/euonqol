import path from 'path';
import XLSX from 'xlsx';
import { PrismaClient } from '../../generated/app';

const prisma = new PrismaClient();

interface CATQuestionRow {
  Question_ID: string;
  Language: string;
  'Language _ID': number;
  Item: string;
  Type: string;
  Answer?: string;
  Version?: number;
  Scale?: string;
}

export async function importKitVersionCat(
  kitVersionName: string = 'EUonQoL v1.0',
  createdByUserId?: string
) {
  console.log(`🎯 Importing CAT questions for kit version: ${kitVersionName}...`);

  try {
    // Read Excel file
    const filePath = path.join(process.cwd(), 'data', 'QuestionsTemplate_Dynamic_20260408.xlsx');
    const workbook = XLSX.readFile(filePath);
    const sheet = workbook.Sheets['CATquestions'];

    if (!sheet) {
      throw new Error('CATquestions sheet not found in Excel file');
    }

    // Parse sheet to JSON
    const data = XLSX.utils.sheet_to_json(sheet) as CATQuestionRow[];

    console.log(`Found ${data.length} CAT question instances in Excel`);

    // Map language names to IDs (not needed: Language _ID column has numeric IDs directly)

    // 1. Upsert kit_version
    const kitVersion = await prisma.kit_versions.upsert({
      where: { name: kitVersionName },
      update: { name: kitVersionName },
      create: {
        name: kitVersionName,
        is_active: true,
        created_by: createdByUserId,
      },
    });

    console.log(`✓ Kit version: ${kitVersion.name} (ID: ${kitVersion.id})`);

    // 2. Upsert kit_version_files tracking record
    await prisma.kit_version_files.upsert({
      where: {
        unique_kit_file: {
          kit_version_id: kitVersion.id,
          question_kind: 'cat',
          language_id: 14,
        },
      },
      update: {
        file_name: 'QuestionsTemplate_Dynamic.xlsx',
        uploaded_by: createdByUserId,
      },
      create: {
        kit_version_id: kitVersion.id,
        question_kind: 'cat',
        file_name: 'QuestionsTemplate_Dynamic.xlsx',
        language_id: 14,
        uploaded_by: createdByUserId,
      },
    });

    // 3. Group by question_id (unique question code)
    const questionGroups = new Map<string, CATQuestionRow[]>();

    for (const row of data) {
      if (!row.Question_ID) continue;

      if (!questionGroups.has(row.Question_ID)) {
        questionGroups.set(row.Question_ID, []);
      }

      questionGroups.get(row.Question_ID)!.push(row);
    }

    console.log(`Processing ${questionGroups.size} unique CAT questions...`);

    let questionCount = 0;
    let translationCount = 0;

    for (const [questionCode, rows] of questionGroups) {
      // Use first row for metadata
      const firstRow = rows[0];

      // Resolve answer_profile_id
      let answer_profile_id: number | null = null;

      if (firstRow.Answer) {
        const profile = await prisma.answer_profiles.findUnique({
          where: { code: firstRow.Answer },
        });

        if (!profile) {
          console.warn(
            `⚠️  Answer profile not found: ${firstRow.Answer} for CAT question ${questionCode}`
          );
        } else {
          answer_profile_id = profile.id;
        }
      }

      // 4. Upsert question (language-agnostic)
      const question = await prisma.questions.upsert({
        where: {
          kit_version_id_question_kind_question_code: {
            kit_version_id: kitVersion.id,
            question_kind: 'cat',
            question_code: questionCode,
          },
        },
        update: {
          answer_profile_id,
          interface: firstRow.Type,
          scale: firstRow.Scale || null,
          version: firstRow.Version || null,
        },
        create: {
          kit_version_id: kitVersion.id,
          question_kind: 'cat',
          question_code: questionCode,
          answer_profile_id,
          interface: firstRow.Type,
          scale: firstRow.Scale || null,
          version: firstRow.Version || null,
          created_by: createdByUserId,
        },
      });
      questionCount++;

      // 5. Upsert cat_questions for each language
      for (const row of rows) {
        const langId = row['Language _ID'] || 14; // Use Language _ID directly (numeric)

        await prisma.cat_questions.upsert({
          where: {
            question_id_language_id: {
              question_id: question.id,
              language_id: langId,
            },
          },
          update: {
            question: row.Item || null,
          },
          create: {
            question_id: question.id,
            language_id: langId,
            question: row.Item || null,
          },
        });
        translationCount++;
      }
    }

    console.log(`✅ Successfully imported CAT questions:`);
    console.log(`   - ${questionCount} unique questions`);
    console.log(`   - ${translationCount} translations`);

    return { kitVersion, questionCount, translationCount };
  } catch (error) {
    console.error('❌ Error importing CAT questions:', error);
    throw error;
  }
}
