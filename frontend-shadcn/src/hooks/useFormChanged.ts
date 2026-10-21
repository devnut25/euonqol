import type { FormChanged } from "@/providers/FormChangedContextProvider";
import React, {
  type Dispatch,
  type SetStateAction,
} from "react";

interface ContextProps {
  checkFormChanged: FormChanged;
  setCheckFormChanged: Dispatch<SetStateAction<FormChanged>>;
}

export const FormChangedContext = React.createContext<ContextProps | undefined>(undefined);

export const useFormChangedContext = () => {
  return React.useContext(FormChangedContext);
};
