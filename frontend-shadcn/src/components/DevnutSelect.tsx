import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { Label } from '@/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useIsTablet } from '@/hooks/useMediaQuery';
import { cn } from '@/lib/tailwind/utils';
import { deserializeValue, serializeValue } from '@/utils/serialize';
import { defaultFilter } from 'cmdk';
import { CheckIcon, ChevronDownIcon } from 'lucide-react';
import { type ReactNode, type Ref, useEffect, useId, useRef, useState } from 'react';
import { SelectNative } from './ui/select-native';

export interface DevnutSelectOption {
  label: ReactNode;
  value: string;
  /** Plain-text label, used where markup can't render (native <option>, combobox search). */
  textLabel?: string;
  /** Shown in the trigger once picked, when the list row carries more than fits there. */
  selectedLabel?: ReactNode;
}

const getOptionText = (opt: DevnutSelectOption) =>
  opt.textLabel ?? (typeof opt.label === 'string' ? opt.label : opt.value);

export interface DevnutSelectProps extends React.ComponentProps<typeof Select> {
  value?: string;
  onValueChange?: (value: string | undefined) => void;
  options: DevnutSelectOption[];
  label?: string;
  placeholder?: string;
  showAllOption?: boolean;
  allOptionLabel?: string;
  /** Renders a searchable combobox instead of a plain select. */
  searchable?: boolean;
  /** Placeholder of the search field, when `searchable`. */
  searchPlaceholder?: string;
  /** Rendered above the options of the searchable list, kept in view while it scrolls. */
  listHeader?: ReactNode;
  className?: string;
  triggerClassName?: string;
  contentClassName?: string;
  id?: string;
  disabled?: boolean;
  // Props ARIA per il trigger
  'aria-invalid'?: boolean;
  'aria-describedby'?: string;
  'aria-label'?: string;
  'aria-required'?: boolean;
  /** Forwarded to the focusable control (trigger or native select), e.g. RHF `field.ref`. */
  ref?: Ref<HTMLElement>;
}

/** cmdk value of the "All" item; cannot collide with a caller's option value. */
const ALL_ITEM_VALUE = '__devnut_select_all__';

/** Matches the search against the label only, never against the stored id. */
const filterByLabel = (_value: string, search: string, keywords?: string[]) =>
  defaultFilter((keywords ?? []).join(' '), search);

