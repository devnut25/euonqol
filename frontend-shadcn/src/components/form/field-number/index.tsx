import { DevnutInput } from "@/components/DevnutInput";
import { Button } from "@/components/ui/button";
import { ButtonGroup } from "@/components/ui/button-group";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { useFormField } from "@/hooks/useForm";
import { useIsTablet } from "@/hooks/useMediaQuery";
import { useFormReadOnly } from "@/hooks/useFormReadOnly";
import { cn } from "@/lib/tailwind/utils";
import { Minus, Plus } from "lucide-react";
import type { ComponentProps } from "react";
import {
  Controller,
  type ControllerFieldState,
  type ControllerRenderProps,
  type FieldPath,
  type FieldValues,
  useFormContext,
} from "react-hook-form";
import type { FieldProps } from "../form-field-controller";
import { FormFieldError } from "../form-field-error";
import { useDescribedBy } from '../use-described-by';
import DevnutSection from "@/components/DevnutSection";

export type FieldNumberProps<
  TFieldValues extends FieldValues = FieldValues,
  TName extends FieldPath<TFieldValues> = FieldPath<TFieldValues>,
  TTransformedValues = TFieldValues,
> = FieldProps<
  TFieldValues,
  TName,
  TTransformedValues,
  {
    type: "number";
    withControls?: boolean;
    integerOnly?: boolean;
    containerProps?: ComponentProps<"div">;
    /** Pulisce automaticamente l'errore RHF sul campo quando l'utente modifica il valore (default true) */
    clearErrorsOnChange?: boolean;
    /** Nasconde i bottoni −/+ agli screen reader: il campo numerico ha già frecce su/giù da tastiera */
    hideControlsFromAssistiveTech?: boolean;
  } & Omit<ComponentProps<typeof DevnutInput>, "type">
>;

export const FieldNumber = <
  TFieldValues extends FieldValues = FieldValues,
  TName extends FieldPath<TFieldValues> = FieldPath<TFieldValues>,
  TTransformedValues = TFieldValues,
