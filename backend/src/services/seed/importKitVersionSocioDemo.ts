import path from 'path';
import XLSX from 'xlsx';
import { PrismaClient } from '../../generated/app';

const prisma = new PrismaClient();

// Helper: truncate string to max length
function truncate(value: string | null | undefined, maxLength: number): string | null {
  if (!value) return null;
  return value.length > maxLength ? value.substring(0, maxLength) : value;
}

// Helper: normalize answer_type values
function normalizeAnswerType(type: string | null | undefined): string {
  if (!type) return 'Text'; // default

  const typeMap: Record<string, string> = {
    Checkbox: 'Checkbox',
    checkbox: 'Checkbox',
    Text: 'Text',
    text: 'Text',
    Number: 'Number',
    number: 'Number',
  };

  return typeMap[type] || 'Text';
}

interface SocioDemoQuestionRow {
  Question_ID: string;
  Language: string;
  Language_ID: number;
  Question_Text: string;
  Interface?: string;
  Order_Position?: number;
}

interface SocioDemoAnswerRow {
  ID: number;
  Question_ID: string;
  Language: string;
  Language_ID: number;
  Order: number;
  Type: string; // 'Checkbox' | 'Text' | 'Number'
  Text: string;
}

export async function importKitVersionSocioDemo(
  kitVersionName: string = 'EUonQoL v1.0',
  createdByUserId?: string
) {
  console.log(`🔷 Importing socio-demo questions for kit version: ${kitVersionName}...`);

  try {
    // Read Excel file
    const filePath = path.join(process.cwd(), 'data', 'QuestionsTemplate_SocioDemo_20260408.xlsx');
    const workbook = XLSX.readFile(filePath);

    // Process Questions sheet
    const questionsSheet = workbook.Sheets['SocioDemoQuestions'];
    if (!questionsSheet) {
      throw new Error('SocioDemoQuestions sheet not found in Excel file');
    }

    // Process Answers sheet
    const answersSheet = workbook.Sheets['Answers'];
    if (!answersSheet) {
      throw new Error('Answers sheet not found in Excel file');
    }

    // Parse sheets to JSON
    const questionsData = XLSX.utils.sheet_to_json(questionsSheet) as SocioDemoQuestionRow[];
    const answersData = XLSX.utils.sheet_to_json(answersSheet) as SocioDemoAnswerRow[];

    console.log(`Found ${questionsData.length} question instances in SocioDemoQuestions sheet`);
    console.log(`Found ${answersData.length} answer instances in Answers sheet`);

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

    // Track unique languages from questions
    const languagesSet = new Set(questionsData.map((row) => row.Language_ID));
    console.log(`Found ${languagesSet.size} languages in questions data`);

    // 2. Track import in kit_version_files (using first language found)
    const firstLanguageId = Array.from(languagesSet)[0] || 14; // default to English (Ireland)
    await prisma.kit_version_files.upsert({
      where: {
        unique_kit_file: {
          kit_version_id: kitVersion.id,
          question_kind: 'socio-demo',
          language_id: firstLanguageId,
        },
      },
      update: {
        file_name: 'QuestionsTemplate_SocioDemo.xlsx',
        uploaded_by: createdByUserId,
      },
      create: {
        kit_version_id: kitVersion.id,
        question_kind: 'socio-demo',
        file_name: 'QuestionsTemplate_SocioDemo.xlsx',
        language_id: firstLanguageId,
        uploaded_by: createdByUserId,
      },
    });

    // 3. Group questions by id (across languages)
    const questionGroups = new Map<string, SocioDemoQuestionRow[]>();

    for (const row of questionsData) {
      if (!row.Question_ID) continue;

      if (!questionGroups.has(row.Question_ID)) {
        questionGroups.set(row.Question_ID, []);
      }

      questionGroups.get(row.Question_ID)!.push(row);
    }

    console.log(`Processing ${questionGroups.size} unique socio-demo questions...`);

    let questionCount = 0;
    let translationCount = 0;

    // 4. Process each question group
    for (const [questionCode, rows] of questionGroups) {
      // Use first row for metadata (language-agnostic fields)
      const firstRow = rows[0];

      // Upsert question (language-agnostic)
      // Socio-demo questions don't use answer_profiles, so answer_profile_id is NULL
      const question = await prisma.questions.upsert({
        where: {
          kit_version_id_question_kind_question_code: {
            kit_version_id: kitVersion.id,
            question_kind: 'socio-demo',
            question_code: questionCode,
          },
        },
        update: {
          answer_profile_id: null,
          interface: truncate(firstRow.Interface, 50),
          order_position: firstRow.Order_Position || null,
        },
        create: {
          kit_version_id: kitVersion.id,
          question_kind: 'socio-demo',
          question_code: truncate(questionCode, 50)!,
          answer_profile_id: null,
          interface: truncate(firstRow.Interface, 50),
          order_position: firstRow.Order_Position || null,
          created_by: createdByUserId,
        },
      });
      questionCount++;

      // 5. Upsert socio_demo_questions for each language
      for (const row of rows) {
        if (!row.Language_ID) {
          console.warn(`⚠️  Skipping question ${questionCode}: missing language_id`);
          continue;
        }

        await prisma.socio_demo_questions.upsert({
          where: {
            question_id_language_id: {
              question_id: question.id,
              language_id: row.Language_ID,
            },
          },
          update: {
            question_text: row.Question_Text || null,
          },
          create: {
            question_id: question.id,
            language_id: row.Language_ID,
            question_text: row.Question_Text || null,
          },
        });
        translationCount++;
      }
    }

    console.log(`✓ Processed ${questionCount} questions with ${translationCount} translations`);

    // 6. Group answers by Question_ID
    const answerGroups = new Map<string, SocioDemoAnswerRow[]>();

    for (const row of answersData) {
      if (!row.Question_ID) continue;

      if (!answerGroups.has(row.Question_ID)) {
        answerGroups.set(row.Question_ID, []);
      }

      answerGroups.get(row.Question_ID)!.push(row);
    }

    console.log(`Processing answers for ${answerGroups.size} questions...`);

    let answerCount = 0;

    // 7. Process answers for each question
    for (const [questionCode, answers] of answerGroups) {
      // Find the question in the database
      const question = await prisma.questions.findFirst({
        where: {
          kit_version_id: kitVersion.id,
          question_kind: 'socio-demo',
          question_code: questionCode,
        },
      });

      if (!question) {
        console.warn(`⚠️  Question not found for answers: ${questionCode}`);
        continue;
      }

      // Process each answer (now with Language_ID in the Excel file)
      for (const answer of answers) {
        // Skip answers without Language_ID
        if (!answer.Language_ID) {
          console.warn(`⚠️  Skipping answer for question ${questionCode}: missing language_id`);
          continue;
        }

        const answerType = normalizeAnswerType(answer.Type);

        // Check if answer already exists for this specific language
        const existing = await prisma.socio_demo_answers.findFirst({
          where: {
            question_id: question.id,
            language_id: answer.Language_ID,
            display_order: answer.Order,
          },
        });

        if (existing) {
          // Update existing answer
          await prisma.socio_demo_answers.update({
            where: { id: existing.id },
            data: {
              answer_text: answer.Text,
              answer_type: answerType,
            },
          });
        } else {
          // Create new answer
          await prisma.socio_demo_answers.create({
            data: {
              question_id: question.id,
              language_id: answer.Language_ID,
              answer_text: answer.Text,
              answer_type: answerType,
              display_order: answer.Order,
            },
          });
        }
        answerCount++;
      }
    }

    console.log(`✓ Processed ${answerCount} answer entries`);

    // 8. Map socio-demo questions to all patient groups
    console.log('\n🔗 Mapping socio-demo questions to all patient groups...');

    // Get all patient groups
    const patientGroups = await prisma.patient_groups.findMany({
      select: { id: true, name: true },
    });

    if (patientGroups.length === 0) {
      console.log('⚠️  No patient groups found. Skipping question-group mappings.');
    } else {
      // Get all socio-demo questions for this kit version
      const socioDemoQuestions = await prisma.questions.findMany({
        where: {
          kit_version_id: kitVersion.id,
          question_kind: 'socio-demo',
        },
        select: { id: true },
      });

      let mappingCount = 0;

      // Create mappings for all combinations
      for (const group of patientGroups) {
        for (const question of socioDemoQuestions) {
          await prisma.patient_group_questions.upsert({
            where: {
              patient_group_id_question_id: {
                patient_group_id: group.id,
                question_id: question.id,
              },
            },
            update: {},
            create: {
              patient_group_id: group.id,
              question_id: question.id,
            },
          });
          mappingCount++;
        }
      }

      console.log(`✓ Created ${mappingCount} question-group mappings`);
      console.log(`  (${socioDemoQuestions.length} questions × ${patientGroups.length} groups)`);
    }

    console.log('\n✅ Socio-demo questions import completed successfully!');
    console.log(`   - ${questionCount} questions`);
    console.log(`   - ${translationCount} question translations`);
    console.log(`   - ${answerCount} answer entries`);
  } catch (error) {
    console.error('❌ Error importing socio-demo questions:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

// Execute if run directly
if (import.meta.url === `file://${process.argv[1]}`) {
  importKitVersionSocioDemo('EUonQoL v1.0')
    .then(() => {
      console.log('\n🎉 Socio-demo seeding completed!');
      process.exit(0);
    })
    .catch((error) => {
      console.error('\n💥 Socio-demo seeding failed:', error);
      process.exit(1);
    });
}
