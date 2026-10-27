import { ApiError } from '@/components/ApiError';
import { Button } from '@/components/ui/button';
import { useApi } from '@/hooks/useApi';
import type { Values } from '@/hooks/useCrudDataTable';
import { DataTableContext, type DataTableContextProps } from '@/hooks/useDataTable';
import { CARD_ACTION_OUTLINE_CLASS, isActionVisibleForRow, rowHasVisibleAction } from '@/lib/dataTableActions';
import { cn } from '@/lib/tailwind/utils';
import type { DataTableActionsConfig, TableAction } from '@/types/dataTableAction';
import {
  getCoreRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type ColumnFiltersState,
  type PaginationState,
  type Row,
  type SortingState,
} from '@tanstack/react-table';
import { AxiosError } from 'axios';
import React from 'react';
import { useTranslation } from 'react-i18next';
import { useDebounce, useInterval } from 'react-use';
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
import { Cell } from './cell';
import { TableActionButton } from './data-table-action-button';
import { DataTableToolbar } from './data-table-toolbar';
import { PaginationControls } from './pagination-controls';
import { ROW_OPEN_FOCUS_RING, RowOpenButton } from './row-open-button';

export interface CardListDataProps {
  url: string;
  /** Colonne usate solo per search/filter/sort della toolbar; opzionali se si usa renderItem */
  columns?: ColumnDef<Values>[];
  /** Render custom della card, come il vecchio ProList renderItem. Se assente, fallback su layout title/subtitle/body via column.meta */
  renderItem?: (item: Values, index: number, items: Values[], reload: () => void) => React.ReactNode;
  /** Sostituisce interamente l'area cards con un render custom guidato dalla lista completa (es. gruppi/aggregazioni). Ha precedenza su renderItem. */
  renderList?: (items: Values[], reload: () => void) => React.ReactNode;
  actionsConfig?: DataTableActionsConfig;
  defaultSearch?: string;
  defaultPageSize?: number;
  sortable?: boolean;
  defaultSort?: SortingState;
  params?: Values;
  onDataChange?: (data: Values[]) => void;
  onChange?: (params: Record<string, unknown>) => void;
  children?: React.ReactNode;
  className?: string;
  defaultFilters?: Values;
  onFiltersChange?: (filters: Values) => void;
  reloadRef?: React.RefObject<(() => void) | null>;
  onRowClick?: (row: Values) => void;
  renderBeforeList?: (items: Values[], reload: () => void) => React.ReactNode;
  fetchEnabled?: boolean;
  /** Frequenza in millisecondi con cui aggiornare i dati */
  apiUpdateInterval?: number;
}

