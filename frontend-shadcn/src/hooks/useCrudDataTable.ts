import { createContext, useContext, type Dispatch, type SetStateAction } from "react";

// Type base semplificato
export type Values = Record<string, any>;

export type CrudDataTableType = "default" | "drawer" | "modal";
interface CrudDataTableActions {
  setLoading: Dispatch<SetStateAction<boolean>>;
  handleChangeItem: (item?: Values) => void;
  reloadTable: () => void;
  handleBack: () => void;
}

interface CrudDataTableContextValue extends CrudDataTableActions {
  item?: Values;
  type: CrudDataTableType;
  loading: boolean;
  open: boolean;
}

export const CrudDataTableContext = createContext<
  CrudDataTableContextValue | undefined
>(undefined);

export const useCrudDataTable = () => {
  const context = useContext(CrudDataTableContext);
  if (!context) {
    throw new Error(
      "useCrudDataTable must be used within a CrudDataTableProvider"
    );
  }
  return context;
};
