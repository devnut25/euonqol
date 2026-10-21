import { NextFunction, Request, Response } from 'express';
import path from 'path';
import { ServiceError } from '../helpers/ServiceError.js';
import { FileDownloadService } from '../services/FileDownloadService.js';

function handleError(res: Response, next: NextFunction, err: unknown, fallback: string): Response | void {
  if (err instanceof ServiceError) {
    return res.status(err.statusCode).json({ success: false, message: err.message });
  }
  console.error(fallback, err);
  return next(err);
}

/**
 * GET /euonqol-api/uploads/*
 * Forces a download (Content-Disposition: attachment) of a locally-stored
 * upload (privacy policy / presentation / study info sheet PDFs today).
 * Public — no `authenticate` — patients reach these via unauthenticated
 * `/public/...` links. `?filename=` overrides the download name shown to the
 * user (the on-disk name is a random hex, see FileStorage.savePdf).
 */
export async function downloadUpload(req: Request, res: Response, next: NextFunction) {
  try {
    // Express 5 (path-to-regexp v8) named wildcard `*splat` captures the
    // remainder as an array of path segments rather than a single string.
    const splat = (req.params as any).splat;
    const relative = Array.isArray(splat) ? splat.join('/') : String(splat ?? '');
    const filename = typeof req.query.filename === 'string' ? req.query.filename : undefined;
    const { absolutePath, contentType } = FileDownloadService.getLocalFile(relative);
    res.setHeader('Content-Type', contentType);
    res.download(absolutePath, filename || path.basename(absolutePath), (err) => {
      if (err && !res.headersSent) handleError(res, next, err, 'Failed to download file');
      else if (err) next(err);
    });
  } catch (err) {
    return handleError(res, next, err, 'Failed to download file');
  }
}

/**
 * GET /euonqol-api/downloads/external?url=...&filename=...
 * Proxies a file hosted on an external domain, forwarding it with a forced
 * `Content-Disposition: attachment` so the browser downloads rather than
 * navigates. Disabled unless the target host is allowlisted via
 * `ALLOWED_DOWNLOAD_HOSTS` — see FileDownloadService.
 */
export async function downloadExternal(req: Request, res: Response, next: NextFunction) {
  try {
    const url = typeof req.query.url === 'string' ? req.query.url : undefined;
    const filename = typeof req.query.filename === 'string' ? req.query.filename : undefined;
    if (!url) {
      return res.status(400).json({ success: false, message: 'Missing url query parameter' });
    }
    await FileDownloadService.streamExternal(url, filename, res);
  } catch (err) {
    return handleError(res, next, err, 'Failed to proxy external file');
  }
}
