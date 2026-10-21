import { useId, useRef } from 'react';
import { STATUS_OPTIONS, type StatusFilter } from './downloadFilters';

/**
 * All / Completed / In progress switch for one level of the dock's status
 * filters. Same look as the dashboard tab switcher, scaled down to the dock.
 */
export function StatusToggle({
  label,
  value,
  onChange,
}: {
  label: string;
  value: StatusFilter;
  onChange: (value: StatusFilter) => void;
}) {
  const labelId = useId();
  const buttons = useRef<(HTMLButtonElement | null)[]>([]);

  /** Arrow keys move and select, as the WAI-ARIA radio group pattern expects. */
  const handleKeyDown = (e: React.KeyboardEvent<HTMLButtonElement>, index: number) => {
    const last = STATUS_OPTIONS.length - 1;
    const next =
      e.key === 'ArrowRight' || e.key === 'ArrowDown'
        ? index === last
          ? 0
          : index + 1
        : e.key === 'ArrowLeft' || e.key === 'ArrowUp'
          ? index === 0
            ? last
            : index - 1
          : null;
    if (next === null) return;
    e.preventDefault();
    onChange(STATUS_OPTIONS[next].value);
    buttons.current[next]?.focus();
  };

  return (
    <div className="flex flex-col gap-1">
      <span id={labelId} className="text-xs font-medium text-muted-foreground">
        {label}
      </span>
      <div role="radiogroup" aria-labelledby={labelId} className="flex rounded-full bg-muted p-0.5">
        {STATUS_OPTIONS.map((opt, i) => (
          <button
            key={opt.value}
            ref={(el) => {
              buttons.current[i] = el;
            }}
            type="button"
            role="radio"
            aria-checked={value === opt.value}
            // Roving focus: the group is one Tab stop, the arrows move inside it.
            tabIndex={value === opt.value ? 0 : -1}
            onKeyDown={(e) => handleKeyDown(e, i)}
            onClick={() => onChange(opt.value)}
            // Unselected options use neutral-600: muted-foreground on the muted
            // track is 4.35:1, under WCAG AA's 4.5:1.
            className={`flex-1 cursor-pointer whitespace-nowrap rounded-full px-1.5 py-1 text-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-1 ${
              value === opt.value
                ? 'bg-primary font-medium text-white shadow-sm hover:bg-[#554fa3]'
                : 'text-neutral-600 hover:text-foreground'
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>
    </div>
  );
}
