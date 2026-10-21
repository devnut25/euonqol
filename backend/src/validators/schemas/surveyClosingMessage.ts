import { z } from 'zod';
import { zu } from '../utils.js';

// Rich-text editor submits "<p></p>" (or whitespace-only markup) for an empty field.
const isEmptyHtml = (html: string) =>
  html.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').trim() === '';

// Empty optional message → null, so the public page falls back to the default text.
const optionalRichText = z
  .string()
  .nullish()
  .transform((v) => (v == null || isEmptyHtml(v) ? null : v.trim()));

export const upsertClosingMessageSchema = z.object({
  language_id: z.coerce.number().int().positive(),
  content: zu.fieldText
    .required()
    .refine((v) => !isEmptyHtml(v), { message: 'content is required' }),
  link_used_message: optionalRichText,
  survey_closed_message: optionalRichText,
  resume_message: optionalRichText,
  is_fallback: z.coerce.boolean().optional(),
});

export type UpsertClosingMessageInput = z.infer<typeof upsertClosingMessageSchema>;
