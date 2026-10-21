import { zu } from '@/lib/zod/utils';
import { z } from 'zod';

export type FormFieldsInstituteSettings = z.infer<ReturnType<typeof zFormFieldsInstituteSettings>>;

export const zFormFieldsInstituteSettings = () =>
  z.object({
    name: zu.fieldText.required(),
    address: zu.fieldText.required(),
    city: zu.fieldText.required(),
    country: zu.fieldText.required(),
    note: zu.fieldText.optional(),
    email: zu.fieldText.optional(),
    phone: zu.fieldText.optional(),
    referentName: zu.fieldText.optional(),
    logo: z.any().optional(),
  });
