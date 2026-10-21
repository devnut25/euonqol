import { DevutPasswordInput } from "@/components/DevutPasswordInput";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/tailwind/utils";
import type { ComponentProps, ReactNode } from "react";
import { Controller, type FieldPath, type FieldValues, useFormContext } from "react-hook-form";
import { useFormField } from "@/hooks/useForm";
import type { FieldProps } from "../form-field-controller";
import { FormFieldError } from "../form-field-error";
import { useDescribedBy } from '../use-described-by';
import DevnutSection from "@/components/DevnutSection";

export type FieldPasswordProps<
  TFieldValues extends FieldValues = FieldValues,
  TName extends FieldPath<TFieldValues> = FieldPath<TFieldValues>,
  TTransformedValues = TFieldValues,
> = FieldProps<
  TFieldValues,
  TName,
  TTransformedValues,
  {
    type: "password";
    containerProps?: ComponentProps<"div">;
    /** Pulisce automaticamente l'errore RHF sul campo quando l'utente digita (default true) */
    clearErrorsOnChange?: boolean;
    /** Nodo React renderizzato dentro il campo, accanto al toggle show/hide password */
    endAdornment?: ReactNode;
  } & ComponentProps<typeof Input>
>;

export const FieldPassword = <
  TFieldValues extends FieldValues = FieldValues,
  TName extends FieldPath<TFieldValues> = FieldPath<TFieldValues>,
  TTransformedValues = TFieldValues,
>(
  props: FieldPasswordProps<TFieldValues, TName, TTransformedValues>,
) => {
  const {
    name,
    type,
    disabled,
    defaultValue,
    shouldUnregister,
    control,
    containerProps,
    size: _size,
    clearErrorsOnChange = true,
    ...rest
  } = props;

  const ctx = useFormField();
  const describedBy = useDescribedBy();
  const { clearErrors } = useFormContext();

  // verifico se il campo input passsa la label come props
  // così da terminare larghezza della colonna
  const hasLabel = !!ctx.label;

  return (
    <Controller
      name={name}
      control={control}
      disabled={disabled}
      defaultValue={defaultValue}
      shouldUnregister={shouldUnregister}
      render={({ field, fieldState }) => (
        <DevnutSection.Grid
          {...containerProps}
          className={cn(
            "w-full items-center gap-2 md:gap-0",
            hasLabel ? "grid-cols-1 md:grid-cols-4" : "",
            containerProps?.className,
          )}
        >
          {hasLabel && (
            <Label htmlFor={ctx.id} className="gap-1">
              {ctx.label}
              {ctx.required && (
                <span aria-hidden="true" className="text-destructive">
                  *
                </span>
              )}
            </Label>
          )}
          <div className={cn("w-full", hasLabel ? "col-span-3" : "")}>
            <DevutPasswordInput
              id={ctx.id}
              type={type}
              aria-invalid={fieldState.error ? true : undefined}
              aria-required={ctx.required || undefined}
              aria-label={hasLabel ? undefined : rest.placeholder}
              {...rest}
              // Merged with any ids the caller passes (e.g. a password-requirements hint)
              aria-describedby={describedBy(
                !!fieldState.error,
                (rest as { "aria-describedby"?: string })["aria-describedby"],
              )}
              {...field}
              onChange={(e) => {
                if (clearErrorsOnChange && fieldState.error) {
                  clearErrors(name);
                }
                field.onChange(e);
                rest.onChange?.(e);
              }}
              onBlur={(e) => {
                field.onBlur();
                rest.onBlur?.(e);
              }}
            />
            <FormFieldError />
          </div>
        </DevnutSection.Grid>
      )}
    />
  );
};
