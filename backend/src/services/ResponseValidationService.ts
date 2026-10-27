import { prisma } from '../config/database.js';
import { ServiceError } from '../helpers/ServiceError.js';

export interface NumericResponseInput {
  question_id: number;
  language_id: number;
  answer_text?: string | null;
}

type Bounds = { min_value: number | null; max_value: number | null };

function parseNumericAnswer(text: string | null | undefined): number | null {
  if (text === undefined || text === null || text.trim() === '') return null;
  const num = Number(text.trim());
  return Number.isFinite(num) ? num : null;
}

export class ResponseValidationService {
  /**
   * Rejects numeric free-input answers (socio-demo 'Integer', feedback 'Number') that
   * fall outside the min_value/max_value bounds set by the kit upload's "Answers" sheet.
   * Non-numeric answer_text (e.g. skip markers) is ignored — it isn't a numeric answer.
   * Throws ServiceError(422) on the first out-of-range answer.
   */
  static async assertNumericAnswersInRange(responses: NumericResponseInput[]): Promise<void> {
    const numeric = responses
      .map((r) => ({ ...r, value: parseNumericAnswer(r.answer_text) }))
      .filter((r): r is NumericResponseInput & { value: number } => r.value !== null);
    if (numeric.length === 0) return;

    const questionIds = [...new Set(numeric.map((r) => r.question_id))];
    // Only numeric answer rows ever carry bounds (see helpers/numericAnswerBounds.ts)
    const where = {
      question_id: { in: questionIds },
      OR: [{ min_value: { not: null } }, { max_value: { not: null } }],
    };
    const select = { question_id: true, language_id: true, min_value: true, max_value: true };
    const [socioDemo, feedback] = await Promise.all([
      prisma.socio_demo_answers.findMany({ where, select }),
      prisma.feedback_answers.findMany({ where, select }),
    ]);

    const boundsByKey = new Map<string, Bounds>();
    for (const row of [...socioDemo, ...feedback]) {
      boundsByKey.set(`${row.question_id}:${row.language_id}`, row);
    }

    for (const r of numeric) {
      const bounds = boundsByKey.get(`${r.question_id}:${r.language_id}`);
      if (!bounds) continue;
      const { min_value: min, max_value: max } = bounds;
      if ((min !== null && r.value < min) || (max !== null && r.value > max)) {
        const range =
          min !== null && max !== null
            ? `between ${min} and ${max}`
            : min !== null
              ? `at least ${min}`
              : `at most ${max}`;
        throw new ServiceError(
          `Answer for question ${r.question_id} must be ${range}`,
          422,
          'answer_text'
        );
      }
    }
  }
}
