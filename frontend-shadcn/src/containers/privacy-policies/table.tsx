import { CrudDataTable } from '@/components/CrudDataTable';
import { DevnutButton } from '@/components/DevnutButton';
import type { Values } from '@/hooks/useCrudDataTable';
import { useIsMobile } from '@/hooks/useMediaQuery';
import type { ColumnDef } from '@tanstack/react-table';
import { FileSpreadsheet } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ExcelImportModal } from '../survey/ExcelImportModal';
import { PrivacyPolicyForm } from './form';

interface PrivacyPolicyTableProps {
  survey: Values;
  parentBreadcrumbs?: { label: string; onClick?: () => void }[];
}

export const PrivacyPolicyTable = ({ survey, parentBreadcrumbs }: PrivacyPolicyTableProps) => {
  const { t } = useTranslation(['privacyPolicies']);

  const isMobile = useIsMobile(768);
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
        mobileCardRole: "title"
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
      id: 'pdf_url',
      accessorKey: 'pdf_url',
      header: t('header_columns.attachment'),
      enableSorting: false,
      meta: { valueType: 'pdfUrl', mobileCardRole: "leading" },
    },
  ];

  return (
    <>
      <CrudDataTable
        key={refreshKey}
        columns={columns}
        title={t('title')}
        parentBreadcrumbs={parentBreadcrumbs}
        keyName="privacy_policy"
        url={`/surveys/${survey.id}/privacy-policies`}
        form={PrivacyPolicyForm}
        formProps={{ surveyId: survey.id }}
        fallbackToggleConfig={{
          url: (row) => `/surveys/${survey.id}/privacy-policies/${row.id}/fallback`,
          confirmTitle: t('module.actions.toggle_fallback_confirm_title'),
          confirmDescription: t('module.actions.toggle_fallback_confirm_description'),
        }}
        toolbarButton={{
          actions: isMobile
            ? []
            : [
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
      />

      <ExcelImportModal
        open={showImport}
        onClose={() => setShowImport(false)}
        surveyId={String(survey.id)}
        type="privacy-policies"
        onSuccess={() => {
          setShowImport(false);
          setRefreshKey((k) => k + 1);
        }}
      />
    </>
  );
};
