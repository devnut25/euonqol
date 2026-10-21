import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useApi } from '@/hooks/useApi';
import type { Values } from '@/hooks/useCrudDataTable';
import { DataTableContext, type DataTableContextProps } from '@/hooks/useDataTable';
import { useIsMobile } from '@/hooks/useMediaQuery';
import { isActionVisibleForRow, rowHasVisibleAction } from '@/lib/dataTableActions';
import { cn } from '@/lib/tailwind/utils';
import { TableConfigProvider } from '@/providers/TableConfigProvider';
import type { DataTableActionsConfig, TableAction } from '@/types/dataTableAction';
import {
  flexRender,
  getCoreRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
  type Column,
  type ColumnDef,
  type ColumnFiltersState,
  type PaginationState,
  type Row,
  type SortingState,
} from '@tanstack/react-table';
import { ArrowUpDown, ChevronDownIcon, ChevronUpIcon } from 'lucide-react';
import React from 'react';
import { useTranslation } from 'react-i18next';
import { useDebounce } from 'react-use';
import DevnutEmpty from '../DevnutEmpty';
import DevnutSection from '../DevnutSection';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '../ui/alert-dialog';
import { Button } from '../ui/button';
import { Cell } from './cell';
import { TableActionButton } from './data-table-action-button';
import { DataTableToolbar } from './data-table-toolbar';
import { PaginationControls } from './pagination-controls';
import { ROW_OPEN_FOCUS_RING, RowOpenButton } from './row-open-button';

export interface DataTableApiProps {
  url: string;
  columns: ColumnDef<Values>[];
  actionsConfig?: DataTableActionsConfig;
  searchable?: boolean;
  searchPlaceholder?: string;
  defaultSearch?: string;
  paginated?: boolean;
  defaultPageSize?: number;
  sortable?: boolean;
  defaultSort?: SortingState;
  params?: Values;
  onDataChange?: (data: Values[]) => void;
  onMetaChange?: (meta: Values) => void;
  onChange?: (params: Record<string, unknown>) => void;
  children?: React.ReactNode;
  className?: string;
  loadingText?: string;
  emptyText?: string;
  defaultFilters?: Values;
  onFiltersChange?: (filters: Values) => void;
  reloadRef?: React.RefObject<(() => void) | null>;
  onRowClick?: (row: Values) => void;
  renderBeforeTable?: (items: Values[]) => React.ReactNode;
  fetchEnabled?: boolean;
}

