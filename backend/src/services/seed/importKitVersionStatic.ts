import path from 'path';
import XLSX from 'xlsx';
import { PrismaClient } from '../../generated/app';

const prisma = new PrismaClient();

// Helper: normalize question_type values to match DB constraints
function normalizeQuestionType(type: string | null | undefined): string | null {
  if (!type) return null;
  const typeMap: Record<string, string> = {
    Checkbox: 'check',
    checkbox: 'check',
    Textcheck: 'textcheck',
    textcheck: 'textcheck',
    Text: 'text',
    text: 'text',
  };
  return typeMap[type] || type.toLowerCase();
}

// Helper: truncate string to max length
function truncate(value: string | null | undefined, maxLength: number): string | null {
  if (!value) return null;
  return value.length > maxLength ? value.substring(0, maxLength) : value;
}

interface StaticQuestionRow {
  QuestionID: string;
  IRT_ItemCode?: string;
  Question_Order?: number;
  Language_ID: number;
  Language: string;
  ScaleCode?: string;
  Scale?: string;
  Reverse?: string;
  Scoring_System?: string;
  Items?: string;
  Type: string;
  Answer_Profile?: string;
  AnswerType?: string;
  'ACTIVE (Group A)'?: number;
  'SURVIVORS (Group B)'?: number;
  'PALLIATIVE (Group C)'?: number;
  'POPULATION-INDEPENDENT (Group D)'?: number;
  Parent?: string;
  Operator?: string;
  Value?: string;
}

