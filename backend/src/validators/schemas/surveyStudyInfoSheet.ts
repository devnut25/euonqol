import { z } from 'zod';
import { zu } from '../utils.js';

export const consentQuestionSchema = z.object({
  question_text: zu.fieldText.required({ error: 'question_text is required' }),
});

// The admin form sends the sheet as multipart/form-data when a PDF is attached,
// in which case the list arrives JSON-encoded as a single string field.
export const consentQuestionsSchema = z.preprocess(
  (value) => {
    if (typeof value !== 'string') return value;
    try {
      return JSON.parse(value);
    } catch {
      return value;
    }
  },
  z
    .array(consentQuestionSchema, { error: 'consent_questions must be a list' })
    .min(1, 'At least one consent question is required')
);

export type ConsentQuestionInput = z.infer<typeof consentQuestionSchema>;
