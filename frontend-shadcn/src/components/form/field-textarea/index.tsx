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

export type FieldTextareaProps<
  TFieldValues extends FieldValues = FieldValues,
  TName extends FieldPath<TFieldValues> = FieldPath<TFieldValues>,
  TTransformedValues = TFieldValues,
> = FieldProps<
  TFieldValues,
  TName,
  TTransformedValues,
  {
    type: 'textarea';
    containerProps?: ComponentProps<'div'>;
    /** Pulisce automaticamente l'errore RHF sul campo quando l'utente digita (default true) */
    clearErrorsOnChange?: boolean;
  } & ComponentProps<'textarea'>
>;

export const FieldTextarea = <
  TFieldValues extends FieldValues = FieldValues,
  TName extends FieldPath<TFieldValues> = FieldPath<TFieldValues>,
  TTransformedValues = TFieldValues,
>(
  props: FieldTextareaProps<TFieldValues, TName, TTransformedValues>
) => {
  const {
    name,
    disabled,
    defaultValue,
    shouldUnregister,
    control,
    containerProps,
    size: _size,
    readonly,
    type: _type,
    clearErrorsOnChange = true,
    ...rest
  } = props;

  const ctx = useFormField();
  const describedBy = useDescribedBy();
  const formReadOnly = useFormReadOnly();
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
            <TextareaReadOnly
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
              'w-full items-start gap-2 md:gap-0',
              hasLabel ? 'grid-cols-1 md:grid-cols-4' : '',
              containerProps?.className
            )}
          >
            {hasLabel && (
              <Label htmlFor={ctx.id} className="gap-1 pt-2">
                {ctx.label}
                {ctx.required && (
                  <span aria-hidden="true" className="text-destructive">
                    *
                  </span>
                )}
              </Label>
            )}
            <div className={cn('w-full', hasLabel ? 'md:col-span-3' : '')}>
              <textarea
                id={ctx.id}
                aria-invalid={fieldState.error ? true : undefined}
                aria-describedby={describedBy(!!fieldState.error)}
                aria-required={ctx.required || undefined}
                {...rest}
                {...field}
                value={field.value ?? ''}
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
                className={cn(
                  'flex w-full rounded-md border border-input bg-white px-3 py-2 text-sm shadow-xs placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring resize-y',
                  'aria-invalid:ring-destructive dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive',
                  rest.className
                )}
              />
              <FormFieldError />
            </div>
          </DevnutSection.Grid>
        );
      }}
    />
  );
};

const TextareaReadOnly = <
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
        className={cn('flex justify-between items-start', containerProps?.className)}
      >
        {ctx.label && (
          <Label htmlFor={ctx.id} className="text-primary font-bold pt-0.5">
            {ctx.label}
          </Label>
        )}
        <div
          id={ctx.id}
          aria-describedby={fieldState.error ? ctx.errorId : undefined}
          className="font-light whitespace-pre-wrap text-right"
        >
          {displayValue}
        </div>
      </div>
      <Separator className="mt-2" />
    </>
  );
};
