import { CrudDataTable } from '@/components/CrudDataTable';
import type { Values } from '@/hooks/useCrudDataTable';
import type { ColumnDef } from '@tanstack/react-table';
import { useTranslation } from 'react-i18next';
import { LanguageForm } from './form';

/**
 * Languages are append-only: their ids are referenced by every translation, so rows can
 * only be added, never edited, deleted or duplicated.
 */
export function LanguagesTable() {
  const { t } = useTranslation(['settings']);

  const columns: ColumnDef<Values>[] = [
    {
      id: 'id',
      header: t('languages.columns.id'),
      accessorKey: 'id',
      meta: { mobileCardRole: 'subtitle', mobileCardOrder: 2 },
    },
    {
      id: 'language',
      header: t('languages.columns.language'),
      accessorKey: 'language',
      meta: { searchable: true, mobileCardRole: 'title', mobileCardOrder: 1 },
    },
    {
      id: 'original_lang',
      header: t('languages.columns.original_lang'),
      accessorKey: 'original_lang',
    },
    {
      id: 'alphabet',
      header: t('languages.columns.alphabet'),
      accessorKey: 'alphabet',
      meta: { hideInMobile: true },
    },
  ];

  return (
    <CrudDataTable
      className="p-0"
      url="/languages"
      columns={columns}
      title={t('languages.title')}
      form={LanguageForm}
      hideBuiltinActions={['view', 'edit', 'delete', 'duplicate']}
      disableRowClick
    />
  );
}
