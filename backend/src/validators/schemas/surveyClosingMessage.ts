import { z } from 'zod';
import { zu } from '../utils.js';

// Rich-text editor submits "<p></p>" (or whitespace-only markup) for an empty field.
const isEmptyHtml = (html: string) =>
  html.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').trim() === '';

// Every message is required: the public page has no built-in text to fall back on.
const requiredRichText = (field: string) =>
  zu.fieldText
    .required()
    .refine((v) => !isEmptyHtml(v), { message: `${field} is required` });

export const upsertClosingMessageSchema = z.object({
  language_id: z.coerce.number().int().positive(),
  content: requiredRichText('content'),
  link_used_message: requiredRichText('link_used_message'),
  survey_closed_message: requiredRichText('survey_closed_message'),
  is_fallback: z.coerce.boolean().optional(),
});

export type UpsertClosingMessageInput = z.infer<typeof upsertClosingMessageSchema>;
