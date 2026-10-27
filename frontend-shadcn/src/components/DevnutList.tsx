import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { PlusCircle, Trash2 } from 'lucide-react';
import { type ReactNode, createContext, useContext, useEffect, useId, useRef } from 'react';
import type {
  ArrayPath,
  Control,
  ControllerRenderProps,
  FieldPath,
  FieldValues,
} from 'react-hook-form';
import { useFieldArray, useWatch } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { DevnutButton } from './DevnutButton';

interface DevnutListItemContextValue {
  remove: () => void;
  label: string;
}

const DevnutListItemContext = createContext<DevnutListItemContextValue | null>(null);

const MOBILE_REMOVE_CLASS =
  'w-full md:hidden rounded-md border-destructive text-destructive hover:bg-destructive/10 hover:text-destructive';

/**
 * Mobile-only remove button. Render it as the last child of a row card so it sits
 * inside the card; rows whose card does not render it get a fallback below the card.
 */
export function DevnutListRemoveButton() {
  const { t } = useTranslation(['common']);
  const ctx = useContext(DevnutListItemContext);
  if (!ctx) return null;
  return (
    <DevnutButton
      type="button"
      variant="outline"
      size="sm"
      data-inline-remove
      className={MOBILE_REMOVE_CLASS}
      onClick={ctx.remove}
      aria-label={ctx.label}
    >
      <Trash2 className="size-4 mr-1" />
      {t('crud_data_table.actions.delete')}
    </DevnutButton>
  );
}

export interface DevnutListField {
  name: string;
  value: unknown[] | undefined;
  onChange: (value: unknown[]) => void;
  onBlur?: () => void;
  disabled?: boolean;
}

export interface DevnutListProps<TFieldValues extends FieldValues> {
  field: DevnutListField;
  control: Control<TFieldValues, any, any>;
  children: (
    index: number,
    field: ControllerRenderProps<TFieldValues, FieldPath<TFieldValues>>,
    allValues: unknown[]
  ) => ReactNode;
  itemLabel?: string;
  itemFieldPath?: string;
  min?: number;
  max?: number;
  addButtonLabel?: string;
  defaultItem?: Record<string, unknown>;
  disabled?: boolean;
  id?: string;
  /** Id of the visible label naming the whole list (rendered as a group). */
  'aria-labelledby'?: string;
  'aria-describedby'?: string;
}

export function DevnutList<TFieldValues extends FieldValues>({
  field,
  control,
  children,
  itemLabel,
  itemFieldPath,
  min = 0,
  max,
  addButtonLabel = 'Add item',
  defaultItem,
  disabled,
  id,
  'aria-labelledby': ariaLabelledBy,
  'aria-describedby': ariaDescribedBy,
}: DevnutListProps<TFieldValues>) {
  const baseId = useId();
  const listRef = useRef<HTMLDivElement>(null);
  // Row index to focus after a removal, resolved once the row has left the DOM
  const pendingFocusIndex = useRef<number | null>(null);
  // useFieldArray owns structural mutation (append/remove) so nested per-item
  // Controllers (e.g. `modules.0.moduleId`) get properly registered/unregistered
  // and shifted, instead of leaking stale values across rows on append/remove.
  const { fields, append: rhfAppend, remove: rhfRemove, update } = useFieldArray({
    control,
    name: field.name as ArrayPath<TFieldValues>,
    keyName: '_rowKey',
  });

  // field.value (from the array-level Controller) can lag behind writes made by
  // independent per-item Controllers on nested paths. useWatch always resolves
  // the live store, so children always read the freshest values.
  const watchedValue = useWatch({ control, name: field.name as FieldPath<TFieldValues> }) as
    | unknown[]
    | undefined;
  const value = watchedValue ?? field.value ?? [];

  const canAdd = !max || fields.length < max;
  const canRemove = fields.length > min;

  const append = () => {
    rhfAppend((defaultItem ?? {}) as never);
  };

  const remove = (index: number) => {
    pendingFocusIndex.current = index;
    rhfRemove(index);
  };

  // After Remove, keep focus in the list: the next row's first control, else the Add
  // button, else the previous row (focus would otherwise fall back to <body>)
  useEffect(() => {
    const index = pendingFocusIndex.current;
    const list = listRef.current;
    if (index === null || !list) return;
    pendingFocusIndex.current = null;
    const rows = list.querySelectorAll<HTMLElement>(':scope > [data-list-item]');
    const firstControl = (row?: HTMLElement) =>
      row?.querySelector<HTMLElement>(
        'input:not([type="hidden"]):not(:disabled), select:not(:disabled), textarea:not(:disabled), button:not(:disabled), [contenteditable="true"], [tabindex]:not([tabindex="-1"])'
      );
    const target =
      firstControl(rows[index]) ??
      list.querySelector<HTMLElement>(':scope > [data-list-add]') ??
      firstControl(rows[index - 1]);
    target?.focus();
  }, [fields.length]);

  return (
    <div
      ref={listRef}
      id={id}
      role="group"
      aria-labelledby={ariaLabelledBy}
      aria-describedby={ariaDescribedBy}
      className="flex flex-col gap-2"
    >
      {fields.map((rowMeta, index) => {
        const item = value[index] ?? rowMeta;
        const itemName = itemFieldPath
          ? `${field.name}.${index}.${itemFieldPath}`
          : `${field.name}.${index}`;

        const itemValue = itemFieldPath ? (item as Record<string, unknown>)?.[itemFieldPath] : item;

        const itemLabelId = `${baseId}-item-${index}`;

        const itemOnChange = (v: unknown) => {
          update(
            index,
            (itemFieldPath
              ? { ...(item as Record<string, unknown>), [itemFieldPath]: v }
              : v) as never
          );
        };

        const itemField = {
          name: itemName,
          value: itemValue,
          onChange: itemOnChange,
          onBlur: field.onBlur,
          disabled: field.disabled,
        } as ControllerRenderProps<TFieldValues, FieldPath<TFieldValues>>;

        const removeLabel = `Remove ${itemLabel ? `${itemLabel} ` : 'item '}${index + 1}`;

        return (
          <div
            key={rowMeta._rowKey}
            data-list-item
            className="group"
            role={itemLabel ? 'group' : undefined}
            aria-labelledby={itemLabel ? itemLabelId : undefined}
          >
            {itemLabel && (
              <Label id={itemLabelId} className="text-sm font-medium mb-1 block">{`${index + 1}° ${itemLabel}`}</Label>
            )}
            <div className="flex items-center gap-2">
              <div className="flex-1 w-full">
                <DevnutListItemContext.Provider
                  value={{ remove: () => remove(index), label: removeLabel }}
                >
                  {children(index, itemField, value)}
                </DevnutListItemContext.Provider>
              </div>
              {canRemove && !disabled && (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="hidden md:inline-flex"
                  onClick={() => remove(index)}
                  aria-label={removeLabel}
                >
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              )}
            </div>
            {canRemove && !disabled && (
              <div className="mt-2 group-has-[[data-inline-remove]]:hidden">
                <DevnutListRemoveButton />
              </div>
            )}
          </div>
        );
      })}

      {canAdd && !disabled && (
        <DevnutButton type="button" size="sm" onClick={append} data-list-add>
          <PlusCircle className="size-4 mr-1" />
          {addButtonLabel}
        </DevnutButton>
      )}
    </div>
  );
}
