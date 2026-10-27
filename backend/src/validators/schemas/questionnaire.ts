import { z } from 'zod';
import { zu } from '../utils.js';

const modulePayloadSchema = z.object({
  moduleId: z.coerce.number().int().positive(),
  position: z.coerce.number().int().optional(),
});

export const createQuestionnaireSchema = z.object({
  title: zu.fieldText.required(),
  description: z.string().nullish(),
  patient_group_id: z.coerce.number().int().positive({
    message: 'Patient group ID is required',
  }),
  // Ignored: the service derives the type from the selected kit module.
  type: z.enum(['static', 'dynamic']).optional(),
  ctt_norms_version_id: z.coerce.number().int().positive().nullish(),
  max_completions: z.coerce.number().int().min(1, 'max_completions must be at least 1').nullish(),
  modules: z
    .array(modulePayloadSchema)
    .min(1, 'A questionnaire must include at least one kit module (static or dynamic)'),
});

export const updateQuestionnaireSchema = z.object({
  title: zu.fieldText.optional(),
  description: z.string().nullish(),
  status: z.enum(['draft', 'public', 'disabled', 'completed']).optional(),
  patient_group_id: z.coerce.number().int().positive().optional(),
  ctt_norms_version_id: z.coerce.number().int().positive().nullish(),
  max_completions: z.coerce.number().int().min(1, 'max_completions must be at least 1').nullish(),
  modules: z
    .array(modulePayloadSchema)
    .min(1, 'A questionnaire must include at least one kit module (static or dynamic)')
    .optional(),
});

export type CreateQuestionnaireInput = z.infer<typeof createQuestionnaireSchema>;
export type UpdateQuestionnaireInput = z.infer<typeof updateQuestionnaireSchema>;
