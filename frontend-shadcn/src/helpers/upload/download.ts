import apiClient from '@/api/client';

function filenameFromContentDisposition(contentDisposition?: string): string | null {
  if (!contentDisposition) return null;
  const utf8Match = contentDisposition.match(/filename\*=UTF-8''([^;]+)/i);
  if (utf8Match) return decodeURIComponent(utf8Match[1]);
  const quotedMatch = contentDisposition.match(/filename="([^"]+)"/i);
  if (quotedMatch) return quotedMatch[1];
  const plainMatch = contentDisposition.match(/filename=([^;]+)/i);
  return plainMatch ? plainMatch[1].trim() : null;
}

/**
 * Fetches `url` as a blob and triggers a browser download.
 * Uses the server's `Content-Disposition` filename when present, falling back to `filename`.
 */
export async function downloadBlobFile(url: string, filename: string): Promise<void> {
  try {
    const response = await apiClient.get(url, { responseType: 'blob' });
    const resolvedFilename =
      filenameFromContentDisposition(response.headers?.['content-disposition']) ?? filename;
    const objectUrl = window.URL.createObjectURL(response.data as Blob);
    const a = document.createElement('a');
    a.href = objectUrl;
    a.download = resolvedFilename;
    a.click();
    window.URL.revokeObjectURL(objectUrl);
  } catch {
    // silently fail — user will see nothing downloaded
  }
}
