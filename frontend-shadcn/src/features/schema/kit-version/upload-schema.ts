import { EXCEL_MIME_TYPES, MAX_EXCEL_FILE_SIZE_MB } from '@/helpers/upload/excel';
import { zu } from '@/lib/zod/utils';
import { KitVersionTypeEnum } from '@/utils/enum';
import { t } from 'i18next';
import { z } from 'zod';

export const zKitVersionUpload = () =>
  z.object({
    name: zu.fieldText.required({
      error: t('management:common.name.required'),
    }),
    type: z.enum(
      [
        KitVersionTypeEnum.Static,
        KitVersionTypeEnum.Cat,
        KitVersionTypeEnum.SocioDemo,
        KitVersionTypeEnum.Feedback,
      ],
      {
        error: t('management:common.type.invalid'),
      }
    ),
    file: z
      .instanceof(File)
      .refine((f) => EXCEL_MIME_TYPES.includes(f.type), t('management:upload.file.invalid_type'))
      .refine(
        (f) => f.size <= MAX_EXCEL_FILE_SIZE_MB * 1024 * 1024,
        t('management:upload.file.too_large')
      ),
    auto_create_modules: z.boolean().default(true),
    cat_item_bank_id: z.coerce.number().int().optional(),
  }).superRefine((data, ctx) => {
    if (data.type === KitVersionTypeEnum.Cat && !data.cat_item_bank_id) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: t('management:upload.catItemBankRequired', 'CAT item bank is required for dynamic kit versions'),
        path: ['cat_item_bank_id'],
      });
    }
  });

export type KitVersionUpload = z.input<ReturnType<typeof zKitVersionUpload>>;
