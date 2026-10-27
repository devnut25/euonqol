import { prisma } from '../config/database.js';

export interface CATQuestionRow {
  Question_ID: string;
  Language: string;
  'Language _ID': number;
  Item: string;
  Type: string;
  Answer?: string;
  Version?: number;
  Scale?: string;
}

export class CatQuestion {
  /**
   * Upserts a cat_questions translation record (one per question + language).
   *
   * @param catId - The CAT item key (Questions sheet IRT_ItemCode, e.g. "AP4"),
   *   mirroring static_questions.cat_id. It is what the EORTC engine indexes its
   *   item bank by, and the only usable item key when scoring a dynamic module's
   *   FIXED IRT scales — question_code there is the Excel QuestionID
   *   ("EUonQoL_014"), which the engine does not know. Left null by the
   *   standalone CAT Item Bank upload, whose question_code IS already the key.
   */
  static async upsert(
    questionId: number,
    languageId: number,
    question: string | null,
    pramble: string | null = null,
    catId: string | null = null
  ): Promise<void> {
    await prisma.cat_questions.upsert({
      where: {
        question_id_language_id: { question_id: questionId, language_id: languageId },
      },
      update: { question, pramble, cat_id: catId },
      create: {
        question_id: questionId,
        language_id: languageId,
        question,
        pramble,
        cat_id: catId,
      },
    });
  }
}