>(
  props: FieldNumberProps<TFieldValues, TName, TTransformedValues>,
) => {
  const {
    name,
    type: _type,
    disabled,
    defaultValue,
    shouldUnregister,
    control,
    containerProps,
    size: _size,
    readonly,
    withControls,
    integerOnly,
    inputHeight,
    clearErrorsOnChange = true,
    hideControlsFromAssistiveTech,
    ...rest
  } = props;

  const ctx = useFormField();
  const describedBy = useDescribedBy();
  const formReadOnly = useFormReadOnly();
  const isTablet = useIsTablet();
  const { clearErrors } = useFormContext();

  const hasLabel = !!ctx.label;
  const finalReadOnly = readonly ?? formReadOnly ?? false;

  return (
    <Controller
      name={name}
      control={control}
      disabled={disabled}
      defaultValue={defaultValue}
      shouldUnregister={shouldUnregister}
      render={({ field, fieldState }) => {
        if (finalReadOnly) {
          return (
            <FieldNumberReadOnly
              containerProps={containerProps}
              fieldState={fieldState}
              field={field}
            />
          );
        }

        const effectiveInputHeight = inputHeight ?? (isTablet ? "xs" : "default");
        const controlButtonSize = effectiveInputHeight === "lg" ? "lg" : effectiveInputHeight === "default" ? "default" : "sm";
        const controlButtonClass = effectiveInputHeight === "xs" ? "h-7 px-3 cursor-pointer rounded-full" : "cursor-pointer rounded-full";

        const step = integerOnly ? 1 : Number(rest.step ?? 1);
        const minVal = rest.min !== undefined ? Number(rest.min) : -Infinity;
        const maxVal = rest.max !== undefined ? Number(rest.max) : Infinity;
        const currentVal = field.value ?? 0;
        // "+" on an empty field starts from min (e.g. 18) instead of 0 → 1 when a min is set
        const incrementFrom = (value: number | null | undefined) =>
          value == null && Number.isFinite(minVal) ? minVal : (value ?? 0) + step;

        const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
          if (clearErrorsOnChange && fieldState.error) {
            clearErrors(name);
          }
          const raw = e.target.value;
          if (raw === "") {
            field.onChange(null);
          } else {
            const num = Number(raw);
            field.onChange(integerOnly ? Math.trunc(num) : num);
          }
          rest.onChange?.(e);
        };

        const sharedInputProps = {
          type: "number" as const,
          id: ctx.id,
          "aria-invalid": fieldState.error ? (true as const) : undefined,
          "aria-required": ctx.required || undefined,
          ...rest,
          // After ...rest so caller-provided ids are merged rather than lost
          "aria-describedby": describedBy(
            !!fieldState.error,
            (rest as { "aria-describedby"?: string })["aria-describedby"],
          ),
          ...field,
          inputHeight,
          step: integerOnly ? 1 : rest.step,
          value: field.value ?? "",
          onChange: handleChange,
          onBlur: (e: React.FocusEvent<HTMLInputElement>) => {
            field.onBlur();
            rest.onBlur?.(e);
          },
          className: cn(
            "[appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none",
            rest.className,
          ),
        };

        return (
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
            <div className={cn("w-full", hasLabel ? "md:col-span-3" : "")}>
              {withControls ? (
                <ButtonGroup className="w-full">
                  <Button
                    type="button"
                    size={controlButtonSize}
                    variant="default"
                    className={controlButtonClass}
                    aria-label={`Decrease${ctx.label ? ` ${ctx.label}` : ""}`}
                    aria-hidden={hideControlsFromAssistiveTech || undefined}
                    tabIndex={hideControlsFromAssistiveTech ? -1 : undefined}
                    disabled={field.disabled || currentVal <= minVal}
                    onClick={() => {
                      if (clearErrorsOnChange && fieldState.error) {
                        clearErrors(name);
                      }
                      field.onChange(Math.max(minVal, currentVal - step));
                    }}
                  >
                    <Minus className="h-4 w-4" />
                  </Button>
                  <DevnutInput
                    {...sharedInputProps}
                    className={cn("text-center", sharedInputProps.className)}
                  />
                  <Button
                    type="button"
                    size={controlButtonSize}
                    variant="default"
                    className={controlButtonClass}
                    aria-label={`Increase${ctx.label ? ` ${ctx.label}` : ""}`}
                    aria-hidden={hideControlsFromAssistiveTech || undefined}
                    tabIndex={hideControlsFromAssistiveTech ? -1 : undefined}
                    disabled={field.disabled || currentVal >= maxVal}
                    onClick={() => {
                      if (clearErrorsOnChange && fieldState.error) {
                        clearErrors(name);
                      }
                      field.onChange(Math.min(maxVal, incrementFrom(field.value)));
                    }}
                  >
                    <Plus className="h-4 w-4" />
                  </Button>
                </ButtonGroup>
              ) : (
                <DevnutInput {...sharedInputProps} />
              )}
              <FormFieldError />
            </div>
          </DevnutSection.Grid>
        );
      }}
    />
  );
};

export const FieldNumberReadOnly = <
  TFieldValues extends FieldValues = FieldValues,
  TName extends FieldPath<TFieldValues> = FieldPath<TFieldValues>,
>({
  containerProps,
  fieldState,
  field,
}: {
  containerProps?: ComponentProps<"div">;
  fieldState: ControllerFieldState;
  field: ControllerRenderProps<TFieldValues, TName>;
}) => {
  const ctx = useFormField();

  const displayValue =
    field.value === undefined || field.value === null || field.value === ""
      ? "—"
      : String(field.value);

  return (
    <>
      <div
        {...containerProps}
        className={cn(
          "flex flex-col items-start gap-1 md:flex-row md:justify-between md:gap-4 md:items-center",
          containerProps?.className,
        )}
      >
        {ctx.label && (
          <Label htmlFor={ctx.id} className="text-primary font-bold shrink-0">
            {ctx.label}
          </Label>
        )}
        <div
          id={ctx.id}
          aria-describedby={fieldState.error ? ctx.errorId : undefined}
          className="w-full min-w-0 break-words font-light md:w-auto md:ml-auto md:text-right"
        >
          {displayValue}
        </div>
      </div>
      <Separator className="mt-2" />
    </>
  );
};
