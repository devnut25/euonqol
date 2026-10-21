/**
 * Headline figures as a single inline row, shared by the dashboard tabs.
 *
 * Deliberately not cards: cards here would nest inside the content cards below
 * and eat the vertical space those need. The exception is mobile, where the row
 * would wrap into ragged lines starting with a separator: there the figures
 * become a 2×2 grid of small tiles, value above label.
 */
export interface KpiItem {
  value: number;
  label: string;
  /** What exactly is counted, shown as small text under the figure. */
  hint?: string;
}

export function KpiRow({ items }: { items: KpiItem[] }) {
  return (
    <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-start sm:gap-x-4 sm:gap-y-2">
      {items.map((item, i) => (
        <span
          key={item.label}
          className="flex flex-col gap-0.5 rounded-lg border bg-card px-3 py-2 sm:rounded-none sm:border-0 sm:bg-transparent sm:p-0"
        >
          <span className="flex flex-col gap-0.5 sm:flex-row sm:items-baseline sm:gap-1.5">
            {i > 0 && (
              <span className="mr-1 hidden text-muted-foreground/50 sm:inline" aria-hidden="true">
                ·
              </span>
            )}
            <span className="text-xl font-bold text-foreground">{item.value}</span>
            <span className="text-xs text-muted-foreground sm:text-sm">{item.label}</span>
          </span>
          {/* Visible text rather than a `title` tooltip, which is mouse-only. */}
          {item.hint && (
            <span className="text-xs leading-tight text-muted-foreground sm:max-w-56">
              {item.hint}
            </span>
          )}
        </span>
      ))}
    </div>
  );
}
