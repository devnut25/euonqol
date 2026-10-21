import type { Item } from "@/types/crud-data-table";
import { useEffect } from "react";
import type { ReactNode } from "react";
import { ItemLoaderContext } from "../hooks/useItemLoader";
import { ApiError } from "./ApiError";
import { Spinner } from "./ui/spinner";
import { useGetItem } from "@/hooks/useGetItem";

interface ItemLoaderProps<T = Item> {
  url: string;
  children(item: T, mutate: Function): ReactNode;
  onItemChange?: (item: NoInfer<T>) => void;
  params?: Record<any, any>;
}

/**
 * Questo componente gestisce il recupero di un singolo elemento tramite API.
 * Nel caso in cui l'API restituisca un errore, verrà mostrato un messaggio di errore.
 * In caso di successo, il contenuto verrà inserito all'interno di un provider di policy
 * in modo da trasmettere le policy ai componenti figli.
 */
export const ItemLoader = <T = Item,>({
  url,
  children,
  onItemChange,
  params,
}: ItemLoaderProps<T>) => {
  const { item, isLoading, error, setParams, mutate } = useGetItem(url, params);

  useEffect(() => {
    setParams(params);
  }, [params, setParams]);

  useEffect(() => {
    onItemChange?.(item as T);
  }, [item, onItemChange]);

  if (isLoading) {
    return (
      <div className="w-full flex justify-center mt-33">
        <Spinner />
      </div>
    );
  }

  if (error) return <ApiError error={error} />;

  return (
    <ItemLoaderContext.Provider value={{ mutate }}>
      {(() => children(item as T, mutate))()}
    </ItemLoaderContext.Provider>
  );
};

