import DevnutSection from '@/components/DevnutSection';
import { Label } from '@/components/ui/label';
import { RichTextEditor } from '@/components/ui/rich-text-editor';
import { Separator } from '@/components/ui/separator';
import { useFormField } from '@/hooks/useForm';
import { useFormReadOnly } from '@/hooks/useFormReadOnly';
import { sanitizeHtml } from '@/lib/rich-text';
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

export type FieldRichTextEditorProps<
  TFieldValues extends FieldValues = FieldValues,
  TName extends FieldPath<TFieldValues> = FieldPath<TFieldValues>,
  TTransformedValues = TFieldValues,
> = FieldProps<
  TFieldValues,
  TName,
  TTransformedValues,
  {
    type: 'rich-text-editor';
    containerProps?: ComponentProps<'div'>;
    /** Pulisce automaticamente l'errore RHF sul campo quando l'utente modifica il contenuto (default true) */
    clearErrorsOnChange?: boolean;
  }
>;

export const FieldRichTextEditor = <
  TFieldValues extends FieldValues = FieldValues,
  TName extends FieldPath<TFieldValues> = FieldPath<TFieldValues>,
  TTransformedValues = TFieldValues,
>(
  props: FieldRichTextEditorProps<TFieldValues, TName, TTransformedValues>
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
            <RichTextEditorReadOnly
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
              <Label id={ctx.labelId} className="gap-1 pt-2">
                {ctx.label}
                {ctx.required && (
                  <span aria-hidden="true" className="text-destructive">
                    *
                  </span>
                )}
              </Label>
            )}
            <div className={cn('w-full', hasLabel ? 'md:col-span-3' : '')}>
              <RichTextEditor
                ref={field.ref}
                id={ctx.id}
                aria-invalid={fieldState.error ? true : undefined}
                aria-labelledby={hasLabel ? ctx.labelId : undefined}
                aria-describedby={describedBy(!!fieldState.error)}
                aria-required={ctx.required || undefined}
                value={field.value ?? ''}
                onChange={(v) => {
                  if (clearErrorsOnChange && fieldState.error) {
                    clearErrors(name);
                  }
                  field.onChange(v);
                }}
                disabled={disabled}
              />
              <FormFieldError />
            </div>
          </DevnutSection.Grid>
        );
      }}
    />
  );
};

const RichTextEditorReadOnly = <
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

  return (
    <>
      <div
        {...containerProps}
        className={cn(
          'flex flex-col items-start gap-1 md:flex-row md:justify-between md:gap-4 md:items-start',
          containerProps?.className
        )}
      >
        {ctx.label && (
          <Label htmlFor={ctx.id} className="text-primary font-bold shrink-0 md:pt-0.5">
            {ctx.label}
          </Label>
        )}
        <div
          id={ctx.id}
          aria-describedby={fieldState.error ? ctx.errorId : undefined}
          className="w-full min-w-0 break-words md:w-auto md:text-right"
          dangerouslySetInnerHTML={{ __html: sanitizeHtml(field.value ?? '') }}
        />
      </div>
      <Separator className="mt-2" />
    </>
  );
};
