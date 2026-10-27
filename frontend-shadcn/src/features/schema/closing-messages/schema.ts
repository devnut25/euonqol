import { zu } from '@/lib/zod/utils';
import { t } from 'i18next';
import { z } from 'zod';

export const zClosingMessage = () =>
  z.object({
    content: zu.richText.required({ error: t('closingMessages:form.content.required') }),
    language_id: zu.fieldText.required({ error: t('closingMessages:form.language.required') }),
    link_used_message: zu.richText.required({
      error: t('closingMessages:form.link_used_message.required'),
    }),
    survey_closed_message: zu.richText.required({
      error: t('closingMessages:form.survey_closed_message.required'),
    }),
  });

export type ClosingMessage = z.infer<ReturnType<typeof zClosingMessage>>;
