import { DevnutInput } from '@/components/DevnutInput';
import DevnutSection from '@/components/DevnutSection';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { useFormField } from '@/hooks/useForm';
import { useFormReadOnly } from '@/hooks/useFormReadOnly';
import { cn } from '@/lib/tailwind/utils';
import type { ComponentProps } from 'react';
import {
  Controller,
  type ControllerFieldState,
  type ControllerRenderProps,
  type FieldPath,
  type FieldValues,
  useFormContext,
} from 'react-hook-form';
import type { FieldProps } from '../form-field-controller';
import { FormFieldError } from '../form-field-error';
import { useDescribedBy } from '../use-described-by';

export type FieldTextProps<
  TFieldValues extends FieldValues = FieldValues,
  TName extends FieldPath<TFieldValues> = FieldPath<TFieldValues>,
  TTransformedValues = TFieldValues,
> = FieldProps<
  TFieldValues,
  TName,
  TTransformedValues,
  {
    type: 'text' | 'email' | 'tel';
    containerProps?: ComponentProps<'div'>;
    /** Pulisce automaticamente l'errore RHF sul campo quando l'utente digita (default true) */
    clearErrorsOnChange?: boolean;
  } & ComponentProps<typeof DevnutInput>
>;

export const FieldText = <
  TFieldValues extends FieldValues = FieldValues,
  TName extends FieldPath<TFieldValues> = FieldPath<TFieldValues>,
  TTransformedValues = TFieldValues,
>(
  props: FieldTextProps<TFieldValues, TName, TTransformedValues>
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
    readonly,
    clearErrorsOnChange = true,
    ...rest
  } = props;

  const ctx = useFormField();
  const describedBy = useDescribedBy();
  const formReadOnly = useFormReadOnly();
  const { clearErrors } = useFormContext();

  // verifico se il campo input passsa la label come props
  // così da terminare larghezza della colonna
  const hasLabel = !!ctx.label;

  // finalReadOnly lo calcoliamo qui (vale per il field)
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
            <DevnutInputReadOnly
              containerProps={containerProps}
              fieldState={fieldState}
              field={field}
            />
          );
        }

        return (
          <DevnutSection.Grid
            {...containerProps}
            className={cn(
              'w-full items-center gap-2 md:gap-0',
              hasLabel ? 'grid-cols-1 md:grid-cols-4' : '',
              containerProps?.className
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
            <div className={cn('w-full', hasLabel ? 'md:col-span-3' : '')}>
              <DevnutInput
                type={type}
                id={ctx.id}
                aria-invalid={fieldState.error ? true : undefined}
                aria-required={ctx.required || undefined}
                aria-label={hasLabel ? undefined : rest.placeholder}
                {...rest}
                // Merged with any ids the caller passes (e.g. a password-requirements hint)
                aria-describedby={describedBy(
                  !!fieldState.error,
                  (rest as { 'aria-describedby'?: string })['aria-describedby']
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
        );
      }}
    />
  );
};

export const DevnutInputReadOnly = <
  TFieldValues extends FieldValues = FieldValues,
  TName extends FieldPath<TFieldValues> = FieldPath<TFieldValues>,
>({
  containerProps,
  fieldState,
  field,
}: {
  containerProps?: ComponentProps<'div'>;
  fieldState: ControllerFieldState;
  field: ControllerRenderProps<TFieldValues, TName>;
}) => {
  const ctx = useFormField();

  const displayValue =
    field.value === undefined || field.value === null || field.value === ''
      ? '—'
      : String(field.value);

  return (
    <>
      <div
        {...containerProps}
        className={cn('flex justify-between items-center', containerProps?.className)}
      >
        {ctx.label && (
          <Label htmlFor={ctx.id} className="text-primary font-bold">
            {ctx.label}
          </Label>
        )}
        <div
          id={ctx.id}
          aria-describedby={fieldState.error ? ctx.errorId : undefined}
          className="ml-auto font-light"
        >
          {displayValue}
        </div>
      </div>
      <Separator className="mt-2" />
    </>
  );
};
