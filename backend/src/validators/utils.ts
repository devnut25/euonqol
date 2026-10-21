import { UserRules } from "../rules/UserRules.js";
import { z } from "zod";
import { commonMessages } from "./messages/common";

const emptyStringAsNull = (input: string) =>
  // Cast null value to string for React Hook Form inference
  input.trim() === "" ? (null as unknown as string) : input.trim();

const emptyStringAsUndefined = (input: string) =>
  // Cast undefined value to string for React Hook Form inference
  input.trim() === "" ? (undefined as unknown as string) : input.trim();

export const zu = {
  fieldText: {
    required: (
      params: Parameters<typeof z.string>[0] = commonMessages.required,
    ) => z.string(params).transform(emptyStringAsNull).pipe(z.string(params)),
    
    nullable: (
      params: Parameters<typeof z.string>[0] = commonMessages.required,
    ) =>
      z
        .string(params)
        .transform(emptyStringAsNull)
        .nullable()
        .pipe(z.string(params).nullable()),
    
    nullish: (
      params: Parameters<typeof z.string>[0] = commonMessages.required,
    ) =>
      z
        .string(params)
        .transform(emptyStringAsNull)
        .nullish()
        .pipe(z.string(params).nullish()),
    
    optional: (
      params: Parameters<typeof z.string>[0] = commonMessages.required,
    ) =>
      z
        .string(params)
        .transform(emptyStringAsUndefined)
        .optional()
        .pipe(z.string(params).optional()),
  },
  uniqueEmail: (options?: { 
    message?: string;
    excludeUserId?: string; // ← ID da escludere
  }) => ({
    validator: async (data: { email: string }) => {
      const exists = await UserRules.emailExists(
        data.email,
        options?.excludeUserId // ← Passa l'ID da escludere
      );
      return !exists;
    },
    message: options?.message || 'Email already exists', // ← Default in inglese
    path: ['email'],
  }),
};
