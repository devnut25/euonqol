import { CreateButton } from '@/components/buttons/create-button';
import { CardListData } from '@/components/data-table/card-list-data';
import { DevnutButton } from '@/components/DevnutButton';
import DevnutTypography from '@/components/DevnutTypography';
import type { Values } from '@/hooks/useCrudDataTable';
import { ExcelImportModal } from '@/containers/survey/ExcelImportModal';
import { useIsMobile } from '@/hooks/useMediaQuery';
import { FileSpreadsheet } from 'lucide-react';
import type { ColumnDef } from '@tanstack/react-table';
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
  const [formState, setFormState] = useState<
    { mode: 'add' } | { mode: 'edit'; row: ClosingMessageRow } | null
  >(null);
  const [importing, setImporting] = useState(false);
  const isMobile = useIsMobile(768);

  const url = `/surveys/${surveyId}/closing-message`;

  // Search-only column: the list is rendered by ClosingMessageLanguageCards; the backend
  // matches message texts and language name on the `search` param.
  const columns: ColumnDef<Values>[] = [
    {
      id: 'content',
      header: t('form.content.label'),
      enableSorting: false,
      meta: { searchable: true },
    },
  ];

  const reloadRef = useRef<(() => void) | null>(null);
  const reload = () => reloadRef.current?.();

  if (formState) {
    return (
      <ClosingMessageDialog
        url={url}
        editing={formState.mode === 'edit' ? formState.row : undefined}
        excludeLanguageIds={usedLanguageIds}
        onClose={() => setFormState(null)}
        onSuccess={() => {
          setFormState(null);
          reload();
        }}
      />
    );
  }

  return (
    <CardListData
      url={url}
      className="mt-4"
      reloadRef={reloadRef}
      columns={columns}
      onDataChange={(items) => setUsedLanguageIds(items.map((i) => Number(i.language_id)))}
      renderList={(items, reload) => (
        <ClosingMessageLanguageCards
          surveyId={surveyId}
          items={items as ClosingMessageRow[]}
          reload={reload}
          onEdit={(row) => setFormState({ mode: 'edit', row })}
        />
      )}
    >
      <div className="flex items-center justify-between">
        <DevnutTypography.Title title={t('title')} />
        <div className="flex items-center gap-2">
          {!isMobile && (
            <DevnutButton
              variant="outline"
              className="gap-2"
              onClick={() => setImporting(true)}
              disabled={surveyCompleted}
            >
              <FileSpreadsheet className="size-4" />
              {t('actions.import_excel')}
            </DevnutButton>
          )}
          <CreateButton
            label={t('actions.add_language')}
            onClick={() => setFormState({ mode: 'add' })}
            disabled={surveyCompleted}
          />
        </div>
      </div>

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
