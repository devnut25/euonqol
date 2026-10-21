import { z } from 'zod';

export const zKitVersion = () =>
  z.object({
    id: z.union([z.string(), z.number()]).optional(),
    name: z.string().optional(),
    created_at: z.string().optional(),
    updated_at: z.string().optional(),
    question_count: z
      .object({
        total: z.number().optional(),
        static: z.number().optional(),
        cat: z.number().optional(),
      })
      .optional(),
    is_active: z.boolean().optional(),
  });

export type KitVersion = z.infer<ReturnType<typeof zKitVersion>>;
