import { SectionInfoModal } from '@/components/SectionInfoModal';

/**
 * Headline figures as a single inline row, shared by the dashboard tabs.
 *
 * Deliberately not cards: cards here would nest inside the content cards below
 * and eat the vertical space those need. The exception is mobile, where the row
 * would wrap into ragged lines starting with a separator: there the figures
 * become a 2×2 grid of small tiles, value above label.
 *
 * What each figure counts is kept out of the row, behind one info button at its
 * end: spelt out under every figure it made the row read like a paragraph.
 */
export interface KpiItem {
  value: number;
  label: string;
  /** What exactly is counted, listed behind the row's info button. */
  hint?: string;
}

export function KpiRow({ items }: { items: KpiItem[] }) {
  const hints = items
    .filter((item) => item.hint)
    .map((item) => ({ heading: item.label, description: item.hint! }));

  return (
    <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-center sm:justify-end sm:gap-x-4 sm:gap-y-2">
      {items.map((item, i) => (
        <span key={item.label} className="contents">
          {/* A drawn dot rather than a "·" character: the character sits on the
              text baseline, visibly below the middle of the large figures. */}
          {i > 0 && (
            <span
              className="hidden size-1 shrink-0 rounded-full bg-muted-foreground/40 sm:inline-block"
              aria-hidden="true"
            />
          )}
          <span className="flex flex-col gap-0.5 rounded-lg border bg-card px-3 py-2 sm:flex-row sm:items-baseline sm:gap-1.5 sm:rounded-none sm:border-0 sm:bg-transparent sm:p-0">
            <span className="text-xl leading-none font-bold text-foreground">{item.value}</span>
            <span className="text-xs leading-none text-muted-foreground sm:text-sm">
              {item.label}
            </span>
          </span>
        </span>
      ))}
      {hints.length > 0 && (
        <span className="col-span-2 flex justify-end sm:col-span-1 sm:inline-flex sm:items-center">
          <SectionInfoModal title="What these figures count" items={hints} />
        </span>
      )}
    </div>
  );
}
