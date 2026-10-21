import { zu } from '@/lib/zod/utils';
import { t } from 'i18next';
import { z } from 'zod';

const eligibilityBaseObject = () =>
  z.object({
    language_id: zu.fieldText.required({
      error: t('eligibility:language_manager.errors.language_required'),
    }),
    is_fallback: z.boolean().optional(),
  });

const zQuestionRow = () =>
  z.object({
    expected_answer: z.enum(['yes', 'no'], {
      error: t('eligibility:form.expected_answer.required'),
    }),
    question_text: zu.fieldText.required({
      error: t('eligibility:form.question_text.required'),
    }),
    disqualification_message: zu.fieldText.nullish(),
  });

const zTranslationRow = () =>
  z.object({
    question_id: z.number(),
    question_text: zu.fieldText.required({
      error: t('eligibility:form.question_text.required'),
    }),
    disqualification_message: zu.fieldText.nullish(),
  });

export const zEligibilityBootstrap = () =>
  eligibilityBaseObject().extend({
    questions: z.array(zQuestionRow()).min(1),
  });

export type EligibilityBootstrap = z.infer<ReturnType<typeof zEligibilityBootstrap>>;

export const zEligibilityLanguageQuestions = () =>
  eligibilityBaseObject().extend({
    translations: z.array(zTranslationRow()).min(1),
  });

export type EligibilityLanguageQuestions = z.infer<
  ReturnType<typeof zEligibilityLanguageQuestions>
>;

// Unified shape both eligibility form variants render against, mirroring how
// survey/schema.ts's `Survey` type is shared across create/edit forms —
// keeps `Control<EligibilityFormValues>` consistent across the shared field
// components regardless of which resolver (bootstrap vs language-questions)
// is active.
const eligibilityFormObject = () =>
  eligibilityBaseObject().extend({
    questions: z.array(zQuestionRow()).optional(),
    translations: z.array(zTranslationRow()).optional(),
  });

export type EligibilityFormValues = z.input<ReturnType<typeof eligibilityFormObject>>;
