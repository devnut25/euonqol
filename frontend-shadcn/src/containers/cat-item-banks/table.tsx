import { CrudDataTable } from '@/components/CrudDataTable';
import { DevnutButton } from '@/components/DevnutButton';
import { UsageCell } from '@/components/UsageCell';
import type { Values } from '@/hooks/useCrudDataTable';
import type { ColumnDef } from '@tanstack/react-table';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { CatItemBankForm } from './form';

export const CatItemBanksTable = () => {
  const { t } = useTranslation(['management']);

  const navigate = useNavigate();

  const columns: ColumnDef<Values>[] = [
    {
      id: 'name',
      header: t('cat_item_banks.columns.name'),
      accessorKey: 'name',
      meta: { searchable: true, mobileCardRole: 'title', mobileCardOrder: 1 },
    },
    {
      id: 'description',
      header: t('cat_item_banks.columns.description'),
      accessorKey: 'description',
      enableSorting: false,
      meta: { mobileCardRole: 'subtitle', mobileCardOrder: 2 },
    },
    {
      id: 'questionCount',
      header: t('cat_item_banks.columns.question_count'),
      accessorKey: 'questionCount',
      enableSorting: false,
      meta: { valueType: 'number', hideInMobile: true },
    },
    {
      id: 'moduleCount',
      header: t('cat_item_banks.columns.module_count'),
      accessorKey: 'moduleCount',
      enableSorting: false,
      meta: { valueType: 'number', hideInMobile: true },
    },
    {
      id: 'languageCount',
      header: t('cat_item_banks.columns.language_count'),
      accessorKey: 'languageCount',
      enableSorting: false,
      meta: { valueType: 'number', hideInMobile: true },
    },
    {
      id: 'createdAt',
      header: t('cat_item_banks.columns.created_at'),
      accessorKey: 'createdAt',
      meta: { valueType: 'date', hideInMobile: true },
    },
    {
      id: 'usage',
      header: t('cat_item_banks.columns.usage'),
      accessorKey: 'questionnaireCount',
      enableSorting: false,
      meta: { hideInMobile: true },
      cell: ({ row }) => (
        <UsageCell
          surveyCount={row.original.surveyCount ?? 0}
          questionnaireCount={row.original.questionnaireCount ?? 0}
        />
      ),
    },
    {
      id: 'isActive',
      header: t('cat_item_banks.columns.is_active'),
      accessorKey: 'isActive',
      meta: { valueType: 'boolean', hideInMobile: true },
    },
  ];

  return (
    <CrudDataTable
      hideCreateButton
      className="p-0"
      columns={columns}
      title={t('cat_item_banks.title')}
      form={CatItemBankForm}
      url="/cat-item-banks"
      toolbarButton={{
        actions: [
          <DevnutButton
            aria-label="Create CAT item bank"
            className="px-6"
            onClick={() => navigate('/cat-item-banks/upload')}
          >
            {t('cat_item_banks.create.button', 'Create')}
          </DevnutButton>,
        ],
      }}
    />
  );
};
