import XLSX from 'xlsx';
import { PrismaClient } from '../generated/app/index.js';
import { ServiceError } from '../helpers/ServiceError.js';
import { CatQuestion, CATQuestionRow } from '../models/CatQuestion.js';
import { Country, LanguageRow } from '../models/Country.js';
import { Question } from '../models/Question.js';
import { KitVersionImportService } from './KitVersionImportService.js';

const prisma = new PrismaClient();

export interface CatItemBankImportResult {
  questionCount: number;
  translationCount: number;
  languageCount: number;
  answerProfileCount: number;
}

/**
 * Imports raw CAT items directly into a reusable CAT Item Bank (Settings > CAT
 * Item Bank > Upload) — decoupled from any kit_version/module. Reads the plain
 * "CATquestions" sheet shape (Question_ID, Language, Language _ID, Item, Type,
 * Answer, Version, Scale — no patient-group flags), plus the standard "Answers"
 * and "Languages" sheets shared with the other import flows.
 */
export class CatItemBankImportService {
  static async importItems(
    workbook: XLSX.WorkBook,
    catItemBankId: number,
    createdByUserId: string | null
  ): Promise<CatItemBankImportResult> {
    const sheet = workbook.Sheets['Questions'];
    if (!sheet) {
      throw new ServiceError('Excel file must contain a "Questions" sheet');
    }

    const data = XLSX.utils.sheet_to_json(sheet) as CATQuestionRow[];
    if (data.length === 0) {
      throw new ServiceError('The "Questions" sheet is empty');
    }

    // Upsert languages from the Languages sheet (if present)
    let languageCount = 0;
    const langSheet = workbook.Sheets['Languages'];
    if (langSheet) {
      const langRows = XLSX.utils.sheet_to_json(langSheet) as LanguageRow[];
      languageCount = await Country.upsertLanguages(langRows);
    }

    // Shared with KitVersionImportService — same "Answers" sheet shape.
    const answerProfileCount = await KitVersionImportService.importAnswerProfiles(workbook);

    // Group rows by Question_ID
    const questionGroups = new Map<string, CATQuestionRow[]>();
    for (const row of data) {
      if (!row.Question_ID) continue;
      if (!questionGroups.has(row.Question_ID)) {
        questionGroups.set(row.Question_ID, []);
      }
      questionGroups.get(row.Question_ID)!.push(row);
    }

    if (questionGroups.size === 0) {
      throw new ServiceError(
        'No valid rows found in the "Questions" sheet — check the Question_ID column header'
      );
    }

    let questionCount = 0;
    let translationCount = 0;

    for (const [, rows] of questionGroups) {
      const firstRow = rows[0];

      const question = await Question.upsertCatItem(catItemBankId, firstRow, createdByUserId);
      questionCount++;

      for (const row of rows) {
        const langId = row['Language _ID'];
        if (!langId) continue;
        await CatQuestion.upsert(question.id, langId, row.Item || null);
        translationCount++;
      }
    }

    await prisma.cat_item_banks.update({
      where: { id: catItemBankId },
      data: { updated_at: new Date() },
    });

    return { questionCount, translationCount, languageCount, answerProfileCount };
  }
}
