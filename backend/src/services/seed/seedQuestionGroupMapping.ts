import { PrismaClient } from '../../generated/app';
import XLSX from 'xlsx';
import path from 'path';

const prisma = new PrismaClient();

interface StaticQuestionRow {
  question_id: string;
  flag_group_a?: number;
  flag_group_b?: number;
  flag_group_c?: number;
  flag_group_d?: number;
}

export async function seedQuestionGroupMapping(kitVersionName: string = 'EUonQoL v1.0') {
  console.log(`🔗 Mapping questions to patient groups for kit version: ${kitVersionName}...`);
  
  try {
    // Read Excel file
    const filePath = path.join(process.cwd(), 'data', 'QuestionsTemplate_Static.xlsx');
    const workbook = XLSX.readFile(filePath);
    const sheet = workbook.Sheets['Questions'];
    
    if (!sheet) {
      throw new Error('Questions sheet not found in Excel file');
    }
    
    // Parse sheet to JSON
    const data = XLSX.utils.sheet_to_json(sheet) as StaticQuestionRow[];
    
    // Get kit version
    const kitVersion = await prisma.kit_versions.findUnique({
      where: { name: kitVersionName },
    });
    
    if (!kitVersion) {
      throw new Error(`Kit version not found: ${kitVersionName}`);
    }
    
    // Get patient groups
    const groupA = await prisma.patient_groups.findUnique({ where: { name: 'Group A' } });
    const groupB = await prisma.patient_groups.findUnique({ where: { name: 'Group B' } });
    const groupC = await prisma.patient_groups.findUnique({ where: { name: 'Group C' } });
    
    if (!groupA || !groupB || !groupC) {
      throw new Error('Patient groups not found. Run seedPatientGroups first.');
    }
    
    // Group by question_id to get unique questions
    const questionMap = new Map<string, StaticQuestionRow>();
    
    for (const row of data) {
      if (!row.question_id) continue;
      
      // Use first occurrence for each question_id
      if (!questionMap.has(row.question_id)) {
        questionMap.set(row.question_id, row);
      }
    }
    
    console.log(`Processing ${questionMap.size} unique questions...`);
    
    let mappingCount = 0;
    
    for (const [questionCode, row] of questionMap) {
      // Find the question in database
      const question = await prisma.questions.findUnique({
        where: {
          kit_version_id_question_kind_question_code: {
            kit_version_id: kitVersion.id,
            question_kind: 'static',
            question_code: questionCode,
          },
        },
      });
      
      if (!question) {
        console.warn(`⚠️  Question not found in database: ${questionCode}`);
        continue;
      }
      
      // Map to groups based on flags
      const groupMappings: Array<{ groupId: number, groupName: string }> = [];
      
      if (row.flag_group_a === 1) {
        groupMappings.push({ groupId: groupA.id, groupName: 'Group A' });
      }
      if (row.flag_group_b === 1) {
        groupMappings.push({ groupId: groupB.id, groupName: 'Group B' });
      }
      if (row.flag_group_c === 1) {
        groupMappings.push({ groupId: groupC.id, groupName: 'Group C' });
      }
      
      // Create mappings
      for (const { groupId, groupName } of groupMappings) {
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
        mappingCount++;
      }
    }
    
    console.log(`✅ Successfully created ${mappingCount} question-group mappings`);
    
    // Show summary per group
    const groupACnt = await prisma.patient_group_questions.count({
      where: { patient_group_id: groupA.id },
    });
    const groupBCnt = await prisma.patient_group_questions.count({
      where: { patient_group_id: groupB.id },
    });
    const groupCCnt = await prisma.patient_group_questions.count({
      where: { patient_group_id: groupC.id },
    });
    
    console.log(`   - Group A: ${groupACnt} questions`);
    console.log(`   - Group B: ${groupBCnt} questions`);
    console.log(`   - Group C: ${groupCCnt} questions`);
    
  } catch (error) {
    console.error('❌ Error mapping questions to groups:', error);
    throw error;
  }
}
