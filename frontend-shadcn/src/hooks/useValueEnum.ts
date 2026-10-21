import type { Values } from "@/hooks/useCrudDataTable";
import React from "react";

export type ValueOptionsType = Record<
  string,
  {
    label: string;
    value: any;
  }[]
>;

interface ContextProps {
  valueEnum: Values;
  valueOptions: ValueOptionsType;
}

export const ValueEnumContext = React.createContext<ContextProps | undefined>(
  undefined
);

export const useValueEnum = () =>
  React.useContext(ValueEnumContext) as ContextProps;
