import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/tailwind/utils';
import dayjs from 'dayjs';
import { t } from 'i18next';
import { type Ref, useId, useState } from 'react';

export interface DevnutDatePickerProps {
  id?: string;
  ref?: Ref<HTMLButtonElement>;
  value?: string | null;
  onChange?: (value: string | null) => void;
  onBlur?: () => void;
  disabled?: boolean;
  placeholder?: string;
  displayFormat?: string;
  'aria-invalid'?: boolean | 'true' | 'false';
  /** Id of the visible label; the trigger is named by it plus the displayed value. */
  'aria-labelledby'?: string;
  'aria-describedby'?: string;
  'aria-required'?: boolean;
  className?: string;
  fromYear?: number;
  toYear?: number;
  /** Earliest selectable date (inclusive) — dates before this are disabled in the calendar. */
  minDate?: string | Date;
  /** Latest selectable date (inclusive) — dates after this are disabled in the calendar. */
  maxDate?: string | Date;
}

export function DevnutDatePicker({
  id,
  ref,
  value,
  onChange,
  onBlur,
  disabled,
  placeholder = t('common:placeholder.date-picker'),
  displayFormat = 'DD/MM/YYYY',
  'aria-invalid': ariaInvalid,
  'aria-labelledby': ariaLabelledBy,
  'aria-describedby': ariaDescribedBy,
  'aria-required': ariaRequired,
  className,
  fromYear = 1900,
  toYear = new Date().getFullYear() + 10,
  minDate,
  maxDate,
}: DevnutDatePickerProps) {
  const [open, setOpen] = useState(false);
  const valueId = useId();
  const requiredId = `${valueId}-required`;

  const parsed = value && dayjs(value).isValid() ? dayjs(value) : null;
  const selected = parsed ? parsed.toDate() : undefined;

  const handleSelect = (date: Date | undefined) => {
    onChange?.(date ? dayjs(date).format('YYYY-MM-DD') : null);
    setOpen(false);
  };

  const minDateValue = minDate ? dayjs(minDate).startOf('day').toDate() : undefined;
  const maxDateValue = maxDate ? dayjs(maxDate).endOf('day').toDate() : undefined;
  const disabledMatchers = [
    ...(minDateValue ? [{ before: minDateValue }] : []),
    ...(maxDateValue ? [{ after: maxDateValue }] : []),
  ];

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) onBlur?.();
      }}
    >
      <PopoverTrigger asChild>
        <button
          ref={ref}
          id={id}
          type="button"
          disabled={disabled}
          aria-invalid={ariaInvalid}
          // A <label for> would replace the button text as its name, hiding the selected date;
          // aria-required is not allowed on a button, so "Required" joins the name instead
          aria-labelledby={
            ariaLabelledBy
              ? [ariaLabelledBy, valueId, ariaRequired && requiredId].filter(Boolean).join(' ')
              : undefined
          }
          aria-describedby={ariaDescribedBy}
          className={cn(
            'flex h-9 w-full items-center gap-2 rounded-full border border-input bg-white px-4 py-2 text-sm shadow-none',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
            'disabled:cursor-not-allowed disabled:opacity-50',
            ariaInvalid === true || ariaInvalid === 'true'
              ? 'border-destructive focus-visible:ring-destructive'
              : '',
            !parsed && 'text-muted-foreground',
            className
          )}
        >
          {/* <CalendarIcon className="size-4 shrink-0 text-muted-foreground" /> */}
          <span id={valueId} className="flex-1 text-left">
            {parsed ? parsed.format(displayFormat) : placeholder}
          </span>
          {ariaRequired && (
            <span id={requiredId} className="sr-only">
              {t('common:errors.required')}
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="single"
          selected={selected}
          onSelect={handleSelect}
          captionLayout="dropdown"
          startMonth={new Date(fromYear, 0)}
          endMonth={new Date(toYear, 11)}
          defaultMonth={selected ?? minDateValue ?? new Date()}
          disabled={disabledMatchers.length > 0 ? disabledMatchers : undefined}
        />
      </PopoverContent>
    </Popover>
  );
}
