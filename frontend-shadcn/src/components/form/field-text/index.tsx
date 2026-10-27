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
import { AutoResizeTextarea } from '../auto-resize-textarea';
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
    /**
     * Long single-line values (e.g. titles): renders an auto-growing textarea that wraps the
     * text instead of cutting it. Line breaks are blocked, so the value stays a single line.
     */
    multiline?: boolean;
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
    multiline,
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
              {multiline ? (
                <AutoResizeTextarea
                  id={ctx.id}
                  rows={1}
                  aria-invalid={fieldState.error ? true : undefined}
                  aria-required={ctx.required || undefined}
                  aria-label={hasLabel ? undefined : rest.placeholder}
                  aria-describedby={describedBy(!!fieldState.error)}
                  placeholder={rest.placeholder}
                  maxLength={rest.maxLength}
                  {...field}
                  value={field.value ?? ''}
                  onKeyDown={(e) => {
                    // Single-line value: Enter must not insert a line break
                    if (e.key === 'Enter') e.preventDefault();
                  }}
                  onChange={(e) => {
                    if (clearErrorsOnChange && fieldState.error) {
                      clearErrors(name);
                    }
                    // Pasted multi-line text collapses to one line
                    field.onChange(e.target.value.replace(/\r?\n/g, ' '));
                  }}
                  onBlur={() => field.onBlur()}
                  // Same look as DevnutInput: a pill on one line, rounded box when it wraps
                  className={cn(
                    'flex w-full rounded-[18px] border border-input bg-white px-3 py-1.5 text-base shadow-none md:text-sm placeholder:text-muted-foreground focus-visible:border-transparent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
                    'aria-invalid:ring-destructive dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive',
                    rest.className
                  )}
                />
              ) : (
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
              )}
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
        className={cn(
          'flex flex-col items-start gap-1 md:flex-row md:justify-between md:gap-4 md:items-center',
          containerProps?.className
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