export async function importKitVersionStatic(
  kitVersionName: string = 'EUonQoL v1.0',
  createdByUserId?: string
) {
  console.log(`📚 Importing static questions for kit version: ${kitVersionName}...`);

  try {
    // Read Excel file
    const filePath = path.join(process.cwd(), 'data', 'QuestionsTemplate_Static_20260408.xlsx');
    const workbook = XLSX.readFile(filePath);
    const sheet = workbook.Sheets['Questions'];

    if (!sheet) {
      throw new Error('Questions sheet not found in Excel file');
    }

    // Parse sheet to JSON
    const data = XLSX.utils.sheet_to_json(sheet) as StaticQuestionRow[];

    console.log(`Found ${data.length} question instances in Excel`);

    // Diagnostic: print all column names found across the entire dataset.
    // We scan all rows because conditional columns (Parent, Operator, Value) only
    // appear on rows that have skip-logic defined – they won't show up in data[0].
    if (data.length > 0) {
      const allColumns = new Set<string>();
      for (const row of data) Object.keys(row).forEach((k) => allColumns.add(k));
      const detectedColumns = [...allColumns];
      console.log(`📋 Excel columns detected: ${detectedColumns.join(', ')}`);
      const conditionalCols = detectedColumns.filter((c) =>
        ['parent', 'operator', 'value'].includes(c.toLowerCase())
      );
      if (conditionalCols.length === 3) {
        console.log(`✓ Conditional columns found: ${conditionalCols.join(', ')}`);
      } else {
        console.warn(
          `⚠️  Missing conditional columns. Expected: Parent, Operator, Value. Found: ${detectedColumns.join(', ')}`
        );
      }
    }

    // 1. Upsert kit_version
    // TODO: verificare il procedimento con KitVersionService => create duplicato ??
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

    // Track unique languages
    const languagesSet = new Set(data.map((row) => row.Language_ID));
    console.log(`Found ${languagesSet.size} languages in data`);

    // 2. Upsert kit_version_files tracking record
    // TODO: recuperare nome del file originale e associarlo alla risorsa kit_version_files (al momento è hardcoded) => come gestire aggiornamenti del file ?
    await prisma.kit_version_files.upsert({
      where: {
        unique_kit_file: {
          kit_version_id: kitVersion.id,
          question_kind: 'static',
          language_id: 14,
        },
      },
      update: {
        file_name: 'QuestionsTemplate_Static.xlsx',
        uploaded_by: createdByUserId,
      },
      create: {
        kit_version_id: kitVersion.id,
        question_kind: 'static',
        file_name: 'QuestionsTemplate_Static.xlsx',
        language_id: 14,
        uploaded_by: createdByUserId,
      },
    });

    // 3. Group by question_id (unique question code)
    const questionGroups = new Map<string, StaticQuestionRow[]>();

    for (const row of data) {
      if (!row.QuestionID) continue;

      if (!questionGroups.has(row.QuestionID)) {
        questionGroups.set(row.QuestionID, []);
      }

      questionGroups.get(row.QuestionID)!.push(row);
    }

    console.log(`Processing ${questionGroups.size} unique questions...`);

    let questionCount = 0;
    let translationCount = 0;

    for (const [questionCode, rows] of questionGroups) {
      // Use first row for metadata (language-agnostic fields)
      const firstRow = rows[0];

      // Read conditional skip-logic fields: search all rows in the group so
      // these don't need to be repeated on every language translation row.
      // XLSX may read numeric cells as JS numbers, so we always coerce to string.
      const rawParent = rows.map((r) => (r as any).Parent).find((v) => v != null && v !== '');
      const rawOperator = rows.map((r) => (r as any).Operator).find((v) => v != null && v !== '');
      const rawValue = rows.map((r) => (r as any).Value).find((v) => v != null && v !== '');
      const parentQid = rawParent != null ? truncate(String(rawParent), 50) : null;
      const operatorVal = rawOperator != null ? truncate(String(rawOperator), 20) : null;
      // Strip surrounding quotes that Excel may include around string values (e.g. "Yes" → Yes)
      const rawCondStr = rawValue != null ? String(rawValue).trim() : null;
      const conditionVal =
        rawCondStr != null
          ? truncate(rawCondStr.replace(/^"|"$/g, "'").replace(/^'|'$/g, ''), 50)
          : null;

      if (parentQid) {
        console.log(
          `  ↳ ${questionCode}: parent=${parentQid}, operator=${operatorVal}, value=${conditionVal}`
        );
      }

      // Check if it's an info-only question (like Disclaimer)
      const isInfoOnly =
        firstRow.Type === 'Disclaimer' ||
        questionCode.startsWith('Disclaimer_') ||
        !firstRow.Answer_Profile;

      // Resolve answer_profile_id if exists
      let answer_profile_id: number | null = null;

      if (!isInfoOnly && firstRow.Answer_Profile) {
        const profile = await prisma.answer_profiles.findUnique({
          where: { code: firstRow.Answer_Profile },
        });

        if (!profile) {
          console.warn(
            `⚠️  Answer profile not found: ${firstRow.Answer_Profile} for question ${questionCode}`
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
            question_kind: 'static',
            question_code: questionCode,
          },
        },
        update: {
          answer_profile_id,
          interface: truncate(firstRow.Type, 50),
          question_type: normalizeQuestionType(firstRow.AnswerType),
          order_position: firstRow.Question_Order || null,
          scale: truncate(firstRow.ScaleCode, 50),
          direction:
            firstRow.Reverse === '1' ? 'negative' : firstRow.Reverse === '0' ? 'positive' : null,
          score_system: truncate(firstRow.Scoring_System, 50),
          parent_qid: parentQid,
          operator: operatorVal,
          value: conditionVal,
        },
        create: {
          kit_version_id: kitVersion.id,
          question_kind: 'static',
          question_code: truncate(questionCode, 50)!,
          answer_profile_id,
          interface: truncate(firstRow.Type, 50),
          question_type: normalizeQuestionType(firstRow.AnswerType),
          order_position: firstRow.Question_Order || null,
          scale: truncate(firstRow.ScaleCode, 50),
          direction:
            firstRow.Reverse === '1' ? 'negative' : firstRow.Reverse === '0' ? 'positive' : null,
          score_system: truncate(firstRow.Scoring_System, 50),
          parent_qid: parentQid,
          operator: operatorVal,
          value: conditionVal,
          created_by: createdByUserId,
        },
      });
      questionCount++;

      // 5. Upsert static_questions for each language
      for (const row of rows) {
        await prisma.static_questions.upsert({
          where: {
            question_id_language_id: {
              question_id: question.id,
              language_id: row.Language_ID,
            },
          },
          update: {
            cat_id: row.IRT_ItemCode || null,
            head: row.Scale || null,
            question: row.Items || null,
          },
          create: {
            question_id: question.id,
            language_id: row.Language_ID,
            cat_id: row.IRT_ItemCode || null,
            head: row.Scale || null,
            question: row.Items || null,
          },
        });
        translationCount++;
      }

      // 6. Map patient groups based on flags
      const groupMappings: { groupId: number; flag: number | undefined }[] = [
        { groupId: 1, flag: firstRow['ACTIVE (Group A)'] },
        { groupId: 2, flag: firstRow['SURVIVORS (Group B)'] },
        { groupId: 3, flag: firstRow['PALLIATIVE (Group C)'] },
        { groupId: 4, flag: firstRow['POPULATION-INDEPENDENT (Group D)'] },
      ];

      for (const { groupId, flag } of groupMappings) {
        if (flag === 1) {
          // Associate question with patient group
          await prisma.patient_group_questions.upsert({
            where: {
              patient_group_id_question_id: {
                patient_group_id: groupId,
                question_id: question.id,
              },
            },
            update: {},
            create: {
              patient_group_id: groupId,
              question_id: question.id,
            },
          });
        }
      }
    }

    console.log(`✅ Successfully imported static questions:`);
    console.log(`   - ${questionCount} unique questions`);
    console.log(`   - ${translationCount} translations`);

    return { kitVersion, questionCount, translationCount };
  } catch (error) {
    console.error('❌ Error importing static questions:', error);
    throw error;
  }
}
