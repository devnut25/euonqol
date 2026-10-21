// RenderCell.tsx
import { useTableConfig } from "@/hooks/useTableConfig";
import React from "react";

type Column = {
  key: string;
  title?: string;
  dataIndex: string;
  valueType?: string;
  render?: (value: any, record?: any) => React.ReactNode;
};

interface CellContentProps {
  value: any;
  record?: any;
  column: Column;
}

export const CellContent = ({ value, record, column }: CellContentProps) => {
  const { valueTypeMap } = useTableConfig();

  // se la colonna fornisce un render custom, usalo
  if (column.render) {
    return <>{column.render(value, record)}</>;
  }

  // se c'è un valueType e abbiamo un renderer per quello, usalo
  if (column.valueType && valueTypeMap?.[column.valueType]) {
    const config = valueTypeMap[column.valueType];
    return <>{config.render({ value, row: record, column })}</>;
  }

  // default
  return <>{value === undefined || value === null ? "" : String(value)}</>;
};
