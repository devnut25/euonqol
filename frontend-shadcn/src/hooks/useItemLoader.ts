import { createContext, useContext } from "react";

type ItemLoaderContextValue = {
  mutate: () => void;
};

export const ItemLoaderContext = createContext<ItemLoaderContextValue | null>(null);

export const useItemLoaderContext = () => {
  const values = useContext(ItemLoaderContext);
  if (!values) {
    throw new Error("useItemLoaderContext can only be used inside ItemLoader component");
  }
  return values;
};
