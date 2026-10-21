import { t } from 'i18next';
import { z } from 'zod';

const emptyStringAsNull = (input: string) =>
  // Cast null value to string for React Hook Form inference
  input.trim() === '' ? (null as unknown as string) : input.trim();

const emptyStringAsUndefined = (input: string) =>
  // Cast undefined value to string for React Hook Form inference
  input.trim() === '' ? (undefined as unknown as string) : input.trim();

// Tiptap emette "<p></p>" su editor vuoto: serve spogliare i tag per capire se c'è testo reale
const isEmptyHtml = (html: string) => html.replace(/<[^>]*>/g, '').trim() === '';

type ErrorParam = string | { error: string };

const toMessage = (param: ErrorParam): string =>
  typeof param === 'string' ? param : param.error;

export const zu = {
  fieldText: {
    required: (param: ErrorParam = t('common:errors.required')) => {
      const message = toMessage(param);
      return z
        .string({ error: message })
        .transform(emptyStringAsNull)
        .pipe(z.string({ error: message }));
    },
    nullable: (param: ErrorParam = t('common:errors.required')) => {
      const message = toMessage(param);
      return z
        .string({ error: message })
        .transform(emptyStringAsNull)
        .nullable()
        .pipe(z.string({ error: message }).nullable());
    },
    nullish: (param: ErrorParam = t('common:errors.required')) => {
      const message = toMessage(param);
      return z
        .string({ error: message })
        .transform(emptyStringAsNull)
        .nullish()
        .pipe(z.string({ error: message }).nullish());
    },
    optional: (param: ErrorParam = t('common:errors.required')) => {
      const message = toMessage(param);
      return z
        .string({ error: message })
        .transform(emptyStringAsUndefined)
        .optional()
        .pipe(z.string({ error: message }).optional());
    },
  },
  richText: {
    required: (param: ErrorParam = t('common:errors.required')) => {
      const message = toMessage(param);
      return z
        .string({ error: message })
        .refine((val) => !isEmptyHtml(val), { error: message });
    },
  },
};
