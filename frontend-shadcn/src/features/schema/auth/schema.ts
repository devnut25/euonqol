import { zu } from '@/lib/zod/utils';
import { z } from 'zod';
import { t } from 'i18next';

export type FormFieldsLogin = z.infer<ReturnType<typeof zFormFieldsLogin>>;
export const zFormFieldsLogin = () =>
  z.object({
    email: zu.fieldText.required().pipe(
      z.email({
        error: (issue) =>
          issue.input
            ? t('auth:common.email.invalid')
            : t('auth:common.email.required'),
      })
    ),
    password: zu.fieldText.required().pipe(
        z.string().min(8, t('auth:common.password.invalidLength'))
      ),
  });

export type FormFieldsResetPassword = z.infer<ReturnType<typeof zFormFieldsResetPassword>>;
export const zFormFieldsResetPassword = () =>
  z.object({
    email: zu.fieldText.required().pipe(
      z.email({
        error: (issue) =>
          issue.input
            ? t('auth:common.email.invalid')
            : t('auth:common.email.required'),
      })
    ),
  });

export type FormFieldsFirstAccess = z.infer<ReturnType<typeof zFormFieldsFirstAccess>>;
export const zFormFieldsFirstAccess = () =>
  z.object({
    email: zu.fieldText.required().pipe(
      z.email({
        error: (issue) =>
          issue.input
            ? t('auth:common.email.invalid')
            : t('auth:common.email.required'),
      })
    ),
    newPassword: zu.fieldText.required().pipe(
        z.string().min(8, t('auth:common.password.invalidLength'))
      ),
    confirmPassword: zu.fieldText.required().pipe(
        z.string().min(8, t('auth:common.confirmPassword.invalidLength'))
      ),
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    message: t('auth:common.confirmPassword.doNotMatch'),
    path: ["confirmPassword"],
  });

export type Otp = z.infer<ReturnType<typeof zOtp>>;
export const zOtp = () =>
  z.string({
    error: t('auth:common.otp.required'),
  })
  .length(6, t('auth:common.otp.invalidLength'));

export type FormFieldsLoginVerify = z.infer<ReturnType<typeof zFormFieldsLoginVerify>>;
export const zFormFieldsLoginVerify = () =>
  z.object({
    otp: zOtp(),
  });

