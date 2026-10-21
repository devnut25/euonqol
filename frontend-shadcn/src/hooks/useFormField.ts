import React from "react";
import type { ControllerProps, FieldPath, FieldValues } from "react-hook-form";

export type FormFieldControllerContextValue<
  TFieldValues extends FieldValues = FieldValues,
  TName extends FieldPath<TFieldValues> = FieldPath<TFieldValues>,
  TTransformedValues = TFieldValues
> = Required<
  Pick<
    ControllerProps<TFieldValues, TName, TTransformedValues>,
    "control" | "name"
  >
> & {
  displayError?: boolean;
};

export const FormFieldControllerContext =
  React.createContext<FormFieldControllerContextValue | null>(null);