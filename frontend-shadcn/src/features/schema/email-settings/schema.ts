import { EmailProviderEnum } from '@/utils/enum';
import { zu } from '@/lib/zod/utils';
import { z } from 'zod';

export type FormFieldsEmailSettings = z.infer<ReturnType<typeof zFormFieldsEmailSettings>>;

export const zFormFieldsEmailSettings = (opts?: { hasResendApiKey?: boolean }) =>
  z
    .object({
      provider: zu.fieldText.required(),
      from: zu.fieldText.required(),
      host: zu.fieldText.optional(),
      port: zu.fieldText
        .optional()
        .refine((value) => !value || (Number.isInteger(Number(value)) && Number(value) >= 1 && Number(value) <= 65535), {
          error: 'Port must be a number between 1 and 65535',
        }),
      secure: zu.fieldText.optional(),
      user: zu.fieldText.optional(),
      password: zu.fieldText.optional(),
      resendApiKey: zu.fieldText.optional(),
    })
    .superRefine((data, ctx) => {
      if (data.provider === EmailProviderEnum.Resend) {
        if (!data.resendApiKey && !opts?.hasResendApiKey) {
          ctx.addIssue({ code: 'custom', path: ['resendApiKey'], message: 'Resend API Key is required' });
        }
      } else if (data.provider === EmailProviderEnum.Smtp && !data.host) {
        ctx.addIssue({ code: 'custom', path: ['host'], message: 'SMTP Host is required' });
      }
    });