export function DevnutSelect({
  value,
  onValueChange,
  options,
  label,
  placeholder = 'Select an option',
  showAllOption = true,
  allOptionLabel = 'All',
  searchable = false,
  searchPlaceholder = 'Search…',
  listHeader,
  className,
  triggerClassName,
  contentClassName,
  id,
  disabled = false,
  ref,
  'aria-required': ariaRequired,
  ...props
}: DevnutSelectProps) {
  const { 'aria-invalid': ariaInvalid, 'aria-label': ariaLabel } = props;

  const isTablet = useIsTablet();
  const [open, setOpen] = useState(false);
  const generatedId = useId();
  const selectId = id || generatedId;
  const rootRef = useRef<HTMLDivElement>(null);

  // Radix monta una <select> nativa nascosta (aria-hidden) dentro i form, senza possibilità
  // di passarle un nome: gli scanner WCAG la segnalano come "Missing form label".
  const hiddenSelectLabel = ariaLabel ?? label ?? placeholder;
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    // La select nascosta viene montata da Radix dopo il nostro render: va osservato il DOM.
    const apply = () =>
      root
        .querySelector('select[aria-hidden="true"]')
        ?.setAttribute('aria-label', hiddenSelectLabel);
    apply();
    const observer = new MutationObserver(apply);
    observer.observe(root, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, [hiddenSelectLabel]);

  const handleValueChange = (raw: string) => {
    const parsed = deserializeValue(raw);
    onValueChange?.(parsed);
  };

  const handleNativeChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const raw = e.target.value;
    handleValueChange(raw);
  };

  // An empty string means "no filter", same as undefined: callers commonly hold
  // filter state as '' rather than undefined. Without this, serializeValue('')
  // yields '""' — a value no option carries — so the trigger renders blank
  // instead of falling back to the All option or the placeholder.
  const isUnset = value === undefined || value === '';

  const serializedValueDesktop = isUnset
    ? showAllOption
      ? 'all'
      : undefined
    : serializeValue(value);

  const serializedValueNative = isUnset ? (showAllOption ? 'all' : '') : serializeValue(value);

  const renderSelectNative = () => {
    return (
      <SelectNative
        ref={ref as Ref<HTMLSelectElement>}
        id={selectId}
        aria-required={ariaRequired}
        value={serializedValueNative}
        onChange={handleNativeChange}
        disabled={disabled}
        aria-invalid={ariaInvalid}
        aria-label={ariaLabel}
        size="xs"
        aria-describedby={props['aria-describedby']}
        className={cn(
          'rounded-full bg-white',
          'focus-visible:ring-primary focus-visible:ring-2 focus-visible:border-none',
          'w-full min-w-30',
          triggerClassName
        )}
      >
        {/* The disabled placeholder is only needed when nothing else stands for
            "no value": with an All option it would just repeat it. */}
        {!showAllOption && (
          <option value="" disabled>
            {placeholder}
          </option>
        )}

        {showAllOption && <option value="all">{allOptionLabel}</option>}

        {options.map((opt) => (
          <option key={serializeValue(opt.value)} value={serializeValue(opt.value)}>
            {getOptionText(opt)}
          </option>
        ))}
      </SelectNative>
    );
  };

  const renderCombobox = () => {
    const selected = isUnset ? undefined : options.find((o) => o.value === value);
    const triggerLabel =
      selected?.selectedLabel ??
      selected?.label ??
      (showAllOption && isUnset ? allOptionLabel : undefined);

    const select = (next: string | undefined) => {
      onValueChange?.(next);
      setOpen(false);
    };

    return (
      // `modal`: a dialog locks the scroll of everything outside it, and this list
      // is portalled outside it. As a modal popover it holds the lock itself, so
      // the list scrolls inside a dialog too.
      <Popover modal open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            ref={ref as Ref<HTMLButtonElement>}
            id={selectId}
            aria-required={ariaRequired}
            type="button"
            role="combobox"
            aria-expanded={open}
            aria-invalid={ariaInvalid}
            aria-label={ariaLabel}
            aria-describedby={props['aria-describedby']}
            disabled={disabled}
            className={cn(
              'border-input flex h-7 w-full cursor-pointer items-center justify-between gap-2 rounded-full border bg-white px-3 py-2 text-sm shadow-xs outline-none transition-[color,box-shadow]',
              'focus-visible:ring-primary focus-visible:ring-2 focus-visible:border-none',
              'disabled:cursor-not-allowed disabled:opacity-50',
              triggerClassName
            )}
          >
            <span
              className={cn('line-clamp-1 text-left', !triggerLabel && 'text-muted-foreground')}
            >
              {triggerLabel ?? placeholder}
            </span>
            <ChevronDownIcon className="size-4 shrink-0 opacity-50" />
          </button>
        </PopoverTrigger>

        <PopoverContent
          align="start"
          className={cn(
            'w-[var(--radix-popover-trigger-width)] min-w-[var(--radix-popover-trigger-width)] p-0',
            contentClassName
          )}
        >
          <Command filter={filterByLabel}>
            <CommandInput placeholder={searchPlaceholder} className="h-8 text-sm" />
            <CommandList>
              {listHeader && (
                <div className="sticky top-0 z-10 border-b bg-popover">{listHeader}</div>
              )}
              <CommandEmpty>No results.</CommandEmpty>
              <CommandGroup>
                {showAllOption && (
                  <CommandItem
                    value={ALL_ITEM_VALUE}
                    keywords={[allOptionLabel]}
                    onSelect={() => select(undefined)}
                  >
                    <CheckIcon className={cn('size-4', !isUnset && 'opacity-0')} />
                    {allOptionLabel}
                  </CommandItem>
                )}

                {options.map((opt) => (
                  <CommandItem
                    key={opt.value}
                    // cmdk identifies items by `value`, so it must be unique: two
                    // options with the same label would otherwise highlight
                    // together. Search runs on the label through `keywords`.
                    value={opt.value}
                    keywords={[getOptionText(opt)]}
                    onSelect={() => select(opt.value)}
                  >
                    <CheckIcon
                      className={cn('size-4 shrink-0', opt.value !== value && 'opacity-0')}
                    />
                    {opt.label}
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    );
  };

  const renderSelect = () => {
    return (
      <Select
        key={options.length > 0 ? 'loaded' : 'loading'}
        value={serializedValueDesktop}
        onValueChange={handleValueChange}
        disabled={disabled}
        {...props}
      >
        <SelectTrigger
          ref={ref as Ref<HTMLButtonElement>}
          id={selectId}
          aria-required={ariaRequired}
          aria-invalid={ariaInvalid}
          aria-label={ariaLabel}
          aria-describedby={props['aria-describedby']}
          className={cn(
            'rounded-full bg-white',
            'focus-visible:ring-primary focus-visible:ring-2 focus-visible:border-none',
            'placeholder:text-sm md:placeholder:text-muted-foreground',
            triggerClassName
          )}
        >
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>

        <SelectContent
          className={cn(
            'focus-visible:ring-primary focus-visible:ring-2 focus-visible:border-none',
            contentClassName
          )}
        >
          {showAllOption && <SelectItem value="all">{allOptionLabel}</SelectItem>}

          {options.map((opt) => (
            <SelectItem key={serializeValue(opt.value)} value={serializeValue(opt.value)}>
              {opt.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    );
  };

  return (
    <div ref={rootRef} className={cn('w-full relative', className)}>
      {label && (
        <Label htmlFor={selectId} className={'mx-1 mb-1'}>
          {label}
        </Label>
      )}
      {isTablet ? renderSelectNative() : searchable ? renderCombobox() : renderSelect()}
    </div>
  );
}
