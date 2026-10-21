import { FormChangedContext } from "@/hooks/useFormChanged";
import { useState, type PropsWithChildren } from "react";

export interface FormChanged {
  [key: string]: () => boolean;
}

export const FormChangedContextProvider = ({ children }: PropsWithChildren) => {
  const [checkFormChanged, setCheckFormChanged] = useState<FormChanged>({});

  return (
    <FormChangedContext.Provider value={{ checkFormChanged, setCheckFormChanged }}>
      {children}
    </FormChangedContext.Provider>
  );
};