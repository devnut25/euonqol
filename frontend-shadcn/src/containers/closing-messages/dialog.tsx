import DevnutSection from '@/components/DevnutSection';
import DevnutTypography from '@/components/DevnutTypography';
import { useTranslation } from 'react-i18next';
import { ClosingMessageForm } from './form';
import type { ClosingMessageRow } from './utils/types';

interface ClosingMessageDialogProps {
  url: string;
  editing?: ClosingMessageRow;
  excludeLanguageIds: number[];
  onClose: () => void;
  onSuccess: () => void;
}

export const ClosingMessageDialog = ({
  url,
  editing,
  excludeLanguageIds,
  onClose,
  onSuccess,
}: ClosingMessageDialogProps) => {
  const { t } = useTranslation(['closingMessages']);

  return (
    <DevnutSection.Grid className="pb-16">
      <DevnutTypography.Title
        title={
          editing
            ? t('dialog.edit_title', { language: editing.language })
            : t('dialog.add_title')
        }
      />
      <ClosingMessageForm
        key={editing?.id ?? 'add'}
        url={url}
        initialValues={
          editing
            ? {
                language_id: editing.language_id,
                content: editing.content,
                link_used_message: editing.link_used_message ?? '',
                survey_closed_message: editing.survey_closed_message ?? '',
              }
            : undefined
        }
        excludeLanguageIds={excludeLanguageIds}
        onSuccess={onSuccess}
        onClose={onClose}
        submitter={{ searchConfig: { submitText: t('dialog.save') } }}
      />
    </DevnutSection.Grid>
  );
};