export function CardListData({
  url,
  columns = [],
  renderItem,
  renderList,
  actionsConfig,
  defaultSearch = '',
  defaultPageSize = 100,
  sortable = true,
  defaultSort = [],
  params = {},
  onDataChange,
  onChange,
  children,
  defaultFilters = {},
  onFiltersChange,
  className,
  reloadRef,
  onRowClick,
  renderBeforeList,
  fetchEnabled = true,
  apiUpdateInterval,
}: CardListDataProps) {
  const { makeRequest, setTableParams } = useApi();
  const { t } = useTranslation(['common']);

  const [data, setData] = React.useState<Values[]>([]);
  const [total, setTotal] = React.useState(0);
  const [search, setSearch] = React.useState<string>(defaultSearch ?? '');
  const [sorting, setSorting] = React.useState<SortingState>(defaultSort);
  const [pagination, setPagination] = React.useState<PaginationState>({
    pageIndex: 0,
    pageSize: defaultPageSize,
  });

  const [isLoading, setIsLoading] = React.useState(true);
  const [isRefetching, setIsRefetching] = React.useState(false);

  const [columnFilters, setColumnFilters] = React.useState<ColumnFiltersState>(() =>
    Object.entries(defaultFilters).map(([id, value]) => ({ id, value }))
  );

  const [hasError, setHasError] = React.useState(false);
  const [error, setError] = React.useState<AxiosError | undefined>(undefined);

  useDebounce(
    () => {
      if (fetchEnabled) fetchData();
    },
    400,
    [search, pagination, sorting, columnFilters, fetchEnabled]
  );

  useInterval(() => {
    if (fetchEnabled) fetchData();
  }, apiUpdateInterval ?? null);

  const paramsString = JSON.stringify(params);
  const sortingString = JSON.stringify(sorting);
  const columnFiltersString = JSON.stringify(columnFilters);

  const convertSortToApi = React.useCallback((sorting: SortingState): string[] => {
    return sorting.map((sort) => {
      const prefix = sort.desc ? '-' : '';
      return `${prefix}${sort.id}`;
    });
  }, []);

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

  const columnFiltersToValues = (columnFilters: ColumnFiltersState): Values => {
    const filters: Values = {};
    columnFilters.forEach((filter) => {
      if (filter.value !== undefined && filter.value !== null && filter.value !== '') {
        filters[filter.id] = filter.value;
      }
    });
    return filters;
  };

  const fetchData = React.useCallback(async () => {
    if (!url) return;
    if (hasError) return;

    const parsedParams = JSON.parse(paramsString);
    const parsedSorting = JSON.parse(sortingString);
    const parsedColumnFilters: ColumnFiltersState = JSON.parse(columnFiltersString);

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
    } catch (err: unknown) {
      console.error('CardListData fetch error:', err);

      setHasError(true);
      setError(err as AxiosError);
      setData([]);
      setTotal(0);
    } finally {
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
    onChange,
    sorting,
  ]);

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

  React.useEffect(() => {
    const filtersValues = columnFiltersToValues(columnFilters);
    onFiltersChange?.(filtersValues);
  }, [columnFilters, onFiltersChange]);

  const handleColumnFiltersChange = React.useCallback(
    (updaterOrValue: ColumnFiltersState | ((old: ColumnFiltersState) => ColumnFiltersState)) => {
      setColumnFilters(updaterOrValue);
      setPagination((prev) => ({ ...prev, pageIndex: 0 }));
    },
    []
  );

  const table = useReactTable({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: sortable ? getSortedRowModel() : undefined,
    getPaginationRowModel: getPaginationRowModel(),
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

  const handleSearch = React.useCallback((value: string) => {
    setSearch(value);
    setPagination((prev) => ({ ...prev, pageIndex: 0 }));
  }, []);

  const setFilters = React.useCallback((newFilters: Values) => {
    const newColumnFilters: ColumnFiltersState = Object.entries(newFilters).map(([id, value]) => ({
      id,
      value,
    }));
    setColumnFilters(newColumnFilters);
    setPagination((prev) => ({ ...prev, pageIndex: 0 }));
  }, []);

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

  const resetFilters = React.useCallback(() => {
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
          : t('data_table.pagination.range', {
              defaultValue: '{{rangeStart}}-{{rangeEnd}} of {{total}}',
              rangeStart,
              rangeEnd,
              total,
            });

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
        {renderBeforeList?.(data, fetchData)}

        <div className={cn('w-full relative', className)}>
          <div>
            {children}
            <DataTableToolbar table={table} isLoading={false} onSearch={handleSearch} />
          </div>

          <p role="status" aria-live="polite" aria-atomic="true" className="sr-only">
            {statusMessage}
          </p>

          {isRefetching && (
            <div
              // Announced by the persistent live region above, not by this transient overlay
              aria-hidden="true"
              className="absolute inset-0 backdrop-blur-[2px] flex items-center justify-center z-10"
            >
              <div className="text-center">
                <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-primary" />
                <p className="mt-4 text-primary">{t('data_table.loading')}</p>
              </div>
            </div>
          )}

          {isLoading ? (
            <LoadingCards />
          ) : hasError ? (
            <ApiError
              error={error}
              extra={
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setHasError(false);
                    setError(undefined);
                    fetchData();
                  }}
                >
                  {t('data_table.retry')}
                </Button>
              }
            />
          ) : table.getRowModel().rows?.length ? (
            <>
              <div className="space-y-3">
                {renderList
                  ? renderList(data, fetchData)
                  : table.getRowModel().rows.map((row, index) =>
                      renderItem ? (
                        <React.Fragment key={row.id}>
                          {renderItem(row.original, index, data, fetchData)}
                        </React.Fragment>
                      ) : (
                        <ListCard
                          key={row.id}
                          row={row}
                          onRowClick={onRowClick}
                          actionsConfig={actionsConfig}
                          fetchData={fetchData}
                          handleActionClick={handleActionClick}
                        />
                      )
                    )}
              </div>

              <PaginationControls
                pageIndex={pagination.pageIndex}
                pageSize={pagination.pageSize}
                total={total}
                onPageChange={(pageIndex) => setPagination((prev) => ({ ...prev, pageIndex }))}
                onPageSizeChange={(pageSize) => setPagination({ pageIndex: 0, pageSize })}
              />
            </>
          ) : (
            <div className="border rounded-lg p-8 bg-white">
              <DevnutEmpty />
            </div>
          )}
        </div>
      </DevnutSection.Grid>
    </DataTableContext.Provider>
  );
}

function LoadingCards() {
  const skeletonCards = Array.from({ length: 6 }, (_, i) => i);

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
          </div>
        </div>
      ))}
    </div>
  );
}

