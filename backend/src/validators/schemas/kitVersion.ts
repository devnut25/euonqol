import { KitVersionTypeEnum } from '@/config/enums.js';
import { z } from 'zod';
import { zu } from '../utils.js';

export const createKitVersionSchema = z.object({
  name: zu.fieldText.required().pipe(z.string().max(120, 'Name must be 120 characters or less')),
  is_active: z.boolean().optional().default(true),
  question_kind: z.enum(
    [
      KitVersionTypeEnum.STATIC,
      KitVersionTypeEnum.CAT,
      KitVersionTypeEnum.SOCIO_DEMO,
      KitVersionTypeEnum.FEEDBACK,
    ],
    {
      error: 'question_kind must be "static", "cat", "socio-demo", or "feedback"',
    }
  ),
  fileContent: zu.fieldText.required(), // base64-encoded Excel file
  fileName: zu.fieldText.required(),
  auto_create_modules: z.boolean().optional().default(true),
  cat_item_bank_id: z.number().int().optional(),
}).superRefine((data, ctx) => {
  if (data.question_kind === KitVersionTypeEnum.CAT && !data.cat_item_bank_id) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'cat_item_bank_id is required for CAT (dynamic) kit versions',
      path: ['cat_item_bank_id'],
    });
  }
});

export const updateKitVersionSchema = z.object({
  is_active: z.boolean(),
});

export type CreateKitVersionInput = z.infer<typeof createKitVersionSchema>;
export type UpdateKitVersionInput = z.infer<typeof updateKitVersionSchema>;
