import { zu } from '@/lib/zod/utils';
import { t } from 'i18next';
import { z } from 'zod';

export type FormFieldsCatSetting =
  | z.infer<ReturnType<typeof zFormFieldsCatSettingCreate>>
  | z.infer<ReturnType<typeof zFormFieldsCatSettingEdit>>;

export const zFormFieldsCatSettingCreate = () =>
  z.object({
    name: zu.fieldText.required({
      error: t('management:cat_settings.form.name_required'),
    }),
    description: zu.fieldText.optional(),
    setting_key: zu.fieldText.required({
      error: t('management:cat_settings.form.setting_key_required'),
    }),
    api_configuration: z.any().optional().nullable(),
  });

export const zFormFieldsCatSettingEdit = () =>
  z.object({
    name: zu.fieldText.required({
      error: t('management:cat_settings.form.name_required'),
    }),
    description: zu.fieldText.optional(),
  });
