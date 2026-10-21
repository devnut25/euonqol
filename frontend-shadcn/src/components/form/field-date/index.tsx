import { DevnutDatePicker } from '@/components/DevnutDatePicker';
import { DevnutInput } from '@/components/DevnutInput';
import DevnutSection from '@/components/DevnutSection';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { useFormField } from '@/hooks/useForm';
import { useFormReadOnly } from '@/hooks/useFormReadOnly';
import { cn } from '@/lib/tailwind/utils';
import dayjs from 'dayjs';
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

export type FieldDateProps<
  TFieldValues extends FieldValues = FieldValues,
  TName extends FieldPath<TFieldValues> = FieldPath<TFieldValues>,
  TTransformedValues = TFieldValues,
> = FieldProps<
  TFieldValues,
  TName,
  TTransformedValues,
  {
    type: 'date' | 'datetime-local';
    containerProps?: ComponentProps<'div'>;
    displayFormat?: string;
    /** Pulisce automaticamente l'errore RHF sul campo quando l'utente modifica il valore (default true) */
    clearErrorsOnChange?: boolean;
    /** Earliest selectable date (inclusive) — only applies to type="date" */
    minDate?: string | Date;
    /** Latest selectable date (inclusive) — only applies to type="date" */
    maxDate?: string | Date;
  } & Omit<ComponentProps<typeof DevnutInput>, 'type'>
>;

export const FieldDate = <
  TFieldValues extends FieldValues = FieldValues,
  TName extends FieldPath<TFieldValues> = FieldPath<TFieldValues>,
  TTransformedValues = TFieldValues,
>(
  props: FieldDateProps<TFieldValues, TName, TTransformedValues>
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
    displayFormat = 'DD/MM/YYYY',
    clearErrorsOnChange = true,
    minDate,
    maxDate,
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
            <FieldDateReadOnly
              containerProps={containerProps}
              fieldState={fieldState}
              field={field}
              displayFormat={displayFormat}
            />
          );
        }

        if (type === 'date') {
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
                <Label id={ctx.labelId} htmlFor={ctx.id} className="gap-1">
                  {ctx.label}
                  {ctx.required && (
                    <span aria-hidden="true" className="text-destructive">
                      *
                    </span>
                  )}
                </Label>
              )}
              <div className={cn('w-full', hasLabel ? 'md:col-span-3' : '')}>
                <DevnutDatePicker
                  ref={field.ref}
                  id={ctx.id}
                  aria-labelledby={hasLabel ? ctx.labelId : undefined}
                  aria-describedby={describedBy(!!fieldState.error)}
                  aria-required={ctx.required || undefined}
                  value={field.value ?? null}
                  onChange={(v) => {
                    if (clearErrorsOnChange && fieldState.error) {
                      clearErrors(name);
                    }
                    field.onChange(v);
                  }}
                  onBlur={() => {
                    field.onBlur();
                  }}
                  disabled={disabled ?? field.disabled}
                  displayFormat={displayFormat}
                  aria-invalid={fieldState.error ? true : undefined}
                  placeholder={rest.placeholder}
                  minDate={minDate}
                  maxDate={maxDate}
                />
                <FormFieldError />
              </div>
            </DevnutSection.Grid>
          );
        }

        // datetime-local: keep native input
        const inputValue =
          field.value && dayjs(field.value).isValid()
            ? dayjs(field.value).format('YYYY-MM-DDTHH:mm')
            : '';

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
                aria-describedby={describedBy(!!fieldState.error)}
                aria-required={ctx.required || undefined}
                {...rest}
                {...field}
                value={inputValue}
                onChange={(e) => {
                  if (clearErrorsOnChange && fieldState.error) {
                    clearErrors(name);
                  }
                  field.onChange(e.target.value || null);
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

export const FieldDateReadOnly = <
  TFieldValues extends FieldValues = FieldValues,
  TName extends FieldPath<TFieldValues> = FieldPath<TFieldValues>,
>({
  containerProps,
  fieldState,
  field,
  displayFormat = 'DD/MM/YYYY',
}: {
  containerProps?: ComponentProps<'div'>;
  fieldState: ControllerFieldState;
  field: ControllerRenderProps<TFieldValues, TName>;
  displayFormat?: string;
}) => {
  const ctx = useFormField();

  const displayValue =
    field.value && dayjs(field.value).isValid() ? dayjs(field.value).format(displayFormat) : '—';

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
