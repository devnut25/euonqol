import { zu } from '@/lib/zod/utils';
import { t } from 'i18next';
import { z } from 'zod';

export const zEmailTemplate = () =>
  z.object({
    language_id: zu.fieldText.required({ error: t('emailTemplates:form.language.required') }),
    subject: zu.fieldText
      .required({ error: t('emailTemplates:form.subject.required') })
      .pipe(z.string().max(255)),
    body: zu.richText.required({ error: t('emailTemplates:form.body.required') }),
  });

export type EmailTemplateFormValues = z.infer<ReturnType<typeof zEmailTemplate>>;

export interface EmailTemplate {
  id: number;
  survey_questionnaire_id: number;
  language_id: number;
  subject: string;
  body: string;
  is_fallback: boolean;
  language: { id: number; language: string; original_lang: string };
}
