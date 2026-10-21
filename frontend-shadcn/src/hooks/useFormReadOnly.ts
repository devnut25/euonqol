import { createContext, useContext } from "react";

const FormReadOnlyContext = createContext<boolean | undefined>(undefined);

export const FormReadOnlyProvider = FormReadOnlyContext.Provider;

export const useFormReadOnly = (): boolean | undefined => {
  return useContext(FormReadOnlyContext);
};
