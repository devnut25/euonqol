import { z } from 'zod';
import { zu } from '../utils.js';

export const createEmailTemplateSchema = z.object({
  language_id: z.coerce.number().int().positive({ message: 'Language is required' }),
  subject: zu.fieldText.required(),
  body: zu.fieldText.required(),
  is_fallback: z.coerce.boolean().optional().default(false),
});

export const updateEmailTemplateSchema = z
  .object({
    subject: zu.fieldText.optional(),
    body: zu.fieldText.optional(),
    is_fallback: z.coerce.boolean().optional(),
  })
  .refine((d) => d.subject !== undefined || d.body !== undefined || d.is_fallback !== undefined, {
    message: 'At least one of subject, body or is_fallback must be provided',
  });

export type CreateEmailTemplateInput = z.infer<typeof createEmailTemplateSchema>;
export type UpdateEmailTemplateInput = z.infer<typeof updateEmailTemplateSchema>;