interface ListCardProps {
  row: Row<Values>;
  onRowClick?: (row: Values) => void;
  actionsConfig?: DataTableActionsConfig;
  fetchData: () => void;
  handleActionClick: (action: TableAction, row: Values) => void;
}

function ListCard({ row, onRowClick, actionsConfig, fetchData, handleActionClick }: ListCardProps) {
  interface CellWithMeta {
    cell: ReturnType<Row<Values>['getVisibleCells']>[number];
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

    // meta.label (testo leggibile per header JSX/funzione), poi header stringa, poi id
    const metaLabel = (columnDef.meta as { label?: string } | undefined)?.label;
    const label = metaLabel ?? (typeof header === 'string' ? header : cell.column.id);

    return { cell, meta, header: label };
  });

  const visibleCells = cellsWithMeta.filter(({ meta }) => !meta.hideInMobile && !meta.mobileCardHide);

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
        <div className="flex items-center gap-3">
          {leadingCell && (
            <div className="shrink-0">
              <Cell cell={leadingCell.cell} />
            </div>
          )}

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

          {trailingCell && (
            <div className="shrink-0 text-xs text-muted-foreground">
              <Cell cell={trailingCell.cell} />
            </div>
          )}
        </div>

        {bodyCells.length > 0 && (
          <div className="space-y-2 pt-2 border-t">
            {bodyCells.map(({ cell, header }) => (
              <div key={cell.id} className="flex flex-col gap-1">
                <span className="text-xs font-medium text-muted-foreground uppercase">{header}</span>
                <div className="text-sm">
                  <Cell cell={cell} />
                </div>
              </div>
            ))}
          </div>
        )}

        {rowHasVisibleAction(actionsConfig, row.original) && (
          <div className="flex flex-wrap gap-2 items-stretch pt-2 border-t [&>*]:flex-[1_1_6.25rem] [&>*]:min-w-0">
            {actionsConfig?.actions
              ?.filter((action) => isActionVisibleForRow(action, row.original))
              .map((action) => {
                if (action.render) {
                  return <React.Fragment key={action.id}>{action.render(row.original, fetchData)}</React.Fragment>;
                }
                const Icon = action.iconFn ? action.iconFn(row.original) : action.icon;
                return (
                  <TableActionButton
                    key={action.id}
                    variant={action.variant}
                    onClick={() => handleActionClick(action, row.original)}
                    ariaLabel={action.label}
                    className={cn(CARD_ACTION_OUTLINE_CLASS, action.className)}
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
}
