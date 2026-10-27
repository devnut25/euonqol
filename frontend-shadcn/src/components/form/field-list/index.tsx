import { DevnutList, type DevnutListField } from '@/components/DevnutList';
import DevnutSection from '@/components/DevnutSection';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { useFormField } from '@/hooks/useForm';
import { useFormReadOnly } from '@/hooks/useFormReadOnly';
import { cn } from '@/lib/tailwind/utils';
import { t } from 'i18next';
import type { ComponentProps, ReactNode } from 'react';
import {
  Controller,
  type ControllerFieldState,
  type ControllerRenderProps,
  type FieldPath,
  type FieldValues,
} from 'react-hook-form';
import type { FieldProps } from '../form-field-controller';
import { FormFieldError } from '../form-field-error';
import { useDescribedBy } from '../use-described-by';

interface FieldListOwnProps {
  children: (index: number, field: ControllerRenderProps<any, any>, allValues: any[]) => ReactNode;
  itemLabel?: string;
  itemFieldPath?: string;
  min?: number;
  max?: number;
  addButtonLabel?: string;
  defaultItem?: Record<string, unknown>;
  containerProps?: ComponentProps<'div'>;
}

export type FieldListProps<
  TFieldValues extends FieldValues = FieldValues,
  TName extends FieldPath<TFieldValues> = FieldPath<TFieldValues>,
  TTransformedValues = TFieldValues,
> = FieldProps<TFieldValues, TName, TTransformedValues, { type: 'list' } & FieldListOwnProps>;

export const FieldList = <
  TFieldValues extends FieldValues = FieldValues,
  TName extends FieldPath<TFieldValues> = FieldPath<TFieldValues>,
  TTransformedValues = TFieldValues,
>(
  props: FieldListProps<TFieldValues, TName, TTransformedValues>
) => {
  const {
    name,
    control,
    disabled,
    defaultValue,
    shouldUnregister,
    containerProps,
    readonly,
    min,
    max,
    addButtonLabel,
    defaultItem,
    itemLabel,
    itemFieldPath,
    children,
  } = props;

  const ctx = useFormField();
  const describedBy = useDescribedBy();
  const formReadOnly = useFormReadOnly();

  const hasLabel = !!ctx.label;
  const finalReadOnly = readonly ?? formReadOnly ?? false;
  const isDisabled = disabled || Boolean(formReadOnly);

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
            <FieldListReadOnly
              containerProps={containerProps}
              fieldState={fieldState}
              field={field as never}
              itemLabel={itemLabel}
              itemFieldPath={itemFieldPath}
              children={children}
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
              <Label id={ctx.labelId} className="gap-1">
                {ctx.label}
                {/* aria-required is not allowed on the list group: announce it in the label */}
                {ctx.required && (
                  <>
                    <span aria-hidden="true" className="text-destructive">
                      *
                    </span>
                    <span className="sr-only">{t('common:errors.required')}</span>
                  </>
                )}
              </Label>
            )}
            <div className={cn('w-full', hasLabel ? 'md:col-span-3' : '')}>
              <DevnutList
                id={ctx.id}
                aria-labelledby={hasLabel ? ctx.labelId : undefined}
                aria-describedby={describedBy(!!fieldState.error)}
                field={field as never}
                control={control as never}
                min={min}
                max={max}
                addButtonLabel={addButtonLabel}
                defaultItem={defaultItem}
                itemLabel={itemLabel}
                itemFieldPath={itemFieldPath}
                disabled={isDisabled}
              >
                {children}
              </DevnutList>
              <FormFieldError />
            </div>
          </DevnutSection.Grid>
        );
      }}
    />
  );
};

export const FieldListReadOnly = ({
  containerProps,
  fieldState,
  field,
  itemLabel,
  itemFieldPath,
  children,
}: {
  containerProps?: ComponentProps<'div'>;
  fieldState: ControllerFieldState;
  field: DevnutListField;
  itemLabel?: string;
  itemFieldPath?: string;
  children?: FieldListOwnProps['children'];
}) => {
  const ctx = useFormField();

  const items = (field.value ?? []) as unknown[];

  const displayValue = (item: unknown) => {
    const value = itemFieldPath ? (item as Record<string, unknown>)?.[itemFieldPath] : item;
    return value === undefined || value === null || value === '' ? '—' : String(value);
  };

  if (children) {
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
        </div>
        <div
          id={ctx.id}
          aria-describedby={fieldState.error ? ctx.errorId : undefined}
          className="flex flex-col gap-2 w-full"
        >
          {items.length === 0
            ? '—'
            : items.map((_, index) => (
                <div key={index}>{children(index, field as never, items)}</div>
              ))}
        </div>
        <Separator className="mt-2" />
      </>
    );
  }

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
          className="w-full min-w-0 break-words font-light flex flex-col items-start gap-0.5 md:w-auto md:items-end"
        >
          {items.length === 0 ? (
            <span>—</span>
          ) : (
            items.map((item, index) => (
              <span key={index}>
                {itemLabel
                  ? `${index + 1}° ${itemLabel}: ${displayValue(item)}`
                  : displayValue(item)}
              </span>
            ))
          )}
        </div>
      </div>
      <Separator className="mt-2" />
    </>
  );
};
