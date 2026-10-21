// src/hooks/useApi.ts  (o dove hai il file)
import { useCallback, useState } from "react";
import apiClient from "@/api/client";
import type { Values } from "@/hooks/useCrudDataTable";

export interface TableParams {
  pagination?: {
    current: number;
    pageSize: number;
    total?: number;
  };
  sort?: string[];
  search?: string;
  filter?: Record<string, unknown>;
}

export const fetcher = (url: string, params?: Values) =>
  apiClient.get(url, { params }).then(res => res.data);

export interface UseApiOptions {
  defaultIsLoading?: boolean;
  onError?: (error: any) => void;
  onSuccess?: (data: any) => void;
}

export const useApi = (options: UseApiOptions = {}) => {
  const { defaultIsLoading = false, onError, onSuccess } = options;

  const [isLoading, setIsLoading] = useState(defaultIsLoading);
  const [data, setData] = useState<any>(undefined);
  const [error, setError] = useState<any>(null);
  const [tableParams, setTableParams] = useState<TableParams>({
    pagination: { current: 1, pageSize: 10 },
  });

  const makeRequest = useCallback(
    async (
      url: string,
      method: "get" | "post" | "put" | "delete" | "patch" = "get",
      params: any = null
    ) => {
      setIsLoading(true);
      setError(null);

      try {
        const requestConfig =
          method === "get"
            ? { params }
            : params == null
              ? {}
              : { data: params };
        const formattedConfig = JSON.parse(JSON.stringify(requestConfig, (_, value) => (value === undefined ? null : value)));

        const response = await apiClient.request({
          method,
          url,
          ...formattedConfig,
        });

        setData(response.data);
        onSuccess?.(response.data);
        return response.data;
      } catch (err: any) {
        const errorData = err?.response?.data?.message || err?.response?.data?.error || err?.message || err;
        setError(errorData);
        setData(undefined);
        onError?.(errorData);
        return Promise.reject(errorData);
      } finally {
        setIsLoading(false);
      }
    },
    [onError, onSuccess]
  );

  const resetData = () => {
    setData(undefined);
    setError(null);
  };

  return {
    makeRequest,
    tableParams,
    setTableParams,
    isLoading,
    setIsLoading,
    resetData,
    data,
    error,
  };
};