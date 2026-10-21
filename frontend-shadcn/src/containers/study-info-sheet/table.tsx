import { CrudDataTable } from '@/components/CrudDataTable';
import { DevnutButton } from '@/components/DevnutButton';
import type { Values } from '@/hooks/useCrudDataTable';
import type { ColumnDef } from '@tanstack/react-table';
import { FileSpreadsheet } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ExcelImportModal } from '../survey/ExcelImportModal';
import { StudyInfoSheetForm } from './form';

interface StudyInfoSheetTableProps {
  surveyId: string | number;
  parentBreadcrumbs?: { label: string; onClick?: () => void }[];
}

export const StudyInfoSheetTable = ({ surveyId, parentBreadcrumbs }: StudyInfoSheetTableProps) => {
  const { t } = useTranslation(['studyInfoSheet']);
  const [showImport, setShowImport] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  const columns: ColumnDef<Values>[] = [
    {
      id: 'language',
      accessorKey: 'language',
      header: t('header_columns.language'),
      meta: { valueType: 'languageFallback' },
    },
    {
      id: 'title',
      accessorKey: 'title',
      header: t('header_columns.title'),
      meta: {
        searchable: true,
      },
    },
    {
      id: 'content',
      accessorKey: 'content',
      header: t('header_columns.content'),
      meta: {
        valueType: 'longTextHtml',
      },
    },
    {
      id: 'rejection_message',
      accessorKey: 'rejection_message',
      header: t('header_columns.rejection_message'),
      enableSorting: false,
      meta: {
        valueType: 'longTextHtml',
      },
    },
    {
      id: 'pdf_url',
      accessorKey: 'pdf_url',
      header: t('header_columns.attachment'),
      enableSorting: false,
      meta: { valueType: 'pdfUrl' },
    },
  ];

  return (
    <>
      <CrudDataTable
        key={refreshKey}
        columns={columns}
        title={t('title')}
        parentBreadcrumbs={parentBreadcrumbs}
        url={`/surveys/${surveyId}/study-info-sheet`}
        form={StudyInfoSheetForm}
        formProps={{ surveyId }}
        toolbarButton={{
          actions: [
            <DevnutButton
              key="import"
              variant="outline"
              className="gap-2"
              onClick={() => setShowImport(true)}
            >
              <FileSpreadsheet className="size-4" />
              Import from Excel
            </DevnutButton>,
          ],
        }}
        fallbackToggleConfig={{
          url: (row) => `/surveys/${surveyId}/study-info-sheet/${row.id}/fallback`,
          confirmTitle: t('module.actions.toggle_fallback_confirm_title'),
          confirmDescription: t('module.actions.toggle_fallback_confirm_description'),
        }}
      />

      <ExcelImportModal
        open={showImport}
        onClose={() => setShowImport(false)}
        surveyId={String(surveyId)}
        type="study-info-sheet"
        onSuccess={() => {
          setShowImport(false);
          setRefreshKey((k) => k + 1);
        }}
      />
    </>
  );
};
