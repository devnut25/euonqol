import axios from 'axios';
import { Response } from 'express';
import path from 'path';
import { resolveUploadPath } from '../helpers/FileStorage.js';
import { ServiceError } from '../helpers/ServiceError.js';

/** Extension → MIME type. Kept for reference/future non-forced-download uses,
 * but NOT used to answer these download endpoints (see DEFAULT_CONTENT_TYPE). */
const CONTENT_TYPE_BY_EXT: Record<string, string> = {
  '.pdf': 'application/pdf',
  '.doc': 'application/msword',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.xls': 'application/vnd.ms-excel',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  '.csv': 'text/csv',
  '.txt': 'text/plain',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.zip': 'application/zip',
};
const DEFAULT_CONTENT_TYPE = 'application/octet-stream';

/** Hosts an external download is allowed to fetch from — comma-separated in
 * `ALLOWED_DOWNLOAD_HOSTS`. Unset (the default) disables the proxy entirely:
 * nothing in this project serves files externally today, so there's nothing
 * to allowlist yet, and leaving it open by default would make this an
 * unauthenticated open proxy (SSRF risk). */
function getAllowedHosts(): string[] {
  return (process.env.ALLOWED_DOWNLOAD_HOSTS || '')
    .split(',')
    .map((h) => h.trim().toLowerCase())
    .filter(Boolean);
}

export const FileDownloadService = {
  /**
   * Resolves a locally-stored file (under UPLOADS_DIR) for download.
   *
   * Content-Type is always `application/octet-stream`, never the real MIME
   * type (see CONTENT_TYPE_BY_EXT) — WebKit/Safari on iOS ignores
   * `Content-Disposition: attachment` for types it knows how to render
   * in-page (PDF, images) on a direct <a href> navigation, and previews them
   * instead of downloading regardless of that header. Declaring the type as
   * unknown is what actually forces the download there; the correct
   * extension still reaches the client via `Content-Disposition`'s
   * `filename`, which is what Files (iOS) / the download manager (Android)
   * use to recognize the file type — a "correct" Content-Type isn't needed.
   */
  getLocalFile(relativePath: string): { absolutePath: string; contentType: string } {
    const absolutePath = resolveUploadPath(relativePath);
    if (!absolutePath) {
      throw new ServiceError('File not found', 404);
    }
    return { absolutePath, contentType: DEFAULT_CONTENT_TYPE };
  },

  /**
   * Proxies a file from an external host so the browser still receives a
   * same-origin `Content-Disposition: attachment` response. Disabled unless
   * the target host is explicitly allowlisted via `ALLOWED_DOWNLOAD_HOSTS`.
   */
  async streamExternal(url: string, filename: string | undefined, res: Response): Promise<void> {
    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      throw new ServiceError('Invalid url', 400);
    }
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      throw new ServiceError('Invalid url', 400);
    }

    const allowedHosts = getAllowedHosts();
    if (allowedHosts.length === 0 || !allowedHosts.includes(parsed.hostname.toLowerCase())) {
      throw new ServiceError('External downloads are not enabled for this host', 403);
    }

    const downloadName = filename || path.basename(parsed.pathname) || 'download';

    let upstream;
    try {
      upstream = await axios.get(url, {
        responseType: 'stream',
        timeout: 15000,
        maxContentLength: 20 * 1024 * 1024, // 20MB cap
        maxRedirects: 3,
      });
    } catch {
      throw new ServiceError('File not available', 502);
    }

    // Same reasoning as getLocalFile() above: always application/octet-stream,
    // ignoring the upstream's real Content-Type, so iOS Safari downloads
    // instead of previewing.
    res.setHeader('Content-Type', DEFAULT_CONTENT_TYPE);
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${downloadName.replace(/[^\x20-\x7e]/g, '_')}"; filename*=UTF-8''${encodeURIComponent(downloadName)}`
    );

    await new Promise<void>((resolve, reject) => {
      upstream.data.on('error', reject);
      res.on('finish', resolve);
      res.on('error', reject);
      upstream.data.pipe(res);
    });
  },
};
