/**
 * Creates a query string by merging existing params with new ones
 */
export const createQueryString = (
  searchParams: URLSearchParams,
  params: Record<string, string | number | boolean>
): string => {
  const newParams = new URLSearchParams(searchParams.toString());

  Object.entries(params).forEach(([key, value]) => {
    newParams.set(key, String(value));
  });

  return newParams.toString();
};

/**
 * Deletes specific query parameters
 */
export const deleteQueryParams = (
  searchParams: URLSearchParams,
  keys: string[]
): string => {
  const newParams = new URLSearchParams(searchParams.toString());

  keys.forEach((key) => {
    newParams.delete(key);
  });

  return newParams.toString();
};

/**
 * Removes all parameters that start with a specific prefix
 */
export const removeParamsByPrefix = (
  searchParams: URLSearchParams,
  prefix: string
): URLSearchParams => {
  const newParams = new URLSearchParams(searchParams.toString());
  const keysToDelete: string[] = [];

  newParams.forEach((_, key) => {
    if (key.startsWith(prefix)) {
      keysToDelete.push(key);
    }
  });

  keysToDelete.forEach((key) => {
    newParams.delete(key);
  });

  return newParams;
};