import { t } from 'i18next';
import { z } from 'zod';

export const PDF_MAX_SIZE = 5 * 1024 * 1024; // 5MB

/** Optional PDF attachment field, shared by privacy-policies, presentation and
 * study-info-sheet forms. Mirrors the z.instanceof(File) pattern used in
 * features/schema/kit-version/upload-schema.ts. */
export const zPdfField = () =>
  z
    .instanceof(File)
    .refine((f) => f.type === 'application/pdf', t('common:errors.file.invalid_type'))
    .refine((f) => f.size <= PDF_MAX_SIZE, t('common:errors.file.too_large'))
    .optional();
