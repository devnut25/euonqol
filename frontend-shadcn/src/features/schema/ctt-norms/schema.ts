import { t } from 'i18next';
import { z } from 'zod';

// `{ error }` sul tipo copre anche il campo mai toccato (undefined): senza, zod mostra
// il messaggio di default "Invalid input: expected string, received undefined".
const zCttNormEntry = () =>
  z.object({
    name: z
      .string({ error: t('settings:ctt_norms.form.scale_name_required') })
      .min(1, t('settings:ctt_norms.form.scale_name_required'))
      .max(100),
    scaleCode: z
      .string({ error: t('settings:ctt_norms.form.scale_code_required') })
      .min(1, t('settings:ctt_norms.form.scale_code_required'))
      .max(50),
    average: z.number({ error: t('settings:ctt_norms.form.average_required') }),
    sd: z
      .number({ error: t('settings:ctt_norms.form.sd_required') })
      .positive(t('settings:ctt_norms.form.sd_positive')),
  });

export type CttNormsVersionFields = z.infer<ReturnType<typeof zCttNormsVersion>>;
export const zCttNormsVersion = () =>
  z.object({
    name: z
      .string({ error: t('settings:ctt_norms.form.name_required') })
      .trim()
      .min(1, t('settings:ctt_norms.form.name_required'))
      .max(100),
    description: z.string().optional().nullable(),
    is_active: z.boolean({ error: t('settings:ctt_norms.form.is_active_required') }),
    norms: z
      .array(zCttNormEntry())
      .min(1, t('settings:ctt_norms.form.norms_min'))
      .superRefine((entries, ctx) => {
        const seen = new Set<string>();
        entries.forEach((entry, index) => {
          if (seen.has(entry.scaleCode)) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              path: [index, 'scaleCode'],
              message: t('settings:ctt_norms.form.scale_code_duplicate'),
            });
          }
          seen.add(entry.scaleCode);
        });
      }),
  });
