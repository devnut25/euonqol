import { t } from 'i18next';
import { z } from 'zod';
import { zu } from '../utils';

const baseUserSchema = z.object({
  first_name: zu.fieldText.required({
    error: t('users:common.first_name.required'),
  }),
  last_name: zu.fieldText.required({
    error: t('users:common.last_name.required'),
  }),
  email: zu.fieldText
    .required({ error: t('users:common.email.required') })
    .pipe(
      z.email({
        message: t('users:common.email.invalid'),
      })
    ),
  user_type: zu.fieldText.required({
    error: t('users:common.user_type.required'),
  }),
  is_active: z.boolean({
    error: t('users:common.is_active.required'),
  }),
});

// Regola unicità email per CREATE
const emailUniqueCreateRule = zu.uniqueEmail();

export const createUserSchema = baseUserSchema
  .extend({
    password: zu.fieldText.required({
      error: t('users:common.password.required'),
    }),
  })
  .refine(
    emailUniqueCreateRule.validator,
    {
      message: emailUniqueCreateRule.message,
      path: emailUniqueCreateRule.path,
    }
  );

// Factory per UPDATE (con userId da escludere)
export const updateUserSchema = (userId: string) => {
  const emailUniqueUpdateRule = zu.uniqueEmail({ excludeUserId: userId });
  
  return baseUserSchema
    .extend({
      password: zu.fieldText.optional(),
    })
    .refine(
      emailUniqueUpdateRule.validator,
      {
        message: emailUniqueUpdateRule.message,
        path: emailUniqueUpdateRule.path,
      }
    );
};

export type CreateUserInput = z.infer<typeof createUserSchema>;
export type UpdateUserInput = z.infer<ReturnType<typeof updateUserSchema>>;