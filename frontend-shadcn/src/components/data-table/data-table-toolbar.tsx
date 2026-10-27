import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from '@/components/ui/drawer';
import { DataTableContext } from '@/hooks/useDataTable';
import { useIsTablet } from '@/hooks/useMediaQuery';
import { useValueEnum } from '@/hooks/useValueEnum';
import { type Table } from '@tanstack/react-table';
import { t } from 'i18next';
import { RotateCcw, SlidersHorizontal } from 'lucide-react';
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
  const { valueOptions } = useValueEnum();

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

  // Mobile: filters live in a bottom drawer
  const [isFiltersOpen, setIsFiltersOpen] = React.useState(false);
  const [draft, setDraft] = React.useState<Record<string, unknown>>({});

  const columnFilters = table.getState().columnFilters;

  // Switch filters default to their first option. Set here, not in DataTableFilter,
  // because on mobile the filters are unmounted while the drawer is closed
  const firstSwitchValue = React.useCallback(
    (column: (typeof filterableColumns)[number]) => {
      const { filterVariant, filterEnum } = column.columnDef.meta ?? {};
      if (filterVariant !== 'switch' || !filterEnum) return undefined;
      return valueOptions?.[filterEnum]?.[0]?.value;
    },
    [valueOptions]
  );

  React.useEffect(() => {
    filterableColumns.forEach((column) => {
      const firstValue = firstSwitchValue(column);
      if (firstValue !== undefined && column.getFilterValue() === undefined) {
        column.setFilterValue(firstValue);
      }
    });
  }, [filterableColumns, firstSwitchValue, columnFilters]);

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

  // A switch on its default (first) option does not count as an active filter
  const activeFilterCount = columnFilters.filter((filter) => {
    const column = filterableColumns.find((c) => c.id === filter.id);
    return column !== undefined && firstSwitchValue(column) !== filter.value;
  }).length;

  // Mobile drawer: filters are edited as a draft and applied on "Show results"
  const currentFilterValues = () =>
    Object.fromEntries(filterableColumns.map((column) => [column.id, column.getFilterValue()]));

  const defaultFilterValues = () =>
    Object.fromEntries(
      filterableColumns.map((column) => [
        column.id,
        dataTableContext?.defaultFilters?.[column.id] ?? firstSwitchValue(column),
      ])
    );

  const openFilters = () => {
    setDraft(currentFilterValues());
    setIsFiltersOpen(true);
  };

  const applyDraft = () => {
    // Filters outside the drawer (none today) are kept; one update → one fetch
    const otherFilters = columnFilters.filter(
      (filter) => !filterableColumns.some((column) => column.id === filter.id)
    );
    const draftFilters = Object.entries(draft)
      .filter(([, value]) => value !== undefined)
      .map(([id, value]) => ({ id, value }));
    table.setColumnFilters([...otherFilters, ...draftFilters]);
    setIsFiltersOpen(false);
  };

  const isDraftDefault = JSON.stringify(draft) === JSON.stringify(defaultFilterValues());

  if (isTablet) {
    return (
      <div className="flex flex-col gap-3 py-6">
        <div className="flex items-center gap-2">
          <div className="flex-1 min-w-0 flex items-center gap-3">
            {searchableColumns.map((column) => (
              <div key={column.id} className="w-full">
                <DataTableFilter
                  column={column}
                  onSearch={onSearch}
                  searchValue={dataTableContext?.searchValue ?? ''}
                  inputHeight="lg"
                />
              </div>
            ))}
          </div>
          {hasFilters && (
            <DevnutButton
              size="icon-lg"
              variant="outline"
              aria-label={t('common:buttons.values.filters')}
              onClick={openFilters}
              className="relative shrink-0"
            >
              <SlidersHorizontal aria-hidden="true" className="h-5 w-5" />
              {activeFilterCount > 0 && (
                <span className="absolute -top-1 -right-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1 text-xs text-primary-foreground">
                  {activeFilterCount}
                </span>
              )}
            </DevnutButton>
          )}
          <DevnutButton
            aria-label={t('common:buttons.values.reload')}
            onClick={onReload}
            size="icon-lg"
            className="shrink-0"
          >
            <RotateCcw aria-hidden="true" className="h-5 w-5" />
          </DevnutButton>
        </div>

        {hasFilters && (
          // Closing without "Show results" (swipe, overlay) discards the draft
          <Drawer open={isFiltersOpen} onOpenChange={setIsFiltersOpen}>
            <DrawerContent>
              <DrawerHeader>
                <DrawerTitle>{t('common:buttons.values.filters')}</DrawerTitle>
                <DrawerDescription className="sr-only">
                  {t('common:buttons.values.filters')}
                </DrawerDescription>
              </DrawerHeader>
              <div className="flex flex-col gap-5 overflow-y-auto px-4">
                {filterableColumns.map((column) => (
                  <DataTableFilter
                    key={column.id}
                    column={column}
                    variant="chips"
                    value={draft[column.id]}
                    onValueChange={(value) =>
                      setDraft((prev) => ({ ...prev, [column.id]: value }))
                    }
                  />
                ))}
              </div>
              <DrawerFooter className="flex-row justify-end">
                <DevnutButton
                  variant="outline"
                  onClick={() => setDraft(defaultFilterValues())}
                  disabled={isDraftDefault}
                >
                  {t('common:buttons.values.clear')}
                </DevnutButton>
                <DevnutButton onClick={applyDraft}>
                  {t('common:buttons.values.show_results')}
                </DevnutButton>
              </DrawerFooter>
            </DrawerContent>
          </Drawer>
        )}
      </div>
    );
  }

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

      <DevnutSection.Grid className="gap-2 grid-cols-[minmax(0,1fr)_auto] items-end w-full md:w-auto">
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
