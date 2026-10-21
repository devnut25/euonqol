import { zu } from '@/lib/zod/utils';
import { t } from 'i18next';
import { z } from 'zod';

export type User = z.infer<ReturnType<typeof zUser>>;
export const zUser = () =>
  z.object({
    full_name: zu.fieldText.required(),
    email: zu.fieldText.required().pipe(
      z.email({
        error: (issue) =>
          issue.input
            ? t('auth:common.email.invalid')
            : t('auth:common.email.required'),
      })
    ),
  });


export type FormFieldsUser = 
  | z.infer<ReturnType<typeof zFormFieldsUserCreate>>
  | z.infer<ReturnType<typeof zFormFieldsUserEdit>>;

// Schema per la creazione di un utente (password obbligatoria)
export const zFormFieldsUserCreate = () =>
  z.object({
    first_name: zu.fieldText.required({
      error: t('users:common.first_name.required'),
    }),
    last_name: zu.fieldText.required({
      error: t('users:common.last_name.required'),
    }),
    email: zu.fieldText.required().pipe(
      z.email({
        error: (issue) =>
          issue.input
            ? t('users:common.email.invalid')
            : t('users:common.email.required'),
      })
    ),
    password: zu.fieldText.required({
      error: t('users:common.password.required'),
    }),
    user_type: zu.fieldText.required({
      error: t('users:common.user_type.required'),
    }),
    is_active: z.boolean({
      error: t('users:common.is_active.required'),
    }),
  });

// Schema per la modifica di un utente (password opzionale)
export const zFormFieldsUserEdit = () =>
  z.object({
    first_name: zu.fieldText.required({
      error: t('users:common.first_name.required'),
    }),
    last_name: zu.fieldText.required({
      error: t('users:common.last_name.required'),
    }),
    email: zu.fieldText.required().pipe(
      z.email({
        error: (issue) =>
          issue.input
            ? t('users:common.email.invalid')
            : t('users:common.email.required'),
      })
    ),
    password: zu.fieldText.optional(),
    user_type: zu.fieldText.required({
      error: t('users:common.user_type.required'),
    }),
    is_active: z.boolean({
      error: t('users:common.is_active.required'),
    }),
  });

// Schema generico (per compatibilità con il codice esistente)
export const zFormFieldsUser = () => zFormFieldsUserCreate();
