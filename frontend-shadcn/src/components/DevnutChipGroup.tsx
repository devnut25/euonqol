import { Label } from '@/components/ui/label';
import { cn } from '@/lib/tailwind/utils';
import { deserializeValue, serializeValue } from '@/utils/serialize';
import { cva } from 'class-variance-authority';
import { RadioGroup } from 'radix-ui';
import { type ReactNode, useId } from 'react';

export interface DevnutChipOption {
  label: ReactNode;
  /** Any JSON value (string, number, boolean): serialized internally like DevnutSelect */
  value: unknown;
}

export interface DevnutChipGroupProps {
  id?: string;
  /** Visible label above the group, also its accessible name */
  label?: string;
  /** Accessible name when there is no visible label */
  'aria-label'?: string;
  options: DevnutChipOption[];
  /** false: single choice (radio group); true: several pills toggled on/off */
  multiple?: boolean;
  /** Single: the selected value; multiple: the array of selected values */
  value: unknown;
  /** Receives undefined when nothing is selected ("All", or empty multiple selection) */
  onValueChange: (value: any) => void;
  /** Single only: adds a leading pill that clears the selection */
  allOptionLabel?: string;
  /** chips: separate pills that wrap; segmented: pills joined in one rounded container */
  appearance?: 'chips' | 'segmented';
  disabled?: boolean;
  className?: string;
}

const groupVariants = cva('', {
  variants: {
    appearance: {
      chips: 'flex flex-wrap gap-2',
      segmented: 'inline-flex w-fit items-center rounded-full bg-white border p-[3px]',
    },
  },
});

const chipVariants = cva(
  [
    'cursor-pointer rounded-full text-sm font-medium text-foreground transition-colors',
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
    'disabled:cursor-not-allowed disabled:opacity-50',
    'data-[state=checked]:bg-primary data-[state=checked]:text-primary-foreground',
    'aria-pressed:bg-primary aria-pressed:text-primary-foreground',
  ],
  {
    variants: {
      appearance: {
        chips:
          'border bg-white px-3 py-1.5 data-[state=checked]:border-primary aria-pressed:border-primary',
        segmented: 'px-3 py-1',
      },
    },
  }
);

/** Value of the "All" pill: serializeValue(undefined), never produced by a real option */
const ALL_VALUE = 'all';

/** Group of tappable pills: single choice (Radix radio group, arrow keys) or multiple (toggle buttons). */
export function DevnutChipGroup({
  id,
  label,
  'aria-label': ariaLabel,
  options,
  multiple = false,
  value,
  onValueChange,
  allOptionLabel,
  appearance = 'chips',
  disabled = false,
  className,
}: DevnutChipGroupProps) {
  const generatedId = useId();
  const groupId = id ?? generatedId;
  const labelId = `${groupId}-label`;
  const nameProps = label ? { 'aria-labelledby': labelId } : { 'aria-label': ariaLabel };

  const renderGroup = () => {
    if (multiple) {
      const selected = ((value as unknown[] | undefined) ?? []).map(serializeValue);
      const toggle = (raw: string) => {
        const next = selected.includes(raw)
          ? selected.filter((v) => v !== raw)
          : [...selected, raw];
        onValueChange(next.length > 0 ? next.map(deserializeValue) : undefined);
      };

      return (
        <div id={groupId} role="group" {...nameProps} className={groupVariants({ appearance })}>
          {options.map((opt) => {
            const raw = serializeValue(opt.value);
            return (
              <button
                key={raw}
                type="button"
                disabled={disabled}
                aria-pressed={selected.includes(raw)}
                onClick={() => toggle(raw)}
                className={chipVariants({ appearance })}
              >
                {opt.label}
              </button>
            );
          })}
        </div>
      );
    }

    // serializeValue maps undefined to 'all', the value of the "All" pill
    const current = value === '' ? ALL_VALUE : serializeValue(value);

    return (
      <RadioGroup.Root
        id={groupId}
        orientation="horizontal"
        {...nameProps}
        value={current}
        disabled={disabled}
        onValueChange={(raw) => onValueChange(deserializeValue(raw))}
        className={groupVariants({ appearance })}
      >
        {allOptionLabel && (
          <RadioGroup.Item value={ALL_VALUE} className={chipVariants({ appearance })}>
            {allOptionLabel}
          </RadioGroup.Item>
        )}
        {options.map((opt) => {
          const raw = serializeValue(opt.value);
          return (
            <RadioGroup.Item key={raw} value={raw} className={chipVariants({ appearance })}>
              {opt.label}
            </RadioGroup.Item>
          );
        })}
      </RadioGroup.Root>
    );
  };

  return (
    <div className={cn('flex flex-col gap-2', className)}>
      {label && <Label id={labelId}>{label}</Label>}
      {renderGroup()}
    </div>
  );
}
