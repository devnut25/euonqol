import { z } from 'zod';

const text = z.string().trim().min(1).max(45);

export const createLanguageSchema = z.object({
  // Optional: when missing the next free id is assigned by the database
  id: z.preprocess(
    (v) => (v === '' || v === null ? undefined : v),
    z.coerce.number().int().positive().optional()
  ),
  language: text,
  original_lang: text,
  alphabet: text,
});

export type CreateLanguageInput = z.infer<typeof createLanguageSchema>;
