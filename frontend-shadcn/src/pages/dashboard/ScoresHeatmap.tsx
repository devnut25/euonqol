import { useMediaQuery } from '@/hooks/useMediaQuery';
import {
  METRIC_SHORT_LABEL,
  scaleFullName,
  type CrossCell,
  type CrossTabData,
} from './scoresTypes';

/**
 * Categories × scales grid, shaded by the central value of each cell.
 *
 * Built as a CSS grid rather than with a charting library: a heatmap is a table
 * of coloured cells, and this way the labels stay selectable and the layout
 * reflows on narrow screens.
 *
 * On phones it is drawn transposed — one row per scale, one column per
 * category — since there are many scales and few categories: it then reads by
 * scrolling down instead of sideways.
 */

/**
 * Colour ramp in the dashboard accent, from pale to saturated.
 *
 * `t` is the value's position within the observed range, so the contrast always
 * spans the data actually shown instead of an absolute scale that might make
 * every cell look identical.
 */
function shade(t: number): string {
  const clamped = Math.max(0, Math.min(1, t));
  // Alpha ramp keeps the hue constant and reads correctly on a white card.
  return `rgba(106, 104, 172, ${0.1 + clamped * 0.8})`;
}

/** Map key of a (category, scale) cell; NUL cannot appear in either label. */
const cellKey = (category: string, scale: string) => `${category}\u0000${scale}`;

/** The mean drives both the shading and the printed number. */
export function ScoresHeatmap({
  data,
  scaleNames,
}: {
  data: CrossTabData;
  /** Full scale names, shown on hover over the headers (and spelt out on phones). */
  scaleNames?: Record<string, string>;
}) {
  const vertical = useMediaQuery('(max-width: 639px)');
  const byKey = new Map(data.cells.map((c) => [cellKey(c.category, c.scale), c]));

  const values = data.cells
    .map((c) => c.stats?.mean)
    .filter((v): v is number => typeof v === 'number');

  if (values.length === 0) {
    return (
      <p className="py-10 text-center text-sm text-muted-foreground">
        No scores available for this combination.
      </p>
    );
  }

  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min;

  // Same data, either orientation: rows × columns, and how to find a cell.
  const rows = vertical ? data.scales : data.categories;
  const columns = vertical ? data.categories : data.scales;
  const cellAt = (row: string, column: string): CrossCell | undefined =>
    vertical ? byKey.get(cellKey(column, row)) : byKey.get(cellKey(row, column));
  // Full name under the code, unless it only repeats it (WISP).
  const rowName = (scale: string) => {
    const name = scaleFullName(scaleNames, scale);
    return name && name !== scale ? name : undefined;
  };
  const describe = (row: string, column: string) =>
    vertical ? `${column} · ${row}` : `${row} · ${column}`;

  return (
    <div className="flex flex-col gap-3">
      {/* Scrolls sideways with many scales: focusable so the keyboard can too */}
      <div
        className="overflow-x-auto focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        tabIndex={0}
        role="region"
        aria-label="Score heatmap"
      >
        <table className="w-full border-separate border-spacing-1 text-xs">
          <thead>
            <tr>
              {/* Visually empty corner over the row labels, but named: an
                  empty <th> is announced as a header with no text. */}
              <th
                scope="col"
                className="sticky left-0 bg-card text-left font-medium text-muted-foreground"
              >
                <span className="sr-only">
                  {vertical ? 'Scale' : (data.question?.text ?? 'Category')}
                </span>
              </th>
              {columns.map((column) =>
                vertical ? (
                  // Category labels are long: wrapped over a few lines.
                  <th
                    key={column}
                    scope="col"
                    title={column}
                    className="px-1 pb-1 text-center align-bottom text-xs font-semibold leading-tight text-muted-foreground"
                  >
                    <span className="line-clamp-3">{column}</span>
                  </th>
                ) : (
                  <th
                    key={column}
                    scope="col"
                    title={scaleFullName(scaleNames, column)}
                    className="px-2 pb-1 text-center font-semibold text-muted-foreground"
                  >
                    {column}
                  </th>
                )
              )}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row}>
                {vertical ? (
                  // No hover on a phone: the full scale name is written out.
                  <th
                    scope="row"
                    className="sticky left-0 bg-card pr-2 text-left font-medium text-foreground"
                  >
                    <span className="block">{row}</span>
                    {rowName(row) && (
                      <span className="block max-w-28 text-xs font-normal leading-tight text-muted-foreground">
                        {rowName(row)}
                      </span>
                    )}
                  </th>
                ) : (
                  <th
                    scope="row"
                    // Wraps instead of truncating: a `title` tooltip is mouse-only.
                    className="sticky left-0 max-w-44 wrap-break-word bg-card pr-2 text-left font-medium leading-tight text-foreground"
                  >
                    {row}
                  </th>
                )}

                {columns.map((column) => {
                  const cell = cellAt(row, column);
                  const value = cell?.stats?.mean;

                  if (typeof value !== 'number') {
                    return (
                      <td
                        key={column}
                        className="rounded-md bg-muted/40 px-2 py-2.5 text-center text-muted-foreground/60"
                        title={`${describe(row, column)}: no data`}
                      >
                        <span aria-hidden="true">–</span>
                        <span className="sr-only">No data</span>
                      </td>
                    );
                  }

                  // A single observed value gives no range to normalise against,
                  // so it is shown at full saturation.
                  const t = span > 0 ? (value - min) / span : 1;

                  return (
                    <td
                      key={column}
                      className="rounded-md px-2 py-2.5 text-center font-medium text-foreground"
                      style={{ backgroundColor: shade(t) }}
                      title={`${describe(row, column)}\nmean: ${value}\nn = ${cell?.stats?.n ?? 0}`}
                    >
                      {value}
                      <span className="sr-only">, n = {cell?.stats?.n ?? 0}</span>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Legend */}
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <span>Mean {METRIC_SHORT_LABEL[data.metric]}</span>
        <span>{min}</span>
        <span
          className="h-2 w-28 rounded-full"
          style={{
            background: `linear-gradient(to right, ${shade(0)}, ${shade(0.5)}, ${shade(1)})`,
          }}
        />
        <span>{max}</span>
      </div>
    </div>
  );
}
