import { z } from 'zod';
import { zu } from '../utils.js';

export const eligibilityTranslationSchema = z.object({
  language_id: z.coerce.number().int().positive(),
  question_text: zu.fieldText.required().pipe(z.string().max(500, 'question_text must be 500 characters or less')),
  disqualification_message: zu.fieldText.required(),
  is_fallback: z.coerce.boolean().optional(),
});

export const createEligibilityQuestionSchema = z.object({
  expected_answer: z.enum(['yes', 'no']).optional().default('yes'),
  order_position: z.coerce.number().int().optional(),
  translations: z.array(eligibilityTranslationSchema).min(1, 'At least one translation is required'),
});

export const updateEligibilityQuestionSchema = z.object({
  expected_answer: z.enum(['yes', 'no']).optional(),
  order_position: z.coerce.number().int().optional(),
  translations: z.array(eligibilityTranslationSchema).optional(),
});

export const reorderEligibilitySchema = z.object({
  order: z
    .array(
      z.object({
        id: z.coerce.number().int(),
        order_position: z.coerce.number().int(),
      })
    )
    .min(1, 'order array is required'),
});

export const setLanguageFallbackSchema = z.object({
  language_id: z.coerce.number().int(),
});

export const upsertEligibilityTranslationsSchema = z.object({
  is_fallback: z.coerce.boolean().optional(),
  translations: z
    .array(
      z.object({
        question_id: z.coerce.number().int(),
        question_text: zu.fieldText
          .required()
          .pipe(z.string().max(500, 'question_text must be 500 characters or less')),
        disqualification_message: zu.fieldText.required(),
      })
    )
    .min(1, 'translations array is required'),
});

export type CreateEligibilityQuestionInput = z.infer<typeof createEligibilityQuestionSchema>;
export type UpdateEligibilityQuestionInput = z.infer<typeof updateEligibilityQuestionSchema>;
export type ReorderEligibilityInput = z.infer<typeof reorderEligibilitySchema>;
export type SetLanguageFallbackInput = z.infer<typeof setLanguageFallbackSchema>;
export type UpsertEligibilityTranslationsInput = z.infer<typeof upsertEligibilityTranslationsSchema>;
