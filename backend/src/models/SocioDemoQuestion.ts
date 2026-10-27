import { prisma } from '../config/database.js';
import { parseAnswerBounds } from '../helpers/numericAnswerBounds.js';

export interface SocioDemoQuestionRow {
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

export interface SocioDemoAnswerRow {
  ID: number;
  Question_ID: string;
  Language: string;
  Language_ID: number;
  Order: number;
  Type: string; // free-form, e.g. 'Radio Button', 'Radio Button+Text', 'Checkbox', 'Text', 'Number'
  Text: string;
  /** Optional bounds of an Integer / Number free-input answer (ignored for other types). */
  Min?: string | number | null;
  Max?: string | number | null;
}

export class SocioDemoQuestion {
  /**
   * Upserts a socio_demo_questions translation record (one per question + language).
   */
  static async upsert(questionId: number, row: SocioDemoQuestionRow): Promise<void> {
    await prisma.socio_demo_questions.upsert({
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
   * Upserts a socio_demo_answers record (one per question + language + display_order).
   * Uses findFirst + update/create since no composite unique constraint exists on the table.
   */
  static async upsertAnswer(questionId: number, row: SocioDemoAnswerRow): Promise<void> {
    const existing = await prisma.socio_demo_answers.findFirst({
      where: { question_id: questionId, language_id: row.Language_ID, display_order: row.Order },
      select: { id: true },
    });

    if (existing) {
      await prisma.socio_demo_answers.update({
        where: { id: existing.id },
        data: {
          answer_text: String(row.Text ?? '').trim(),
          answer_type: row.Type,
          display_order: row.Order,
          ...parseAnswerBounds(row),
        },
      });
    } else {
      await prisma.socio_demo_answers.create({
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
