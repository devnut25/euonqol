import { zPdfField } from '@/features/schema/shared/pdf-field';
import { zu } from '@/lib/zod/utils';
import { t } from 'i18next';
import { z } from 'zod';

export const zPrivacyPolicy = () =>
  z.object({
    title: zu.fieldText.required({ error: t('privacyPolicies:form.title.required') }),
    content: zu.richText.required({ error: t('privacyPolicies:form.content.required') }),
    language_id: zu.fieldText.required({ error: t('privacyPolicies:form.language.required') }),
    // patient_type: z.enum(PATIENT_TYPES),
    pdf: zPdfField(),
    pdf_removed: z.boolean().optional(),
  });

export type PrivacyPolicy = z.infer<ReturnType<typeof zPrivacyPolicy>>;
