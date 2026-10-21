import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { ServiceError } from './ServiceError.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** Root directory for user-uploaded files, served publicly via express.static
 * (see server.ts). Mirrors the `TEMPLATES_DIR` pattern in kitController.ts. */
export const UPLOADS_DIR = path.resolve(__dirname, '../../data/uploads');

export const PDF_MAX_SIZE = 5 * 1024 * 1024; // 5MB
export const IMAGE_MAX_SIZE = 2 * 1024 * 1024; // 2MB

const PDF_MAGIC_BYTES = Buffer.from('%PDF-');

const IMAGE_SIGNATURES: { magic: Buffer; extension: string }[] = [
  { magic: Buffer.from([0x89, 0x50, 0x4e, 0x47]), extension: 'png' }, // PNG
  { magic: Buffer.from([0xff, 0xd8, 0xff]), extension: 'jpg' }, // JPEG
];

/**
 * Persists a PDF buffer to disk under `UPLOADS_DIR/<entityDir>/` and returns the
 * public path it will be served at (mounted at `${API_PREFIX}/uploads` in server.ts).
 * The DB only ever stores this public path — never the file content.
 */
export function savePdf(entityDir: string, buffer: Buffer): string {
  if (buffer.length > PDF_MAX_SIZE) {
    throw new ServiceError('PDF exceeds the 5MB size limit', 400);
  }
  if (!buffer.subarray(0, 5).equals(PDF_MAGIC_BYTES)) {
    // Defense in depth: the client-reported MIME type is spoofable, so verify
    // the actual file signature before trusting it's a real PDF.
    throw new ServiceError('File is not a valid PDF', 400);
  }

  const dir = path.join(UPLOADS_DIR, entityDir);
  fs.mkdirSync(dir, { recursive: true });

  const filename = `${crypto.randomBytes(16).toString('hex')}.pdf`;
  fs.writeFileSync(path.join(dir, filename), buffer);

  return `/euonqol-api/uploads/${entityDir}/${filename}`;
}

/**
 * Persists an image buffer (PNG or JPEG only) to disk under `UPLOADS_DIR/<entityDir>/`
 * and returns its public path, same contract as {@link savePdf}.
 */
export function saveImage(entityDir: string, buffer: Buffer): string {
  if (buffer.length > IMAGE_MAX_SIZE) {
    throw new ServiceError('Image exceeds the 2MB size limit', 400);
  }

  const signature = IMAGE_SIGNATURES.find((s) =>
    buffer.subarray(0, s.magic.length).equals(s.magic)
  );
  if (!signature) {
    throw new ServiceError('File is not a valid PNG or JPEG image', 400);
  }

  const dir = path.join(UPLOADS_DIR, entityDir);
  fs.mkdirSync(dir, { recursive: true });

  const filename = `${crypto.randomBytes(16).toString('hex')}.${signature.extension}`;
  fs.writeFileSync(path.join(dir, filename), buffer);

  return `/euonqol-api/uploads/${entityDir}/${filename}`;
}

/**
 * Resolves a path relative to `UPLOADS_DIR`, guarding against path traversal
 * and hidden files (mirrors the old `express.static({ dotfiles: 'deny' })`
 * behavior — see downloadController.ts, the current consumer).
 * Returns null if the resolved path escapes `UPLOADS_DIR`, is a dotfile, or
 * doesn't exist on disk.
 */
export function resolveUploadPath(relative: string): string | null {
  const resolved = path.resolve(UPLOADS_DIR, relative);
  if (!resolved.startsWith(UPLOADS_DIR)) return null;
  if (path.basename(resolved).startsWith('.')) return null;
  if (!fs.existsSync(resolved)) return null;
  return resolved;
}

/**
 * Copies a previously saved PDF into a new physical file under `entityDir`, so the
 * copy is fully independent from the source (deleting one never affects the other).
 * Returns the new public path, or null if `pdfUrl` is empty or the source file no
 * longer exists on disk. The original `pdf_filename` stays valid as-is — only the
 * physical file and its public path change, the display filename is unaffected.
 */
export function copyPdf(pdfUrl: string | null | undefined, entityDir: string): string | null {
  if (!pdfUrl) return null;
  const prefix = '/euonqol-api/uploads/';
  if (!pdfUrl.startsWith(prefix)) {
    console.warn('[copyPdf] pdfUrl does not start with expected prefix, skipping copy', {
      pdfUrl,
      entityDir,
      expectedPrefix: prefix,
    });
    return null;
  }

  const relative = pdfUrl.slice(prefix.length);
  const sourcePath = resolveUploadPath(relative);
  if (!sourcePath) {
    console.warn('[copyPdf] source file missing on disk, skipping copy', {
      pdfUrl,
      entityDir,
      attemptedPath: path.resolve(UPLOADS_DIR, relative),
    });
    return null;
  }

  const buffer = fs.readFileSync(sourcePath);
  const newUrl = savePdf(entityDir, buffer);
  console.debug('[copyPdf] copied', { from: pdfUrl, to: newUrl });
  return newUrl;
}

/** Best-effort delete of a previously saved upload (PDF, image, …), given its public path. Never throws. */
export function deleteUploadedFile(fileUrl: string | null | undefined): void {
  if (!fileUrl) return;
  const prefix = '/euonqol-api/uploads/';
  if (!fileUrl.startsWith(prefix)) return;

  const relative = fileUrl.slice(prefix.length);
  const resolved = path.resolve(UPLOADS_DIR, relative);
  // Guard against path traversal — resolved path must stay inside UPLOADS_DIR.
  if (!resolved.startsWith(UPLOADS_DIR)) return;

  try {
    fs.unlinkSync(resolved);
  } catch {
    // ENOENT or similar — file already gone, nothing to do.
  }
}
