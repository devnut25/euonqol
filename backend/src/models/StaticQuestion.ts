import { PrismaClient } from '../generated/app/index.js';

const prisma = new PrismaClient();

export interface StaticQuestionRow {
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
  Pramble?: string;
  Parent?: string | number;
  Operator?: string;
  Value?: string | number;
}

export class StaticQuestion {
  /**
   * Upserts a static_questions translation record (one per question + language).
   */
  static async upsert(questionId: number, row: StaticQuestionRow): Promise<void> {
    await prisma.static_questions.upsert({
      where: {
        question_id_language_id: { question_id: questionId, language_id: row.Language_ID },
      },
      update: {
        cat_id: row.IRT_ItemCode,
        head: row.Scale || null,
        pramble: row.Pramble?.trim() || null,
        question: row.Items,
      },
      create: {
        question_id: questionId,
        language_id: row.Language_ID,
        cat_id: row.IRT_ItemCode,
        head: row.Scale || null,
        pramble: row.Pramble?.trim() || null,
        question: row.Items,
      },
    });
  }
}
