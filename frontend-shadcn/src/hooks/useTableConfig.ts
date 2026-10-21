import React from "react";

export type ValueTypeRender<TData = any> = (props: {
  value: any;
  row: TData;
  column: any;
}) => React.ReactNode;

export type ValueTypeConfig = {
  render: ValueTypeRender;
  defaultProps?: Record<string, any>;
};

export interface TableConfigContextValue {
  valueTypeMap: Record<string, ValueTypeConfig>;
}

export const TableConfigContext = React.createContext<TableConfigContextValue | null>(null);

export const useTableConfig = () => {
  const context = React.useContext(TableConfigContext);
  if (!context) {
    throw new Error("useTableConfig must be used within TableConfigProvider");
  }
  return context;
};
