import { zu } from '@/lib/zod/utils';
import { z } from 'zod';

export type FormFieldsCatApiSettings = z.infer<ReturnType<typeof zFormFieldsCatApiSettings>>;

export const zFormFieldsCatApiSettings = () =>
  z.object({
    apiUrl: zu.fieldText.required(),
    apiKey: zu.fieldText.optional(),
    apiKeyExpiresAt: zu.fieldText.optional(),
  });
