import { t } from 'i18next';
import { z } from 'zod';

export type LanguageFields = z.infer<ReturnType<typeof zLanguage>>;
export const zLanguage = () =>
  z.object({
    // Optional: the empty number field is null, the system then assigns the next free id
    id: z
      .number({ error: t('settings:languages.form.id_invalid') })
      .int(t('settings:languages.form.id_invalid'))
      .positive(t('settings:languages.form.id_invalid'))
      .nullish(),
    language: z
      .string({ error: t('settings:languages.form.language_required') })
      .trim()
      .min(1, t('settings:languages.form.language_required'))
      .max(45, t('settings:languages.form.max_length')),
    original_lang: z
      .string({ error: t('settings:languages.form.original_lang_required') })
      .trim()
      .min(1, t('settings:languages.form.original_lang_required'))
      .max(45, t('settings:languages.form.max_length')),
    alphabet: z
      .string({ error: t('settings:languages.form.alphabet_required') })
      .trim()
      .min(1, t('settings:languages.form.alphabet_required'))
      .max(45, t('settings:languages.form.max_length')),
  });
