import { useApi } from '@/hooks/useApi';
import { useEffect, useMemo } from 'react';

/** Options (`id` → value, `labelKey` → label, default `name`) loaded from `url`, all pages. */
export function useApiOptions(url: string, labelKey = 'name') {
  const { makeRequest, data, isLoading } = useApi();

  useEffect(() => {
    makeRequest(url, 'get', { per_page: -1 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url]);

  const options = useMemo(
    () =>
      ((data?.data ?? []) as Record<string, any>[]).map((item) => ({
        label: String(item[labelKey] ?? ''),
        value: String(item.id),
      })),
    [data, labelKey]
  );

  return { options, isLoading };
}
