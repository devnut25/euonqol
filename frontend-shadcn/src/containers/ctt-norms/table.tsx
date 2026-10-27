import { CrudDataTable } from '@/components/CrudDataTable';
import { UsageCell } from '@/components/UsageCell';
import type { Values } from '@/hooks/useCrudDataTable';
import type { ColumnDef } from '@tanstack/react-table';
import { useTranslation } from 'react-i18next';
import { CttNormsForm } from './form';

export function CttNormsTable() {
  const { t } = useTranslation(['settings']);

  const columns: ColumnDef<Values>[] = [
    {
      id: 'name',
      header: t('ctt_norms.columns.name'),
      accessorKey: 'name',
      meta: {
        searchable: true,
        mobileCardRole: 'title',
        mobileCardOrder: 1,
      },
    },
    {
      id: 'description',
      header: t('ctt_norms.columns.description'),
      accessorKey: 'description',
      enableSorting: false,
      meta: { hideInMobile: true },
    },
    {
      id: 'usage',
      header: t('ctt_norms.columns.usage'),
      accessorKey: 'survey_count',
      enableSorting: false,
      meta: { hideInMobile: true },
      cell: ({ row }) => (
        <UsageCell
          surveyCount={row.original.survey_count ?? 0}
          questionnaireCount={row.original.questionnaire_count ?? 0}
        />
      ),
    },
    {
      id: 'created_at',
      header: t('ctt_norms.columns.created_at'),
      accessorKey: 'created_at',
      meta: {
        valueType: 'date',
        hideInMobile: true,
        mobileCardRole: 'subtitle',
        mobileCardOrder: 2,
      },
    },
    {
      id: 'is_active',
      header: t('ctt_norms.columns.is_active'),
      accessorKey: 'is_active',
      enableSorting: false,
      meta: { valueType: 'boolean' },
    },
  ];

  return (
    <CrudDataTable
      className="p-0"
      url="/ctt-norms"
      columns={columns}
      title={t('ctt_norms.title')}
      form={CttNormsForm}
    />
  );
}
