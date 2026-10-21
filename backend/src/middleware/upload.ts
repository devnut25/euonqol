import { NextFunction, Request, Response } from 'express';
import multer from 'multer';
import { IMAGE_MAX_SIZE, PDF_MAX_SIZE } from '../helpers/FileStorage.js';

const multerSingle = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: PDF_MAX_SIZE },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype !== 'application/pdf') {
      return cb(new Error('Only PDF files are allowed'));
    }
    cb(null, true);
  },
}).single('pdf');

const multerImage = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: IMAGE_MAX_SIZE },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype !== 'image/png' && file.mimetype !== 'image/jpeg') {
      return cb(new Error('Only PNG or JPEG images are allowed'));
    }
    cb(null, true);
  },
}).single('logo');

/**
 * Shared middleware for optional single-PDF uploads on privacy-policies,
 * presentation and study-info-sheet create/update endpoints. Buffers in memory
 * (files are capped at 5MB, negligible overhead) — FileStorage.savePdf runs the
 * magic-byte + size check again server-side (client-reported mimetype/size here
 * are not trusted alone). Wraps multer's callback-style error so a bad upload
 * surfaces as 400, not the default 500.
 */
export function pdfUpload(req: Request, res: Response, next: NextFunction) {
  multerSingle(req, res, (err: unknown) => {
    if (err) {
      const message = err instanceof Error ? err.message : 'Invalid PDF upload';
      return res.status(400).json({ success: false, message });
    }
    next();
  });
}

/** Single-image upload (field "logo") — used by the institute settings logo upload. */
export function logoUpload(req: Request, res: Response, next: NextFunction) {
  multerImage(req, res, (err: unknown) => {
    if (err) {
      const message = err instanceof Error ? err.message : 'Invalid image upload';
      return res.status(400).json({ success: false, message });
    }
    next();
  });
}
