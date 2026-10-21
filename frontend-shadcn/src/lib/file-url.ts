/** Estrae il nome file dall'URL: non esiste sempre un nome file separato lato dati. */
export function filenameFromUrl(url: string): string {
  try {
    const pathname = new URL(url, window.location.origin).pathname;
    return decodeURIComponent(pathname.split('/').pop() || url);
  } catch {
    return url;
  }
}

/**
 * Costruisce l'URL da usare per forzare il download di un file. Gli URL
 * same-origin vanno diretti all'endpoint di download del backend (`?filename=`
 * per il nome mostrato all'utente); gli URL cross-origin passano dal proxy
 * `/euonqol-api/downloads/external` del backend, unico modo per garantire
 * comunque un header `Content-Disposition: attachment` (vedi downloadController.ts).
 */
export function buildDownloadUrl(url: string, filename?: string | null): string {
  const resolvedName = filename || filenameFromUrl(url);
  const isSameOrigin =
    url.startsWith('/') || new URL(url, window.location.origin).origin === window.location.origin;
  if (isSameOrigin) {
    return `${url}${url.includes('?') ? '&' : '?'}filename=${encodeURIComponent(resolvedName)}`;
  }
  return `/euonqol-api/downloads/external?url=${encodeURIComponent(url)}&filename=${encodeURIComponent(resolvedName)}`;
}
