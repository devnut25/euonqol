import DevnutSection from '@/components/DevnutSection';
import {
  DevnutSelect,
  type DevnutSelectOption,
  type DevnutSelectProps,
} from '@/components/DevnutSelect';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { useApi } from '@/hooks/useApi';
import { useFormField } from '@/hooks/useForm';
import { useFormReadOnly } from '@/hooks/useFormReadOnly';
import { cn } from '@/lib/tailwind/utils';
import type { ComponentProps, ReactNode } from 'react';
import { useEffect, useMemo } from 'react';
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

export type FieldApiSelectProps<
  TFieldValues extends FieldValues = FieldValues,
  TName extends FieldPath<TFieldValues> = FieldPath<TFieldValues>,
  TTransformedValues = TFieldValues,
> = FieldProps<
  TFieldValues,
  TName,
  TTransformedValues,
  {
    type: 'api-select';
    url: string;
    filters?: Record<string, any>;
    additionalParams?: Record<string, any>;
    getLabel?: (item: any) => ReactNode;
    /** Plain-text label for native select and search; needed when `getLabel` returns markup. */
    getTextLabel?: (item: any) => string;
    getValue?: (item: any) => string;
    containerProps?: ComponentProps<'div'>;
    onSelectItem?: (item: any) => void;
    hideLabel?: boolean;
    excludeValues?: string[];
    excludeTypes?: string[];
    getType?: (item: any) => string | undefined;
    /** Pulisce automaticamente l'errore RHF sul campo quando l'utente seleziona un valore (default true) */
    clearErrorsOnChange?: boolean;
    /**
     * Shown in place of the current value when it isn't among the fetched options
     * (e.g. a previously-selected item that no longer matches the active `filters`,
     * such as a module disabled after being added) — keeps its label visible instead
     * of rendering an empty select.
     */
    fallbackOption?: DevnutSelectOption;
  } & Omit<DevnutSelectProps, 'options'>
>;

export const FieldApiSelect = <
  TFieldValues extends FieldValues = FieldValues,
  TName extends FieldPath<TFieldValues> = FieldPath<TFieldValues>,
  TTransformedValues = TFieldValues,
>(
  props: FieldApiSelectProps<TFieldValues, TName, TTransformedValues>
) => {
  const {
    name,
    control,
    disabled,
    defaultValue,
    shouldUnregister,
    containerProps,
    url,
    filters,
    additionalParams,
    getLabel = (item: any) => item.label ?? item.name,
    getTextLabel = (item: any) => item.label ?? item.name,
    getValue = (item: any) => String(item.value ?? item.id),
    readonly,
    onValueChange,
    onSelectItem,
    hideLabel,
    excludeValues,
    excludeTypes,
    getType = (item: any) => item.type,
    clearErrorsOnChange = true,
    fallbackOption,
    ...rest
  } = props;

  const { makeRequest, data, isLoading } = useApi();
  const ctx = useFormField();
  const describedBy = useDescribedBy();
  const formReadOnly = useFormReadOnly();
  const { clearErrors } = useFormContext();

  const hasLabel = !hideLabel && !!ctx.label;
  const finalReadOnly = readonly ?? formReadOnly ?? false;

  useEffect(() => {
    const toBracket = (record: Record<string, any> | undefined) =>
      Object.fromEntries(
        Object.entries(record ?? {}).flatMap(([k, v]) =>
          Array.isArray(v)
            ? v.map((item, i) => [`filter[${k}][${i}]`, item])
            : [[`filter[${k}]`, v]]
        )
      );

    makeRequest(url, 'get', {
      per_page: -1,
      ...toBracket(filters),
      ...toBracket(additionalParams),
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(filters), JSON.stringify(additionalParams), url]);

  const rawItems: any[] = useMemo(() => data?.data ?? [], [data]);

  const options: DevnutSelectOption[] = useMemo(
    () =>
      rawItems
        .filter((item: any) => !excludeTypes?.length || !excludeTypes.includes(getType(item)))
        .map((item: any) => ({
          label: getLabel(item),
          textLabel: getTextLabel(item),
          value: getValue(item),
        })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [rawItems, excludeTypes]
  );

  const filteredOptions = useMemo(
    () =>
      excludeValues?.length ? options.filter((o) => !excludeValues.includes(o.value)) : options,
    [options, excludeValues]
  );

  const withFallback = (list: DevnutSelectOption[], currentValue: string | undefined) => {
    if (!fallbackOption || !currentValue || fallbackOption.value !== currentValue) return list;
    if (list.some((o) => o.value === currentValue)) return list;
    return [...list, fallbackOption];
  };

  return (
    <Controller
      name={name}
      control={control}
      disabled={disabled}
      defaultValue={defaultValue}
      shouldUnregister={shouldUnregister}
      render={({ field, fieldState }) => {
        const currentValue = field.value ? String(field.value) : undefined;

        if (finalReadOnly) {
          return (
            <ApiSelectReadOnly
              containerProps={containerProps}
              fieldState={fieldState}
              field={field}
              options={withFallback(options, currentValue)}
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
                disabled={disabled || isLoading}
                onValueChange={(value) => {
                  if (clearErrorsOnChange && fieldState.error) {
                    clearErrors(name);
                  }
                  field.onChange(value);
                  onValueChange?.(value);
                  if (onSelectItem) {
                    const rawItem = rawItems.find((item: any) => getValue(item) === value);
                    if (rawItem) onSelectItem(rawItem);
                  }
                }}
                options={withFallback(filteredOptions, currentValue)}
                triggerClassName="w-full"
                {...rest}
                {...field}
                value={field.value ? String(field.value) : undefined}
              />
              <FormFieldError />
            </div>
          </DevnutSection.Grid>
        );
      }}
    />
  );
};

const ApiSelectReadOnly = <
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

  const displayValue = () => {
    if (field.value === undefined || field.value === null || field.value === '') {
      return '—';
    }
    const selected = options.find((opt) => opt.value === String(field.value));
    return selected?.label ?? String(field.value);
  };

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
          {displayValue()}
        </div>
      </div>
      <Separator className="mt-2" />
    </>
  );
};
