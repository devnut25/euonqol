import { zPdfField } from '@/features/schema/shared/pdf-field';
import { zu } from '@/lib/zod/utils';
import { t } from 'i18next';
import { z } from 'zod';

export const zStudyInfoSheet = () =>
  z.object({
    title: zu.fieldText.required({ error: t('studyInfoSheet:form.title.required') }),
    content: zu.richText.required({ error: t('studyInfoSheet:form.content.required') }),
    rejection_message: zu.fieldText.required({
      error: t('studyInfoSheet:form.rejection_message.required'),
    }),
    consent_questions: z
      .array(
        z.object({
          question_text: zu.fieldText.required({
            error: t('studyInfoSheet:form.consent_questions.question_text.required'),
          }),
        })
      )
      .min(1, { error: t('studyInfoSheet:form.consent_questions.required') }),
    language_id: zu.fieldText.required({ error: t('studyInfoSheet:form.language.required') }),
    pdf: zPdfField(),
    pdf_removed: z.boolean().optional(),
  });

export type StudyInfoSheet = z.infer<ReturnType<typeof zStudyInfoSheet>>;