export function DataTable({
  url,
  columns,
  actionsConfig,
  defaultSearch = '',
  paginated = true,
  defaultPageSize = 20,
  sortable = true,
  defaultSort = [],
  params = {},
  onDataChange,
  onMetaChange,
  onChange,
  children,
  defaultFilters = {},
  onFiltersChange,
  className,
  reloadRef,
  onRowClick,
  renderBeforeTable,
  fetchEnabled = true,
}: DataTableApiProps) {
  const { makeRequest, setTableParams } = useApi();
  const { t } = useTranslation(['common']);
  const isMobile = useIsMobile(768);

  const [data, setData] = React.useState<Values[]>([]);
  const [total, setTotal] = React.useState(0);
  const [search, setSearch] = React.useState<string>(defaultSearch ?? '');
  const [sorting, setSorting] = React.useState<SortingState>(defaultSort);
  const [pagination, setPagination] = React.useState<PaginationState>({
    pageIndex: 0,
    pageSize: defaultPageSize,
  });

  // ============================================
  // LOADING STATE - Nuova implementazione
  // ============================================
  const [isLoading, setIsLoading] = React.useState(true); // true al mount iniziale
  const [isRefetching, setIsRefetching] = React.useState(false); // per reload successivi

  // Column filters state (gestito da TanStack Table)
  const [columnFilters, setColumnFilters] = React.useState<ColumnFiltersState>(() => {
    // Converti defaultFilters in ColumnFiltersState
    return Object.entries(defaultFilters).map(([id, value]) => ({
      id,
      value,
    }));
  });

  // Track if API is available
  const [hasError, setHasError] = React.useState(false);
  const [errorMessage, setErrorMessage] = React.useState<string>('');

  useDebounce(
    () => {
      if (fetchEnabled) fetchData();
    },
    400,
    [search, pagination, sorting, columnFilters, fetchEnabled]
  );

  // Stringify params and sorting to avoid recreating object reference
  const paramsString = JSON.stringify(params);
  const sortingString = JSON.stringify(sorting);
  const columnFiltersString = JSON.stringify(columnFilters);

  // Converti sorting in formato API
  const convertSortToApi = React.useCallback((sorting: SortingState): string[] => {
    return sorting.map((sort) => {
      const prefix = sort.desc ? '-' : '';
      return `${prefix}${sort.id}`;
    });
  }, []);

  /**
   * Converte i filtri per l'API (generico, non Laravel-specific)
   * Supporta nested keys usando dot notation
   */
  const formatFiltersForApi = (filters: Values): Values => {
    const result: Values = {};

    const processValue = (key: string, value: unknown) => {
      if (value === undefined || value === null || value === '') {
        return;
      }

      if (Array.isArray(value)) {
        const filtered = value.filter((v) => v !== undefined && v !== null && v !== '');
        if (filtered.length > 0) {
          result[key] = filtered;
        }
        return;
      }

      if (typeof value === 'object' && !(value instanceof Date)) {
        Object.entries(value).forEach(([nestedKey, nestedValue]) => {
          processValue(`${key}.${nestedKey}`, nestedValue);
        });
        return;
      }

      if (value instanceof Date) {
        result[key] = value.toISOString();
        return;
      }

      result[key] = value;
    };

    Object.entries(filters).forEach(([key, value]) => {
      processValue(key, value);
    });

    return result;
  };

  /**
   * Converte ColumnFiltersState di TanStack in Values
   */
  const columnFiltersToValues = (columnFilters: ColumnFiltersState): Values => {
    const filters: Values = {};
    columnFilters.forEach((filter) => {
      if (filter.value !== undefined && filter.value !== null && filter.value !== '') {
        filters[filter.id] = filter.value;
      }
    });
    return filters;
  };

  // Fetch data from API
  const fetchData = React.useCallback(async () => {
    if (!url) return;
    if (hasError) return;

    const parsedParams = JSON.parse(paramsString);
    const parsedSorting = JSON.parse(sortingString);
    const parsedColumnFilters: ColumnFiltersState = JSON.parse(columnFiltersString);

    // Converti i filtri delle colonne in formato API
    const filtersFromColumns = columnFiltersToValues(parsedColumnFilters);
    const formattedFilters = formatFiltersForApi(filtersFromColumns);

    const { filter: defaultFilter, ...restParams } = parsedParams as {
      filter?: Values;
      [key: string]: unknown;
    };

    const mergedFilter = {
      ...(defaultFilter ?? {}),
      ...formattedFilters,
    };

    const requestParams = {
      page: pagination.pageIndex + 1,
      per_page: pagination.pageSize,
      ...(search && { search: search }),
      ...(parsedSorting.length > 0 && {
        sort: convertSortToApi(parsedSorting),
      }),
      ...(Object.keys(mergedFilter).length > 0 && {
        filter: mergedFilter,
      }),
      ...restParams,
    };

    // ============================================
    // Gestione loading state
    // ============================================
    // Se è il primo caricamento usa isLoading, altrimenti isRefetching
    const isInitialLoad = data.length === 0 && !hasError;
    if (isInitialLoad) {
      setIsLoading(true);
    } else {
      setIsRefetching(true);
    }

    try {
      const response = await makeRequest(url, 'get', requestParams);

      const responseData = response.data || [];
      const responseTotal = response.meta?.total || 0;

      setData(responseData);
      setTotal(responseTotal);
      onDataChange?.(responseData);
      onMetaChange?.(response.meta ?? {});

      onChange?.({
        pagination: {
          current: pagination.pageIndex + 1,
          pageSize: pagination.pageSize,
          total: responseTotal,
        },
        sort: convertSortToApi(sorting),
        search: search,
        filters: formattedFilters,
      });
    } catch (error: unknown) {
      console.error('DataTable fetch error:', error);

      // Set error state to prevent further calls
      setHasError(true);
      setData([]);
      setTotal(0);

      // Set user-friendly error message
      const err = error as {
        response?: { status?: number };
        code?: string;
        message?: string;
      };

      if (err?.response?.status === 404) {
        setErrorMessage(t('data_table.errorResponseMessages.invalidUrl'));
      } else if (err?.code === 'ERR_NETWORK' || err?.message?.includes('Network Error')) {
        setErrorMessage(t('data_table.errorResponseMessages.serverConnection'));
      } else if (err?.response?.status === 500) {
        setErrorMessage(t('data_table.errorResponseMessages.serverError'));
      } else {
        setErrorMessage(err?.message || t('data_table.errorResponseMessages.loadData'));
      }
    } finally {
      // ============================================
      // Reset loading states
      // ============================================
      setIsLoading(false);
      setIsRefetching(false);
    }
  }, [
    url,
    hasError,
    paramsString,
    sortingString,
    columnFiltersString,
    pagination.pageIndex,
    pagination.pageSize,
    search,
    convertSortToApi,
    data.length,
    makeRequest,
    onDataChange,
    onMetaChange,
    onChange,
    sorting,
    t,
  ]);

  // Update tableParams when pagination/sorting changes
  React.useEffect(() => {
    setTableParams({
      pagination: {
        current: pagination.pageIndex + 1,
        pageSize: pagination.pageSize,
        total,
      },
      sort: convertSortToApi(sorting),
    });
  }, [pagination, sorting, total, setTableParams, convertSortToApi]);

  // Notifica i cambiamenti dei filtri
  React.useEffect(() => {
    const filtersValues = columnFiltersToValues(columnFilters);
    onFiltersChange?.(filtersValues);
  }, [columnFilters, onFiltersChange]);

  // Handler per il cambio dei filtri colonna - resetta la pagina
  const handleColumnFiltersChange = React.useCallback(
    (updaterOrValue: ColumnFiltersState | ((old: ColumnFiltersState) => ColumnFiltersState)) => {
      setColumnFilters(updaterOrValue);
      setPagination((prev) => ({ ...prev, pageIndex: 0 }));
    },
    []
  );

  // Create table instance
  const table = useReactTable({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: sortable ? getSortedRowModel() : undefined,
    getPaginationRowModel: paginated ? getPaginationRowModel() : undefined,
    onSortingChange: setSorting,
    onPaginationChange: setPagination,
    onColumnFiltersChange: handleColumnFiltersChange,
    manualPagination: true,
    manualSorting: true,
    manualFiltering: true,
    pageCount: Math.ceil(total / pagination.pageSize),
    state: {
      sorting,
      pagination,
      columnFilters,
    },
  });

  // Colonna Actions: nascosta del tutto se nessuna riga del dataset corrente ha azioni visibili
  const showActionsColumn = React.useMemo(() => {
    if (!actionsConfig) return false;
    if (data.length === 0) return true; // loading/empty: non nascondere per evitare flicker
    return data.some((row) => rowHasVisibleAction(actionsConfig, row));
  }, [actionsConfig, data]);

  // Expose reload function
  React.useEffect(() => {
    if (actionsConfig) {
      (actionsConfig as any).reload = fetchData;
    }
  }, [actionsConfig, fetchData]);

  React.useEffect(() => {
    if (reloadRef) {
      reloadRef.current = fetchData;
    }
  }, [fetchData, reloadRef]);

  // Handler per la ricerca dalla toolbar
  const handleSearch = React.useCallback((value: string) => {
    setSearch(value);
    setPagination((prev) => ({ ...prev, pageIndex: 0 }));
  }, []);

  // Handler per impostare tutti i filtri programmaticamente
  const setFilters = React.useCallback((newFilters: Values) => {
    const newColumnFilters: ColumnFiltersState = Object.entries(newFilters).map(([id, value]) => ({
      id,
      value,
    }));
    setColumnFilters(newColumnFilters);
    setPagination((prev) => ({ ...prev, pageIndex: 0 }));
  }, []);

  // Handler per impostare un singolo filtro programmaticamente
  const setFilter = React.useCallback((key: string, value: unknown) => {
    setColumnFilters((prev) => {
      const existing = prev.filter((f) => f.id !== key);
      if (value === undefined || value === null || value === '') {
        return existing;
      }
      return [...existing, { id: key, value }];
    });
    setPagination((prev) => ({ ...prev, pageIndex: 0 }));
  }, []);

  // Handler per il reset dei filtri (chiamato dalla toolbar e dal context)
  const resetFilters = React.useCallback(() => {
    // Ripristina i filtri ai valori di default
    const defaultColumnFilters: ColumnFiltersState = Object.entries(defaultFilters).map(
      ([id, value]) => ({ id, value })
    );
    setColumnFilters(defaultColumnFilters);
    setSearch(defaultSearch);
    setPagination((prev) => ({ ...prev, pageIndex: 0 }));
  }, [defaultFilters, defaultSearch]);

  const setCurrentPage = React.useCallback((page: number) => {
    setPagination((prev) => ({ ...prev, pageIndex: page - 1 }));
  }, []);

  // ============================================
  // Componente Loading Skeleton per le righe
  // ============================================
  const LoadingRows = () => {
    const skeletonRows = Array.from({ length: 5 }, (_, i) => i);
    const columnCount = columns.length + (showActionsColumn ? 1 : 0);

    return (
      <>
        {skeletonRows.map((index) => (
          <TableRow key={`skeleton-${index}`}>
            {Array.from({ length: columnCount }, (_, colIndex) => (
              <TableCell key={`skeleton-cell-${index}-${colIndex}`}>
                <div className="h-4 w-full bg-gray-200 rounded" />
              </TableCell>
            ))}
          </TableRow>
        ))}
      </>
    );
  };

  // ============================================
  // Componente Loading Skeleton per le card mobile
  // ============================================
  const LoadingCards = () => {
    const skeletonCards = Array.from({ length: 5 }, (_, i) => i);

    return (
      <div className="space-y-3">
        {skeletonCards.map((index) => (
          <div key={`skeleton-card-${index}`} className="border rounded-lg p-4 bg-white">
            <div className="space-y-3">
              <div className="h-6 w-3/4 bg-gray-200 rounded" />
              <div className="space-y-2">
                <div className="h-4 w-full bg-gray-200 rounded" />
                <div className="h-4 w-5/6 bg-gray-200 rounded" />
                <div className="h-4 w-4/6 bg-gray-200 rounded" />
              </div>
              <div className="flex gap-2 pt-2">
                <div className="h-8 w-20 bg-gray-200 rounded" />
                <div className="h-8 w-20 bg-gray-200 rounded" />
              </div>
            </div>
          </div>
        ))}
      </div>
    );
  };

  // ============================================
  // Componente Card per visualizzazione mobile
  // ============================================
  const MobileCard = ({ row }: { row: Row<Values> }) => {
    // Raggruppa le celle per ruolo
    interface CellWithMeta {
      cell: typeof row.getVisibleCells extends () => infer U
        ? U extends Array<infer V>
          ? V
          : never
        : never;
      meta: {
        mobileCardRole?: 'title' | 'subtitle' | 'leading' | 'trailing' | 'body';
        mobileCardOrder?: number;
        hideInMobile?: boolean;
        mobileCardHide?: boolean;
      };
      header: string;
    }

    const cells = row.getVisibleCells();
    const cellsWithMeta: CellWithMeta[] = cells.map((cell) => {
      const columnDef = cell.column.columnDef;
      const header = columnDef.header;
      const meta =
        (columnDef.meta as {
          mobileCardRole?: 'title' | 'subtitle' | 'leading' | 'trailing' | 'body';
          mobileCardOrder?: number;
          hideInMobile?: boolean;
          mobileCardHide?: boolean;
        }) || {};

      // Determina il label: meta.label (testo leggibile per header JSX/funzione), poi header stringa, poi id
      const metaLabel = (columnDef.meta as { label?: string } | undefined)?.label;
      const label = metaLabel ?? (typeof header === 'string' ? header : cell.column.id);

      return { cell, meta, header: label };
    });

    // Filtra celle nascoste
    const visibleCells = cellsWithMeta.filter(
      ({ meta }) => !meta.hideInMobile && !meta.mobileCardHide
    );

    // Raggruppa per ruolo
    const titleCell = visibleCells.find(({ meta }) => meta.mobileCardRole === 'title');
    const subtitleCell = visibleCells.find(({ meta }) => meta.mobileCardRole === 'subtitle');
    const leadingCell = visibleCells.find(({ meta }) => meta.mobileCardRole === 'leading');
    const trailingCell = visibleCells.find(({ meta }) => meta.mobileCardRole === 'trailing');
    const bodyCells = visibleCells
      .filter(({ meta }) => meta.mobileCardRole === 'body' || !meta.mobileCardRole)
      .filter(
        ({ cell }) =>
          cell !== titleCell?.cell &&
          cell !== subtitleCell?.cell &&
          cell !== leadingCell?.cell &&
          cell !== trailingCell?.cell
      )
      .sort((a, b) => (a.meta.mobileCardOrder || 999) - (b.meta.mobileCardOrder || 999));

    return (
      <div
        className={cn(
          'border rounded-lg px-3 py-2 bg-white hover:bg-slate-100 transition-colors',
          onRowClick && ['cursor-pointer', ROW_OPEN_FOCUS_RING]
        )}
        onClick={() => onRowClick?.(row.original)}
      >
        {/* The card is clickable with the mouse; keyboard/AT users get a real button */}
        {onRowClick && <RowOpenButton onOpen={() => onRowClick(row.original)} />}
        <div className="space-y-3">
          {/* Header Section: Leading, Title/Subtitle, Trailing */}
          <div className="flex items-center gap-3">
            {/* Leading */}
            {leadingCell && (
              <div className="shrink-0">
                <Cell cell={leadingCell.cell} />
              </div>
            )}

            {/* Title & Subtitle */}
            <div className="flex-1 min-w-0">
              {titleCell && (
                <div className="text-base font-semibold truncate">
                  <Cell cell={titleCell.cell} />
                </div>
              )}
              {subtitleCell && (
                <div className="text-sm text-muted-foreground truncate">
                  <Cell cell={subtitleCell.cell} />
                </div>
              )}
            </div>

            {/* Trailing */}
            {trailingCell && (
              <div className="shrink-0 text-xs text-muted-foreground">
                <Cell cell={trailingCell.cell} />
              </div>
            )}
          </div>

          {/* Body Section: Altri campi */}
          {bodyCells.length > 0 && (
            <div className="space-y-2 pt-2 border-t">
              {bodyCells.map(({ cell, header }) => (
                <div key={cell.id} className="flex flex-col gap-1">
                  <span className="text-xs font-medium text-muted-foreground uppercase">
                    {header}
                  </span>
                  <div className="text-sm">
                    <Cell cell={cell} />
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Azioni */}
          {rowHasVisibleAction(actionsConfig, row.original) && (
            <div className="flex flex-wrap items-center gap-2 pt-2 border-t">
              {actionsConfig?.actions
                ?.filter((action) => isActionVisibleForRow(action, row.original))
                .map((action) => {
                  if (action.render) {
                    return (
                      <React.Fragment key={action.id}>
                        {action.render(row.original, fetchData)}
                      </React.Fragment>
                    );
                  }
                  const Icon = action.iconFn ? action.iconFn(row.original) : action.icon;
                  return (
                    <TableActionButton
                      key={action.id}
                      variant={action.variant}
                      onClick={() => handleActionClick(action, row.original)}
                      ariaLabel={action.label}
                      className={cn('flex-1 min-w-25', action.className)}
                      action={action.action}
                      authorizations={row.original.authorizations}
                    >
                      {Icon && <Icon className="h-4 w-4" />}
                      <span className="text-xs">{action.label}</span>
                    </TableActionButton>
                  );
                })}
            </div>
          )}
        </div>
      </div>
    );
  };

  // ============================================
  // Componente Loading Overlay per refetch
  // ============================================
  const LoadingOverlay = () => {
    if (!isRefetching) return null;

    return (
      <div
        // Announced by the persistent live region below, not by this transient overlay
        aria-hidden="true"
        className="absolute inset-0  backdrop-blur-[2px] flex items-center justify-center z-10"
      >
        <div className="flex items-center">
          <div className="text-center">
            <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
            <p className="mt-4 text-primary">{t('data_table.loading')}</p>
          </div>
        </div>
      </div>
    );
  };

  // Context value
  // Confirm dialog state
  const [confirmState, setConfirmState] = React.useState<{
    open: boolean;
    action: TableAction | null;
    row: Values | null;
  }>({ open: false, action: null, row: null });

  const handleActionClick = React.useCallback(
    (action: TableAction, row: Values) => {
      if (action.requireConfirm) {
        setConfirmState({ open: true, action, row });
      } else {
        action.onClick?.(row, fetchData);
      }
    },
    [fetchData]
  );

  // Single always-mounted live region: a region mounted together with its content is
  // often not announced, so loading / result count / empty state are all reported here
  const rangeStart = pagination.pageIndex * pagination.pageSize + 1;
  const rangeEnd = Math.min(total, (pagination.pageIndex + 1) * pagination.pageSize);
  const statusMessage =
    isLoading || isRefetching
      ? t('data_table.loading')
      : hasError
        ? ''
        : !table.getRowModel().rows.length
          ? t('data_table.no_data')
          : paginated
            ? t('data_table.pagination.range', {
                defaultValue: '{{rangeStart}}-{{rangeEnd}} of {{total}}',
                rangeStart,
                rangeEnd,
                total,
              })
            : t('data_table.results', { count: table.getRowModel().rows.length });

  const contextValue: DataTableContextProps = {
    setCurrentPage,
    filters: columnFiltersToValues(columnFilters),
    setFilters,
    setFilter,
    resetFilters,
    reload: fetchData,
    searchValue: search,
  };

  return (
    <DataTableContext.Provider value={contextValue}>
      <AlertDialog
        open={confirmState.open}
        onOpenChange={(open) => !open && setConfirmState({ open: false, action: null, row: null })}
      >
        <AlertDialogContent className="z-99!">
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirmState.action?.confirmConfig?.title ??
                t('crud_data_table.delete_error_messages.confirm')}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirmState.action?.confirmConfig?.description ??
                t('crud_data_table.delete_error_messages.description')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel
              onClick={() => setConfirmState({ open: false, action: null, row: null })}
            >
              {t('crud_data_table.actions.cancel')}
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (confirmState.action && confirmState.row) {
                  confirmState.action.onClick?.(confirmState.row, fetchData);
                }
                setConfirmState({ open: false, action: null, row: null });
              }}
            >
              {confirmState.action?.confirmConfig?.confirmText ?? t('buttons.deleteConfirm.text')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <DevnutSection.Grid>
        {renderBeforeTable?.(data)}

        <div className={cn('w-full p-4', className)}>
          {/* Toolbar/filtri passati come children */}
          <div>
            {children}
            <DataTableToolbar table={table} isLoading={false} onSearch={handleSearch} />
          </div>

          <p role="status" aria-live="polite" aria-atomic="true" className="sr-only">
            {statusMessage}
          </p>

          <TableConfigProvider>
            {/* Overlay di loading durante il refetch */}
            <LoadingOverlay />

            {/* ============================================ */}
            {/* MOBILE VIEW - Card Layout */}
            {/* ============================================ */}
            {isMobile ? (
              <div className="md:mt-4">
                {/* ============================================ */}
                {/* LOADING STATE - Prima del mount iniziale */}
                {/* ============================================ */}
                {isLoading ? (
                  <LoadingCards />
                ) : hasError ? (
                  <div role="alert" className="border rounded-lg p-8 bg-red-50">
                    <div className="flex flex-col items-center justify-center gap-4">
                      <div className="rounded-full bg-destructive/10 p-3">
                        <svg
                          className="h-6 w-6 text-destructive"
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                          />
                        </svg>
                      </div>
                      <div className="space-y-2 text-center">
                        <p className="text-sm font-medium text-destructive">
                          {t('data_table.error')}
                        </p>
                        <p className="text-xs text-muted-foreground max-w-md">{errorMessage}</p>
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setHasError(false);
                          setErrorMessage('');
                          fetchData();
                        }}
                      >
                        {t('data_table.retry')}
                      </Button>
                    </div>
                  </div>
                ) : table.getRowModel().rows?.length ? (
                  <div className="space-y-3">
                    {table.getRowModel().rows.map((row) => (
                      <MobileCard key={row.id} row={row} />
                    ))}
                  </div>
                ) : (
                  <div className="border rounded-lg p-8">
                    <DevnutEmpty />
                  </div>
                )}
              </div>
            ) : (
              /* ============================================ */
              /* DESKTOP VIEW - Table Layout */
              /* ============================================ */
              <Table
                tableContainerClassName="rounded-md border"
                aria-busy={isLoading || isRefetching}
              >
                <TableHeader>
                  {table.getHeaderGroups().map((headerGroup) => (
                    <TableRow key={headerGroup.id} className="hover:bg-slate-200">
                      {headerGroup.headers
                        .filter((header) => !header.column.columnDef.meta?.hideInTable)
                        .map((header) => {
                        const headerContent = header.isPlaceholder
                          ? null
                          : flexRender(header.column.columnDef.header, header.getContext());

                        const sorted = header.column.getIsSorted();

                        return (
                          <TableHead
                            key={header.id}
                            style={{
                              width: header.getSize() !== 150 ? header.getSize() : undefined,
                            }}
                            className="relative h-10 border-t select-none bg-muted/50"
                            aria-sort={
                              !header.column.getCanSort()
                                ? undefined
                                : sorted === 'asc'
                                  ? 'ascending'
                                  : sorted === 'desc'
                                    ? 'descending'
                                    : 'none'
                            }
                          >
                            {header.column.getCanSort() ? (
                              <DataTableColumnHeader column={header.column} title={headerContent} />
                            ) : (
                              headerContent
                            )}
                          </TableHead>
                        );
                      })}
                      {/* Cella azioni */}
                      {showActionsColumn && (
                        <TableHead className="relative h-10 border-t select-none bg-muted/50 w-30">
                          {t('data_table.actions')}
                        </TableHead>
                      )}
                    </TableRow>
                  ))}
                </TableHeader>

                <TableBody>
                  {/* ============================================ */}
                  {/* LOADING STATE - Prima del mount iniziale */}
                  {/* ============================================ */}
                  {isLoading ? (
                    <LoadingRows />
                  ) : hasError ? (
                    <TableRow className="bg-red-100">
                      <TableCell
                        colSpan={
                          table.getAllColumns().filter((col) => !col.columnDef.meta?.hideInTable)
                            .length + (showActionsColumn ? 1 : 0)
                        }
                        className="h-48 text-center"
                      >
                        <div className="flex flex-col items-center justify-center gap-4">
                          <div className="rounded-full bg-destructive/10 p-3">
                            <svg
                              className="h-6 w-6 text-destructive"
                              fill="none"
                              viewBox="0 0 24 24"
                              stroke="currentColor"
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                              />
                            </svg>
                          </div>
                          <div className="space-y-2">
                            <p className="text-sm font-medium text-destructive">
                              {t('data_table.error')}
                            </p>
                            <p className="text-xs text-muted-foreground max-w-md">{errorMessage}</p>
                          </div>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              setHasError(false);
                              setErrorMessage('');
                              fetchData();
                            }}
                          >
                            {t('data_table.retry')}
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ) : table.getRowModel().rows?.length ? (
                    table.getRowModel().rows.map((row) => (
                      <TableRow
                        key={row.id}
                        data-state={row.getIsSelected() && 'selected'}
                        className={cn(
                          'group hover:bg-slate-100',
                          onRowClick && [
                            'cursor-pointer has-[[data-row-open]:focus-visible]:ring-inset',
                            ROW_OPEN_FOCUS_RING,
                          ]
                        )}
                        onClick={() => onRowClick?.(row.original)}
                      >
                        {row
                          .getVisibleCells()
                          .filter((cell) => !cell.column.columnDef.meta?.hideInTable)
                          .map((cell, cellIndex) => (
                            <TableCell
                              key={cell.id}
                              style={{
                                width:
                                  cell.column.getSize() !== 150 ? cell.column.getSize() : undefined,
                              }}
                            >
                              {/* Keyboard/AT entry point of the clickable row (the <tr> is not focusable) */}
                              {onRowClick && cellIndex === 0 && (
                                <RowOpenButton onOpen={() => onRowClick(row.original)} />
                              )}
                              <Cell cell={cell} />
                            </TableCell>
                          ))}
                        {/* Cella azioni */}
                        {showActionsColumn && (
                          <TableCell className="w-30">
                            <div className="flex items-center justify-end gap-1">
                              {actionsConfig?.actions
                                ?.filter((action) => isActionVisibleForRow(action, row.original))
                                .map((action) => {
                                  if (action.render) {
                                    return (
                                      <React.Fragment key={action.id}>
                                        {action.render(row.original, fetchData)}
                                      </React.Fragment>
                                    );
                                  }
                                  const Icon = action.iconFn
                                    ? action.iconFn(row.original)
                                    : action.icon;

                                  return (
                                    <TableActionButton
                                      key={action.id}
                                      variant={action.variant}
                                      onClick={() => handleActionClick(action, row.original)}
                                      ariaLabel={action.label}
                                      className={action.className}
                                      action={action.action}
                                      authorizations={row.original.authorizations}
                                    >
                                      {Icon && <Icon className="h-4 w-4" />}
                                    </TableActionButton>
                                  );
                                })}
                            </div>
                          </TableCell>
                        )}
                      </TableRow>
                    ))
                  ) : (
                    <TableRow className="hover:bg-slate-100">
                      <TableCell
                        colSpan={
                          table.getAllColumns().filter((col) => !col.columnDef.meta?.hideInTable)
                            .length + (showActionsColumn ? 1 : 0)
                        }
                        className="h-24 text-center"
                      >
                        <DevnutEmpty />
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            )}
          </TableConfigProvider>

          {paginated && !isLoading && !hasError && total > 0 && (
            <PaginationControls
              pageIndex={pagination.pageIndex}
              pageSize={pagination.pageSize}
              total={total}
              onPageChange={(pageIndex) => setPagination((prev) => ({ ...prev, pageIndex }))}
              onPageSizeChange={(pageSize) => setPagination({ pageIndex: 0, pageSize })}
            />
          )}
        </div>
      </DevnutSection.Grid>
    </DataTableContext.Provider>
  );
}

interface DataTableColumnHeaderProps<TData, TValue>
  extends Omit<React.HTMLAttributes<HTMLButtonElement>, 'title'> {
  column: Column<TData, TValue>;
  /** Header content (string or JSX): it is the button's accessible name. */
  title: React.ReactNode;
}

export function DataTableColumnHeader<TData, TValue>({
  column,
  title,
  className,
}: DataTableColumnHeaderProps<TData, TValue>) {
  const sortDirection = column.getIsSorted();

  const sortIcons = {
    asc: ChevronUpIcon,
    desc: ChevronDownIcon,
    false: ArrowUpDown,
  };

  const SortIcon = sortIcons[sortDirection || 'false'];

  // Real button named by the header text; the sort state is exposed by aria-sort on the <th>
  return (
    <button
      type="button"
      className={cn(
        'flex h-full w-full cursor-pointer items-center justify-between gap-2 select-none text-left',
        'rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        className
      )}
      onClick={column.getToggleSortingHandler()}
    >
      <span>{title}</span>
      <SortIcon className="shrink-0 opacity-60" size={16} aria-hidden="true" />
    </button>
  );
}
