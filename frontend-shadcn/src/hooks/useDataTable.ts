import {
  type ColumnFiltersState,
  getCoreRowModel,
  getFilteredRowModel,  
  getSortedRowModel,     
  getPaginationRowModel,
  type PaginationState,
  type RowSelectionState,
  type SortingState,
  type TableOptions,
  useReactTable,
  type VisibilityState,
} from "@tanstack/react-table";
import * as React from "react";
import type { Values } from "./useCrudDataTable";
import { t } from "i18next";

interface UseDataTableProps<TData>
  extends Omit<
    TableOptions<TData>,
    | "state"
    | "getCoreRowModel"
    | "manualFiltering"
    | "manualPagination"
    | "manualSorting"
  > {
  pageCount?: number;
  onTableChange?: (params: {
    pagination: PaginationState;
    sorting: SortingState;
    filters: ColumnFiltersState;
  }) => void;
  debounceMs?: number;
  initialState?: Partial<{
    sorting: SortingState;
    columnVisibility: VisibilityState;
    rowSelection: RowSelectionState;
    pagination: PaginationState;
  }>;
  // ← Aggiungi questo flag per controllare se usare filtraggio manuale o automatico
  manualMode?: boolean;
}

export function useDataTable<TData>(props: UseDataTableProps<TData>) {
  "use no memo";
  const {
    columns,
    data,
    pageCount,
    onTableChange,
    debounceMs = 300,
    initialState,
    manualMode = false, // Default: filtraggio automatico
    ...tableProps
  } = props;

  const [pagination, setPagination] = React.useState<PaginationState>(
    initialState?.pagination ?? {
      pageIndex: 0,
      pageSize: 100,
    }
  );
  const [sorting, setSorting] = React.useState<SortingState>(
    initialState?.sorting ?? []
  );
  const [columnFilters, setColumnFilters] = React.useState<ColumnFiltersState>([]);
  const [rowSelection, setRowSelection] = React.useState<RowSelectionState>(
    initialState?.rowSelection ?? {}
  );
  const [columnVisibility, setColumnVisibility] = React.useState<VisibilityState>(
    initialState?.columnVisibility ?? {}
  );

  const debouncedFilters = React.useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const prevFiltersRef = React.useRef<ColumnFiltersState>(columnFilters);

  // Solo se in modalità manuale, notifica i cambiamenti
  React.useEffect(() => {
    if (!manualMode || !onTableChange) return;

    const filtersChanged =
      JSON.stringify(prevFiltersRef.current) !== JSON.stringify(columnFilters);

    if (filtersChanged) {
      prevFiltersRef.current = columnFilters;

      if (debouncedFilters.current) {
        clearTimeout(debouncedFilters.current);
      }

      debouncedFilters.current = setTimeout(() => {
        onTableChange({
          pagination,
          sorting,
          filters: columnFilters,
        });
      }, debounceMs);
    } else {
      onTableChange({
        pagination,
        sorting,
        filters: columnFilters,
      });
    }

    return () => {
      if (debouncedFilters.current) {
        clearTimeout(debouncedFilters.current);
      }
    };
  }, [pagination, sorting, columnFilters, onTableChange, debounceMs, manualMode]);

  const table = useReactTable({
    ...tableProps,
    data,
    columns,
    pageCount: pageCount ?? Math.ceil(data.length / pagination.pageSize),
    state: {
      pagination,
      sorting,
      columnVisibility,
      rowSelection,
      columnFilters,
    },
    enableRowSelection: true,
    onRowSelectionChange: setRowSelection,
    onPaginationChange: setPagination,
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    onColumnVisibilityChange: setColumnVisibility,
    getCoreRowModel: getCoreRowModel(),
    // Se non è manuale, aggiungi i modelli automatici
    getFilteredRowModel: manualMode ? undefined : getFilteredRowModel(),
    getSortedRowModel: manualMode ? undefined : getSortedRowModel(),
    getPaginationRowModel: manualMode ? undefined : getPaginationRowModel(),
    // Imposta i flag manuali
    manualPagination: manualMode,
    manualSorting: manualMode,
    manualFiltering: manualMode,
  });

  return { table };
}
export interface DataTableContextProps {
  setCurrentPage: (page: number) => void;
  filters: Values;
  setFilters: (filters: Values) => void;
  setFilter: (key: string, value: unknown) => void;
  resetFilters: () => void;
  /** Filters restored by resetFilters (mobile drawer "Clear" resets its draft to these) */
  defaultFilters?: Values;
  reload: () => void;
  searchValue: string;
}

export const DataTableContext = React.createContext<DataTableContextProps | undefined>(
  undefined,
);

export const useDataTableContext = () => {
  const context = React.useContext(DataTableContext);
  if (!context) {
    throw new Error(t("data_table.context"));
  }
  return context;
};