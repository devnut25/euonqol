import { zu } from '@/lib/zod/utils';
import { t } from 'i18next';
import { z } from 'zod';

export type FormFieldsCatItemBank =
  | z.infer<ReturnType<typeof zFormFieldsCatItemBankCreate>>
  | z.infer<ReturnType<typeof zFormFieldsCatItemBankEdit>>;

export const zFormFieldsCatItemBankCreate = () =>
  z.object({
    name: zu.fieldText.required({
      error: t('management:cat_item_banks.form.name_required'),
    }),
    description: zu.fieldText.optional(),
  });

export const zFormFieldsCatItemBankEdit = () =>
  z.object({
    name: zu.fieldText.required({
      error: t('management:cat_item_banks.form.name_required'),
    }),
    description: zu.fieldText.optional(),
    is_active: z.boolean().optional(),
  });
