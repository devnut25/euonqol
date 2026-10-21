import { z } from 'zod';
import { zu } from '../utils.js';

export const createCatItemBankSchema = z.object({
  name: zu.fieldText.required(),
  description: zu.fieldText.optional(),
  fileContent: zu.fieldText.required(), // base64-encoded Excel file
  fileName: zu.fieldText.required(),
});

export type CreateCatItemBankInput = z.infer<typeof createCatItemBankSchema>;
