import { DataTableContext } from '@/hooks/useDataTable';
import { useIsTablet } from '@/hooks/useMediaQuery';
import { type Table } from '@tanstack/react-table';
import { t } from 'i18next';
import { RotateCcw } from 'lucide-react';
import React from 'react';
import { DevnutButton } from '../DevnutButton';
import DevnutSection from '../DevnutSection';
import { DataTableFilter } from './data-table-filters';

interface DataTableToolbarProps<TData> {
  table: Table<TData>;
  isLoading?: boolean;
  onSearch?: (value: string) => void;
}

export function DataTableToolbar<TData>({ table, onSearch }: DataTableToolbarProps<TData>) {
  const isTablet = useIsTablet();

  // Ottieni il context per il reset dei filtri API (undefined se fuori dal DataTable)
  const dataTableContext = React.useContext(DataTableContext) ?? null;

  const searchableColumns = React.useMemo(
    () => table.getAllColumns().filter((column) => column.columnDef.meta?.searchable),
    [table]
  );

  const filterableColumns = React.useMemo(
    () => table.getAllColumns().filter((column) => column.columnDef.meta?.filterable),
    [table]
  );

  const hasFilters = filterableColumns.length > 0;

  const columnFilters = table.getState().columnFilters;

  // Verifica se ci sono filtri attivi
  const hasActiveFilters = React.useMemo(() => {
    return columnFilters.length > 0;
  }, [columnFilters]);

  // Reset che usa il context se disponibile, altrimenti usa il reset della tabella
  const onReset = React.useCallback(() => {
    if (dataTableContext) {
      // Usa il reset del context che gestisce anche la chiamata API
      dataTableContext.resetFilters();
    } else {
      // Fallback al reset della tabella (solo client-side)
      table.resetColumnFilters();
    }
  }, [table, dataTableContext]);

  const onReload = React.useCallback(() => {
    if (dataTableContext) {
      // Usa il reload del context che gestisce anche la chiamata API
      dataTableContext.reload();
    }
  }, [dataTableContext]);

  return (
    <div className="flex flex-col gap-4 md:flex-row md:justify-between items-center py-6">
      {/* Campi di ricerca */}
      <div className="flex items-center gap-3 w-full md:w-44">
        {searchableColumns.map((column) => (
          <div key={column.id} className="w-full">
            <DataTableFilter
              column={column}
              onSearch={onSearch}
              searchValue={dataTableContext?.searchValue ?? ''}
            />
          </div>
        ))}
      </div>

      <DevnutSection.Grid className="gap-2 grid-cols-1 sm:grid-cols-[minmax(0,1fr)_auto] items-end w-full md:w-auto">
        {/* Filtri select */}
        {hasFilters && (
          <div className="flex flex-wrap gap-2">
            {filterableColumns.map((column) => (
              <div key={column.id} className="md:min-w-[180px]">
                <DataTableFilter column={column} />
              </div>
            ))}
          </div>
        )}
        <div className="flex gap-2 justify-end">
          {hasFilters && (
            <DevnutButton
              onClick={onReset}
              disabled={!hasActiveFilters}
              size={isTablet ? 'xs' : 'default'}
            >
              {t('common:buttons.values.clear')}
            </DevnutButton>
          )}
          <DevnutButton
            // Name only for the icon-only variant: elsewhere the visible text is the name (2.5.3)
            aria-label={isTablet ? t('common:buttons.values.reload') : undefined}
            onClick={onReload}
            size={isTablet ? 'xs' : 'default'}
          >
            {isTablet ? <RotateCcw aria-hidden="true" className="h-4 w-4" /> : t('common:buttons.values.reload')}
          </DevnutButton>
        </div>
      </DevnutSection.Grid>
    </div>
  );
}
