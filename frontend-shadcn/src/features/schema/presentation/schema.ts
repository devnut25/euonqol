import { zPdfField } from '@/features/schema/shared/pdf-field';
import { zu } from '@/lib/zod/utils';
import { t } from 'i18next';
import { z } from 'zod';

export const zPresentation = () =>
  z.object({
    title: zu.fieldText.required({ error: t('presentation:form.title.required') }),
    content: zu.richText.required({ error: t('presentation:form.content.required') }),
    language_id: zu.fieldText.required({ error: t('presentation:form.language.required') }),
    pdf: zPdfField(),
    pdf_removed: z.boolean().optional(),
  });

export type Presentation = z.infer<ReturnType<typeof zPresentation>>;
