import { zPdfField } from '@/features/schema/shared/pdf-field';
import { zu } from '@/lib/zod/utils';
import { t } from 'i18next';
import { z } from 'zod';

export const zStudyInfoSheet = () =>
  z
    .object({
      title: zu.fieldText.required({ error: t('studyInfoSheet:form.title.required') }),
      content: zu.richText.required({ error: t('studyInfoSheet:form.content.required') }),
      rejection_message: zu.fieldText.optional(),
      consent_questions: z
        .array(
          z.object({
            question_text: zu.fieldText.required({
              error: t('studyInfoSheet:form.consent_questions.question_text.required'),
            }),
          })
        ),
      language_id: zu.fieldText.required({ error: t('studyInfoSheet:form.language.required') }),
      pdf: zPdfField(),
      pdf_removed: z.boolean().optional(),
    })
    // Consent questions are optional; the rejection message is only shown when the
    // patient declines one, so it is required only when at least one question exists.
    .superRefine((data, ctx) => {
      if (data.consent_questions.length > 0 && !data.rejection_message) {
        ctx.addIssue({
          code: 'custom',
          path: ['rejection_message'],
          message: t('studyInfoSheet:form.rejection_message.required'),
        });
      }
    });

export type StudyInfoSheet = z.infer<ReturnType<typeof zStudyInfoSheet>>;
