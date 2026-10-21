import { useEffect, useState } from "react";
import { useApi } from "./useApi";
import type { Values } from "./useCrudDataTable";

export const useGetItem = (
  url: string,
  defaultParams?: Values,
  onSuccess?: (resp: any) => void,
  onError?: (resp: any) => void
) => {
  const [params, setParams] = useState(defaultParams);
  const { makeRequest, isLoading, data, error } = useApi();

  useEffect(() => {
    if (url) makeRequest(url, "get", params).then(onSuccess).catch(onError);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url, params]);

  const mutate = () => {
    if (url) return makeRequest(url, "get", params).then(onSuccess).catch(onError);
  };

  return {
    params,
    setParams,
    mutate,
    item: data?.data,
    pagination: data?.meta,
    isLoading,
    error,
  };
};
