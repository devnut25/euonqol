import { PrismaClient } from '../generated/app/index.js';
import { parseAnswerBounds } from '../helpers/numericAnswerBounds.js';

const prisma = new PrismaClient();

export interface FeedbackQuestionRow {
  Question_ID: string;
  Language: string;
  Language_ID: number;
  Question_Text: string;
  Type?: string;
  Question_Order?: number;
  IsMandatory?: string;
  Parent?: string | number;
  Operator?: string;
  Value?: string | number;
}

export interface FeedbackAnswerRow {
  ID: number;
  Question_ID: string;
  Language: string;
  Language_ID: number;
  Order: number;
  Type: string;
  Text: string;
  /** Optional bounds of an Integer / Number free-input answer (ignored for other types). */
  Min?: string | number | null;
  Max?: string | number | null;
}

export class FeedbackQuestion {
  /**
   * Upserts a feedback_question_translations record (one per question + language).
   */
  static async upsert(questionId: number, row: FeedbackQuestionRow): Promise<void> {
    await prisma.feedback_question_translations.upsert({
      where: {
        question_id_language_id: {
          question_id: questionId,
          language_id: row.Language_ID,
        },
      },
      update: {
        question_text: row.Question_Text || null,
      },
      create: {
        question_id: questionId,
        language_id: row.Language_ID,
        question_text: row.Question_Text || null,
      },
    });
  }

  /**
   * Upserts a feedback_answers record (one per question + language + display_order).
   */
  static async upsertAnswer(questionId: number, row: FeedbackAnswerRow): Promise<void> {
    const existing = await prisma.feedback_answers.findFirst({
      where: { question_id: questionId, language_id: row.Language_ID, display_order: row.Order },
      select: { id: true },
    });

    if (existing) {
      await prisma.feedback_answers.update({
        where: { id: existing.id },
        data: {
          answer_text: String(row.Text ?? '').trim(),
          answer_type: row.Type,
          display_order: row.Order,
          ...parseAnswerBounds(row),
        },
      });
    } else {
      await prisma.feedback_answers.create({
        data: {
          question_id: questionId,
          language_id: row.Language_ID,
          answer_text: String(row.Text ?? '').trim(),
          answer_type: row.Type,
          display_order: row.Order,
          ...parseAnswerBounds(row),
        },
      });
    }
  }
}
