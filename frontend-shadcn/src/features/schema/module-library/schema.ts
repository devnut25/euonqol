import { z } from 'zod';

export type ModuleEdit = z.infer<ReturnType<typeof zModuleEdit>>;
export const zModuleEdit = () =>
  z.object({
    name: z.string().min(1, 'Name is required'),
    is_active: z.any().optional(),
    patient_group_id: z.number().optional().nullable(),
  });
