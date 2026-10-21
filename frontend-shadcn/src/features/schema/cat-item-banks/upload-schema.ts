import { EXCEL_MIME_TYPES, MAX_EXCEL_FILE_SIZE_MB } from '@/helpers/upload/excel';
import { zu } from '@/lib/zod/utils';
import { t } from 'i18next';
import { z } from 'zod';

// Create-only: create the bank and import its content in one submit, file
// required (no "upload later") — mirrors kit-version/upload-schema.ts.
export const zCatItemBankUpload = () =>
  z.object({
    name: zu.fieldText.required({
      error: t('management:cat_item_banks.form.name_required'),
    }),
    description: zu.fieldText.optional(),
    file: z
      .instanceof(File)
      .refine((f) => EXCEL_MIME_TYPES.includes(f.type), t('management:upload.file.invalid_type'))
      .refine(
        (f) => f.size <= MAX_EXCEL_FILE_SIZE_MB * 1024 * 1024,
        t('management:upload.file.too_large')
      ),
  });

export type CatItemBankUpload = z.input<ReturnType<typeof zCatItemBankUpload>>;
