import {
  Legend,
  PolarAngleAxis,
  PolarGrid,
  PolarRadiusAxis,
  Radar,
  RadarChart,
  ResponsiveContainer,
  Tooltip,
} from 'recharts';
import { METRIC_SHORT_LABEL, scaleFullName, type CrossTabData } from './scoresTypes';

/**
 * Radar chart: one outline per socio-demographic category, one spoke per scale.
 *
 * The quality-of-life view: it shows the SHAPE of each group's profile across
 * every scale at once, which the heatmap (one cell at a time) and the boxplot
 * (one scale at a time) cannot.
 */

/** Distinguishable outlines; beyond this many groups a radar stops being readable. */
// Each colour is at least 3:1 against white (WCAG 1.4.11).
const SERIES_COLORS = ['#6a68ac', '#8b5cf6', '#0369a1', '#b45309', '#047857', '#ef4444'];
// A distinct dash pattern per series (also drawn in the legend), so the
// outlines can be told apart without relying on colour (WCAG 1.4.1).
const SERIES_DASHES: (string | undefined)[] = [undefined, '6 3', '2 2', '10 3 2 3', '4 4', '1 3'];
const MAX_SERIES = SERIES_COLORS.length;

/** One outline per group, plotting each scale's mean. */
export function ScoresRadar({
  data,
  scaleNames,
}: {
  data: CrossTabData;
  /** Full scale names, shown in the tooltip of each spoke. */
  scaleNames?: Record<string, string>;
}) {
  // Radar needs at least three spokes to enclose an area.
  if (data.scales.length < 3) {
    return (
      <p className="py-10 text-center text-sm text-muted-foreground">
        A radar needs at least three scales — pick more of them, or use another chart.
      </p>
    );
  }

  const byKey = new Map(data.cells.map((c) => [`${c.category}\u0000${c.scale}`, c]));

  // Largest groups first: with many categories only the first few are drawn, and
  // the best-supported ones are the most worth showing.
  const categories = [...data.categories]
    .map((category) => ({
      category,
      n: data.scales.reduce(
        (sum, scale) => sum + (byKey.get(`${category}\u0000${scale}`)?.stats?.n ?? 0),
        0
      ),
    }))
    .sort((a, b) => b.n - a.n)
    .slice(0, MAX_SERIES)
    .map((c) => c.category);

  const rows = data.scales.map((scale) => {
    const row: Record<string, string | number | null> = { scale };
    for (const category of categories) {
      row[category] = byKey.get(`${category}\u0000${scale}`)?.stats?.mean ?? null;
    }
    return row;
  });

  const hidden = data.categories.length - categories.length;

  // Text alternative (WCAG 1.1.1): each drawn group's mean on every scale.
  const description = categories
    .map(
      (category) =>
        `${category}: ${rows.map((r) => `${r.scale} ${r[category] ?? 'no data'}`).join(', ')}`
    )
    .join('; ');

  return (
    <div className="flex flex-col gap-2">
      <div role="img" aria-label={`Radar chart of the mean per scale by group. ${description}.`}>
        <ResponsiveContainer width="100%" height={380} minWidth={0}>
          {/* accessibilityLayer off: the wrapper is the image, the SVG must not take focus */}
          <RadarChart data={rows} outerRadius="72%" accessibilityLayer={false}>
            <PolarGrid stroke="#e2e8f0" />
            <PolarAngleAxis dataKey="scale" tick={{ fontSize: 11 }} />
            <PolarRadiusAxis tick={{ fontSize: 9 }} angle={90} />
            <Tooltip
              formatter={(value) => [typeof value === 'number' ? value : '–', '']}
              labelFormatter={(label) => {
                const name = scaleFullName(scaleNames, String(label));
                return name ? `${label} — ${name}` : label;
              }}
              contentStyle={{ fontSize: 11, borderRadius: 8 }}
            />
            <Legend wrapperStyle={{ fontSize: 11 }} iconType="plainline" />

            {categories.map((category, i) => (
              <Radar
                key={category}
                name={category}
                dataKey={category}
                stroke={SERIES_COLORS[i]}
                fill={SERIES_COLORS[i]}
                fillOpacity={0.12}
                strokeWidth={2}
                {...(SERIES_DASHES[i] ? { strokeDasharray: SERIES_DASHES[i] } : {})}
                isAnimationActive={false}
              />
            ))}
          </RadarChart>
        </ResponsiveContainer>
      </div>

      <p className="text-center text-xs text-muted-foreground">
        Mean {METRIC_SHORT_LABEL[data.metric]} per scale
        {hidden > 0 && ` · showing the ${categories.length} largest groups, ${hidden} more hidden`}
      </p>
    </div>
  );
}
