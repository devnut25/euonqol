import { CrudDataTable } from '@/components/CrudDataTable';
import type { Values } from '@/hooks/useCrudDataTable';
import type { ColumnDef } from '@tanstack/react-table';
import { useTranslation } from 'react-i18next';
import { CatSettingForm } from './form';

export const CatSettingsTable = () => {
  const { t } = useTranslation(['management']);

  const columns: ColumnDef<Values>[] = [
    {
      id: 'name',
      header: t('cat_settings.columns.name'),
      accessorKey: 'name',
      meta: { searchable: true, mobileCardRole: 'title', mobileCardOrder: 1 },
    },
    {
      id: 'setting_key',
      header: t('cat_settings.columns.setting_key'),
      accessorKey: 'setting_key',
      meta: { mobileCardRole: 'subtitle', mobileCardOrder: 2 },
    },
    {
      id: 'description',
      header: t('cat_settings.columns.description'),
      accessorKey: 'description',
      enableSorting: false,
      meta: { hideInMobile: true },
    },
    {
      id: 'moduleCount',
      header: t('cat_settings.columns.module_count'),
      accessorKey: 'moduleCount',
      enableSorting: false,
      meta: { valueType: 'number', hideInMobile: true },
    },
    {
      id: 'createdAt',
      header: t('cat_settings.columns.created_at'),
      accessorKey: 'createdAt',
      meta: { valueType: 'date', hideInMobile: true },
    },
  ];

  return (
    <CrudDataTable
      // type="modal"
      className="p-0"
      columns={columns}
      title={t('cat_settings.title')}
      form={CatSettingForm}
      url="/cat-settings"
      deleteButtonConfig={{ visible: (row) => row.canDelete !== false }}
    />
  );
};
