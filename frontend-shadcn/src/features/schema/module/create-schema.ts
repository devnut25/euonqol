import { z } from 'zod';

export const zModuleCreate = () =>
  z.object({
    name: z.string().min(1, 'Name is required'),
    kitVersionId: z.string().min(1, 'Version is required'),
    patientGroupId: z.string().optional(),
    catSettingId: z.string().optional(),
  });

export type ModuleCreate = z.infer<ReturnType<typeof zModuleCreate>>;
