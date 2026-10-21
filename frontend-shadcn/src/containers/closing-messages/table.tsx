import { CreateButton } from '@/components/buttons/create-button';
import { CardListData } from '@/components/data-table/card-list-data';
import { DevnutButton } from '@/components/DevnutButton';
import DevnutTypography from '@/components/DevnutTypography';
import { ExcelImportModal } from '@/containers/survey/ExcelImportModal';
import { FileSpreadsheet } from 'lucide-react';
import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ClosingMessageDialog } from './dialog';
import { ClosingMessageLanguageCards } from './language-cards';
import type { ClosingMessageRow } from './utils/types';

interface ClosingMessagesTableProps {
  surveyId: string | number;
  surveyCompleted?: boolean;
}

export const ClosingMessagesTable = ({ surveyId, surveyCompleted }: ClosingMessagesTableProps) => {
  const { t } = useTranslation(['closingMessages']);

  const [usedLanguageIds, setUsedLanguageIds] = useState<number[]>([]);
  const [creating, setCreating] = useState(false);
  const [importing, setImporting] = useState(false);

  const url = `/surveys/${surveyId}/closing-message`;

  const reloadRef = useRef<(() => void) | null>(null);
  const reload = () => reloadRef.current?.();

  return (
    <CardListData
      url={url}
      className="mt-4"
      reloadRef={reloadRef}
      onDataChange={(items) => setUsedLanguageIds(items.map((i) => Number(i.language_id)))}
      renderList={(items, reload) => (
        <ClosingMessageLanguageCards
          surveyId={surveyId}
          items={items as ClosingMessageRow[]}
          reload={reload}
        />
      )}
    >
      <div className="flex items-center justify-between">
        <DevnutTypography.Title title={t('title')} />
        <div className="flex items-center gap-2">
          <DevnutButton
            variant="outline"
            className="gap-2"
            onClick={() => setImporting(true)}
            disabled={surveyCompleted}
          >
            <FileSpreadsheet className="size-4" />
            {t('actions.import_excel')}
          </DevnutButton>
          <CreateButton
            label={t('actions.add_language')}
            onClick={() => setCreating(true)}
            disabled={surveyCompleted}
          />
        </div>
      </div>

      {creating && (
        <ClosingMessageDialog
          url={url}
          excludeLanguageIds={usedLanguageIds}
          onClose={() => setCreating(false)}
          onSuccess={() => {
            reload();
            setCreating(false);
          }}
        />
      )}

      <ExcelImportModal
        open={importing}
        onClose={() => setImporting(false)}
        surveyId={String(surveyId)}
        type="closing-messages"
        onSuccess={() => {
          setImporting(false);
          reload();
        }}
      />
    </CardListData>
  );
};
