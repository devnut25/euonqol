import { useValueEnum } from '@/hooks/useValueEnum';
import { flexRender } from '@tanstack/react-table';
import { CellContent } from './cell-content';

export function Cell<TData = any>({ cell }: { cell: any }) {
  const columnDef = cell.column.columnDef as Record<string, any>;
  const row = cell.row.original as TData;
  const value = cell.getValue();
  const { valueEnum } = useValueEnum();

  const valueType =
    columnDef?.meta?.valueType ?? columnDef?.meta?.valueTypeName ?? columnDef?.valueType;

  if (valueType) {
    const adapterColumn = {
      key: cell.column.id,
      title: columnDef.header ?? cell.column.id,
      dataIndex: columnDef.accessorKey ?? cell.column.id,
      valueType,
      columnDef,
    };
    return <CellContent value={value} record={row} column={adapterColumn} />;
  }

  const valueEnumKey = columnDef?.meta?.valueEnum;
  if (valueEnumKey && valueEnum[valueEnumKey]) {
    const label = valueEnum[valueEnumKey][String(value)];
    return <>{label ?? String(value ?? '')}</>;
  }

  // Fallback centralizzato per value null (API risponde null) sulle celle custom
  if (value === null) return <span>-</span>;

  // Custom cell fn (user-defined) or TanStack default renderer
  return <>{flexRender(columnDef.cell, cell.getContext())}</>;
}
