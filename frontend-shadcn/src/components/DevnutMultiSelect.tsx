import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger } from '@/components/ui/select';
import { useIsTablet } from '@/hooks/useMediaQuery';
import { cn } from '@/lib/tailwind/utils';
import { CheckIcon } from 'lucide-react';
import { useId, useState } from 'react';
import { SelectNative } from './ui/select-native';

/**
 * Componente MultiSelect basato sugli stessi primitivi shadcn/Radix di DevnutSelect
 * (Select/SelectTrigger/SelectContent/SelectItem), senza Popover+Command.
 * Il dropdown resta aperto ad ogni selezione (preventDefault su onSelect degli item);
 * stato selezione gestito a mano come array, il value single-string di Radix Select
 * non viene usato.
 */
export interface MultiSelectOption {
  label: string;
  value: string;
}

export interface MultiSelectProps {
  options: MultiSelectOption[];
  value?: string[];
  onValueChange?: (value: string[]) => void;
  placeholder?: string;
  /** Numero massimo di badge visibili prima di collassare in "+N" */
  maxCount?: number;
  className?: string;
  triggerClassName?: string;
  contentClassName?: string;
  id?: string;
  disabled?: boolean;
  label?: string;
  /** Classi Tailwind (bg+text) per opzione, per sovrascrivere il colore primary generico (es. colori status) */
  optionColorMap?: Record<string, string>;
  /** Classi Tailwind (bg piena) per il pallino colorato davanti alla label di ogni opzione nel dropdown */
  optionDotColorMap?: Record<string, string>;
  'aria-invalid'?: boolean;
  'aria-describedby'?: string;
  /** Nome accessibile quando manca una `label` visibile */
  'aria-label'?: string;
  /** Mostra l'opzione "Select All" nel dropdown */
  showAllOption?: boolean;
  /** Label per l'opzione "Select All" */
  allOptionLabel?: string;
}

export function DevnutMultiSelect({
  options,
  value,
  onValueChange,
  placeholder = 'Select options',
  maxCount = 2,
  className,
  triggerClassName,
  contentClassName,
  id,
  disabled = false,
  label,
  optionColorMap,
  optionDotColorMap,
  showAllOption = true,
  allOptionLabel = 'All',
  ...props
}: MultiSelectProps) {
  const { 'aria-invalid': ariaInvalid } = props;
  // Fallback name when no visible <label> is rendered
  const ariaLabel = props['aria-label'] ?? (label ? undefined : placeholder);

  const isTablet = useIsTablet();
  const generatedId = useId();
  const selectId = id || generatedId;
  const [open, setOpen] = useState(false);

  const selectedValues = value ?? [];

  const toggleValue = (optionValue: string) => {
    const isSelected = selectedValues.includes(optionValue);
    const next = isSelected
      ? selectedValues.filter((v) => v !== optionValue)
      : [...selectedValues, optionValue];
    onValueChange?.(next);
  };

  const toggleAll = () => {
    onValueChange?.(selectedValues.length === options.length ? [] : options.map((o) => o.value));
  };

  const handleNativeChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const next = Array.from(e.target.selectedOptions).map((opt) => opt.value);
    onValueChange?.(next);
  };

  // Check a destra, stesso markup della SelectItem primitiva Radix (ui/select.tsx)
  const renderCheckMark = (checked: boolean) => (
    <span className="absolute right-2 flex size-3.5 items-center justify-center">
      {checked && <CheckIcon aria-hidden="true" className="size-4" />}
    </span>
  );

  // Pallino colorato (dot) + label, al posto del checkbox colorato
  const renderDotLabel = (label: string, dotColorClassName?: string) => (
    <span className="flex items-center gap-2 truncate">
      <span
        className={cn(
          'size-2 rounded-full shrink-0',
          dotColorClassName ?? 'bg-muted-foreground/40'
        )}
      />
      <span className="truncate">{label}</span>
    </span>
  );

  const renderSelectNative = () => {
    return (
      <SelectNative
        id={selectId}
        multiple
        value={selectedValues}
        onChange={handleNativeChange}
        disabled={disabled}
        aria-invalid={ariaInvalid}
        aria-label={ariaLabel}
        size="xs"
        aria-describedby={props['aria-describedby']}
        className={cn(
          'rounded-md bg-white',
          'focus-visible:ring-primary focus-visible:ring-2 focus-visible:border-none',
          'w-full min-w-30',
          triggerClassName
        )}
      >
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </SelectNative>
    );
  };

  const renderSelect = () => {
    const visible = options.filter((opt) => selectedValues.includes(opt.value)).slice(0, maxCount);
    const overflowCount = selectedValues.length - visible.length;

    return (
      <Select open={open} onOpenChange={setOpen}>
        <SelectTrigger
          id={selectId}
          aria-invalid={ariaInvalid}
          aria-label={ariaLabel}
          aria-describedby={props['aria-describedby']}
          disabled={disabled}
          className={cn(
            'rounded-full bg-white',
            'focus-visible:ring-primary focus-visible:ring-2 focus-visible:border-none',
            triggerClassName
          )}
        >
          {selectedValues.length === 0 ? (
            <span className="text-muted-foreground truncate">{placeholder}</span>
          ) : (
            <div className="flex flex-1 flex-wrap items-center gap-1 overflow-hidden">
              {visible.map((opt) => (
                <Badge key={opt.value} variant="secondary" className={optionColorMap?.[opt.value]}>
                  {opt.label}
                </Badge>
              ))}
              {overflowCount > 0 && <Badge variant="outline">{`+${overflowCount}`}</Badge>}
            </div>
          )}
        </SelectTrigger>

        {/* Radix Select is single-value: selection state is exposed by hand (multi-select listbox) */}
        <SelectContent className={contentClassName} aria-multiselectable="true">
          {showAllOption && (
            <SelectItem
              value="all"
              aria-selected={selectedValues.length === options.length}
              onPointerUp={(e) => e.preventDefault()}
              onClick={(e) => {
                e.preventDefault();
                toggleAll();
              }}
              onKeyDown={(e) => {
                if (e.key === ' ' || e.key === 'Enter') {
                  e.preventDefault();
                  toggleAll();
                }
              }}
            >
              {renderCheckMark(selectedValues.length === options.length)}
              <span>{allOptionLabel}</span>
            </SelectItem>
          )}
          {options.map((opt) => {
            const checked = selectedValues.includes(opt.value);
            return (
              <SelectItem
                key={opt.value}
                value={opt.value}
                aria-selected={checked}
                onPointerUp={(e) => e.preventDefault()}
                onClick={(e) => {
                  e.preventDefault();
                  toggleValue(opt.value);
                }}
                onKeyDown={(e) => {
                  if (e.key === ' ' || e.key === 'Enter') {
                    e.preventDefault();
                    toggleValue(opt.value);
                  }
                }}
              >
                {renderCheckMark(checked)}
                {renderDotLabel(opt.label, optionDotColorMap?.[opt.value])}
              </SelectItem>
            );
          })}
        </SelectContent>
      </Select>
    );
  };

  return (
    <div className={cn('w-full relative', className)}>
      {label && (
        <label htmlFor={selectId} className="mx-1 mb-1 block text-sm font-medium">
          {label}
        </label>
      )}
      {isTablet ? renderSelectNative() : renderSelect()}
    </div>
  );
}
