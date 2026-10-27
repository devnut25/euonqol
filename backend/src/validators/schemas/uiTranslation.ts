import { z } from 'zod';

export const saveUiTranslationSchema = z.object({
  language_id: z.coerce.number().int().positive(),
  // Empty/null → row removed, the public page falls back to English
  value: z.string().max(2000).nullish().transform((v) => v?.trim() || null),
});

export type SaveUiTranslationInput = z.infer<typeof saveUiTranslationSchema>;
