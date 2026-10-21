import { zu } from '@/lib/zod/utils';
import { t } from 'i18next';
import { z } from 'zod';

export const zQuestionnaire = () =>
  z
    .object({
      id: z.union([z.string(), z.number()]).optional(),
      title: zu.fieldText.required({ error: t('questionnaire:form.title.required') }),
      description: z.string().optional().nullable(),
      patient_group_id: zu.fieldText.required({
        error: t('questionnaire:form.patient_group.required'),
      }),
      type: z.enum(['static', 'dynamic']).optional(),
      status: z.enum(['draft', 'public', 'disabled', 'completed']).optional(),
      modules: z
        .array(
          z.object({
            moduleId: z
              .string()
              .nullable()
              .transform((v) => (v && v.trim() !== '' ? v.trim() : null))
              .refine((v): boolean => v !== null, {
                error: t('questionnaire:form.select_module.required'),
              }),
            type: z.string().optional(),
            // UI-only fallback label for modules disabled after being added — never sent to the API.
            name: z.string().optional(),
          })
        )
        .min(1, t('questionnaire:form.modules_section.required')),
      has_static_module: z.boolean().optional(),
      hasKitModule: z.boolean().optional(),
      ctt_norms_version_id: z.union([z.string(), z.number()]).optional().nullable(),
      max_completions: z.union([z.number(), z.string()]).optional().nullable(),
    })
    .superRefine((data, ctx) => {
      if (!data.hasKitModule) {
        ctx.addIssue({
          code: 'custom',
          message: t('questionnaire:form.kit_module_required'),
          path: ['modules'],
        });
      }
      if (data.has_static_module && !data.ctt_norms_version_id) {
        ctx.addIssue({
          code: 'custom',
          message: t('questionnaire:form.ctt_norms_version.required'),
          path: ['ctt_norms_version_id'],
        });
      }
    });

export type Questionnaire = z.infer<ReturnType<typeof zQuestionnaire>>;
