import DevnutSection from '@/components/DevnutSection';
import {
  DevnutSelect,
  type DevnutSelectOption,
  type DevnutSelectProps,
} from '@/components/DevnutSelect';
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

export type FieldSelectProps<
  TFieldValues extends FieldValues = FieldValues,
  TName extends FieldPath<TFieldValues> = FieldPath<TFieldValues>,
  TTransformedValues = TFieldValues,
> = FieldProps<
  TFieldValues,
  TName,
  TTransformedValues,
  {
    type: 'select';
    containerProps?: ComponentProps<'div'>;
    /** Pulisce automaticamente l'errore RHF sul campo quando l'utente seleziona un valore (default true) */
    clearErrorsOnChange?: boolean;
  } & DevnutSelectProps
>;

export const FieldSelect = <
  TFieldValues extends FieldValues = FieldValues,
  TName extends FieldPath<TFieldValues> = FieldPath<TFieldValues>,
  TTransformedValues = TFieldValues,
>(
  props: FieldSelectProps<TFieldValues, TName, TTransformedValues>
) => {
  const {
    name,
    control,
    disabled,
    defaultValue,
    shouldUnregister,
    containerProps,
    options,
    readonly,
    onValueChange,
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
            <DevnutSelectReadOnly
              containerProps={containerProps}
              fieldState={fieldState}
              field={field}
              options={options}
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
            <div className={cn('w-full', hasLabel ? 'col-span-3' : '')}>
              <DevnutSelect
                id={ctx.id}
                aria-invalid={fieldState.error ? true : undefined}
                aria-describedby={describedBy(!!fieldState.error)}
                aria-required={ctx.required || undefined}
                aria-label={ctx.label}
                showAllOption={false}
                onValueChange={(value) => {
                  if (clearErrorsOnChange && fieldState.error) {
                    clearErrors(name);
                  }
                  field.onChange(value);
                  onValueChange?.(value);
                }}
                options={options}
                triggerClassName="w-full"
                {...rest}
                {...field}
                value={field.value ?? undefined}
              />
              <FormFieldError />
            </div>
          </DevnutSection.Grid>
        );
      }}
    />
  );
};

export const DevnutSelectReadOnly = <
  TFieldValues extends FieldValues = FieldValues,
  TName extends FieldPath<TFieldValues> = FieldPath<TFieldValues>,
>({
  containerProps,
  fieldState,
  field,
  options,
}: {
  containerProps?: ComponentProps<'div'>;
  fieldState: ControllerFieldState;
  field: ControllerRenderProps<TFieldValues, TName>;
  options: DevnutSelectOption[];
}) => {
  const ctx = useFormField();

  // Trova la label corrispondente al valore corrente
  const getDisplayLabel = () => {
    if (field.value === undefined || field.value === null || field.value === '') {
      return '—';
    }

    const selectedOption = options.find((opt) => opt.value === field.value);
    return selectedOption?.label ?? String(field.value);
  };

  const displayValue = getDisplayLabel();

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
