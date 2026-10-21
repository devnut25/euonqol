import { zu } from '@/lib/zod/utils';
import { t } from 'i18next';
import { z } from 'zod';

export const zPatient = () =>
  z.object({
    // id: z.union([z.string(), z.number()]).optional(),
    patient_id: z.string().min(1, 'Patient ID is required').max(255),
    mail: zu.fieldText.required().pipe(
      z.email({
        error: (issue) =>
          issue.input ? t('auth:common.email.invalid') : t('auth:common.email.required'),
      })
    ),
    // phone_prefix: z.string().max(10).optional().nullable(),
    // phone: z.string().max(30).optional().nullable(),
    // is_active: z.union([z.boolean(), z.string()]).optional(),
  });

export type Patient = z.infer<ReturnType<typeof zPatient>>;
