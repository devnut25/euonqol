/**
 * Shapes answer counts into the distributions the dashboard charts draw.
 *
 * The order is part of the reading: options follow the order the questionnaire
 * shows them in, numbers and dates run from the smallest to the largest, and
 * skips come last whatever their count — sorting by frequency made every chart
 * of the same question look different and hid the scale of ordinal answers.
 */

import type { PrismaClient } from '../../generated/app/index.js';
import { isSkipMarker } from '../../helpers/questionText.js';

export interface DistributionPoint {
  label: string;
  count: number;
  percentage: number;
}

export type DistributionChart = 'donut' | 'horizontal_bar' | 'histogram';

/** Free-text answers beyond this many distinct values are cut to the most frequent. */
const MAX_FREE_TEXT_CATEGORIES = 10;

/** Up to this many distinct numbers get one bar each; past it they are bucketed. */
const MAX_NUMERIC_BARS = 15;
const NUMERIC_BUCKETS = 5;

/** Up to this many categories a donut stays readable. */
const MAX_DONUT_SLICES = 6;

export const percentage = (count: number, total: number) =>
  total > 0 ? Math.round((count / total) * 100) : 0;

/** The chart for categories with no order of magnitude: a donut while it stays readable. */
export function categoricalChart(categories: number): DistributionChart {
  return categories <= MAX_DONUT_SLICES ? 'donut' : 'horizontal_bar';
}

/**
 * Position of each question in the questionnaire, to list charts in the order
 * the respondent saw the questions. A question used by several modules takes
 * its earliest position.
 */
export async function loadQuestionPositions(
  prisma: PrismaClient,
  questionIds: number[]
): Promise<Map<number, number>> {
  const positions = new Map<number, number>();
  if (questionIds.length === 0) return positions;

  const rows = await prisma.modules_questions.findMany({
    where: { question_id: { in: questionIds }, is_active: true },
    select: { question_id: true, position: true },
  });
  for (const { question_id, position } of rows) {
    const current = positions.get(question_id);
    if (position != null && (current === undefined || position < current)) {
      positions.set(question_id, position);
    }
  }
  return positions;
}

/** Compares two questions by questionnaire position, then by code. */
export function byQuestionPosition<T extends { id: number; code: string }>(
  positions: Map<number, number>
) {
  return (a: T, b: T) =>
    (positions.get(a.id) ?? Number.MAX_SAFE_INTEGER) -
      (positions.get(b.id) ?? Number.MAX_SAFE_INTEGER) || a.code.localeCompare(b.code);
}

function isNumeric(label: string): boolean {
  return label.trim() !== '' && Number.isFinite(Number(label));
}

/** A date written as `YYYY-MM-DD` or `DD/MM/YYYY`, as a timestamp, or null. */
function parseDateLabel(label: string): number | null {
  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(label);
  const eu = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(label);
  const [y, m, d] = iso
    ? [iso[1], iso[2], iso[3]]
    : eu
      ? [eu[3], eu[2], eu[1]]
      : [null, null, null];
  if (!y) return null;
  const time = Date.UTC(Number(y), Number(m) - 1, Number(d));
  return Number.isNaN(time) ? null : time;
}

/** Skips, in a stable order, to be appended after the answers themselves. */
function skipPoints(counts: Map<string, number>, total: number): DistributionPoint[] {
  return [...counts.entries()]
    .filter(([label]) => isSkipMarker(label))
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([label, count]) => ({ label, count, percentage: percentage(count, total) }));
}

/** Numbers from the smallest up: one bar per value, or ranges when there are many. */
function numericPoints(entries: [string, number][], total: number): DistributionPoint[] {
  const values = entries
    .map(([label, count]) => ({ value: Number(label), count }))
    .sort((a, b) => a.value - b.value);

  if (values.length <= MAX_NUMERIC_BARS) {
    return values.map(({ value, count }) => ({
      label: String(value),
      count,
      percentage: percentage(count, total),
    }));
  }

  const min = values[0].value;
  const max = values[values.length - 1].value;
  const step = (max - min) / NUMERIC_BUCKETS;
  const buckets = Array.from({ length: NUMERIC_BUCKETS }, (_, i) => {
    const from = Math.round(min + i * step);
    const to = i === NUMERIC_BUCKETS - 1 ? Math.ceil(max) : Math.round(min + (i + 1) * step) - 1;
    return { from, to, count: 0 };
  });
  for (const { value, count } of values) {
    const bucket = buckets.find((b) => value >= b.from && value <= b.to) ?? buckets.at(-1)!;
    bucket.count += count;
  }
  return buckets.map(({ from, to, count }) => ({
    label: `${from}–${to}`,
    count,
    percentage: percentage(count, total),
  }));
}

/**
 * The distribution of one question's answers, and the chart that suits it.
 *
 * @param counts      answer label → how many respondents gave it
 * @param total       respondents who answered, the base of the percentages
 * @param optionOrder English option label → its position among the options
 * @param numeric     the question asks for a number (its answers are bucketed)
 */
export function buildDistribution(
  counts: Map<string, number>,
  total: number,
  optionOrder: Map<string, number>,
  numeric = false
): { chart: DistributionChart; data: DistributionPoint[] } {
  const answers = [...counts.entries()].filter(([label]) => !isSkipMarker(label));
  const skips = skipPoints(counts, total);

  if (answers.length > 0 && (numeric || answers.every(([label]) => isNumeric(label)))) {
    return { chart: 'histogram', data: [...numericPoints(answers, total), ...skips] };
  }

  const dates = answers.map(([label, count]) => ({ label, count, time: parseDateLabel(label) }));
  if (dates.length > 0 && dates.every((d) => d.time !== null)) {
    const data = dates
      .sort((a, b) => a.time! - b.time!)
      .map(({ label, count }) => ({ label, count, percentage: percentage(count, total) }));
    return { chart: 'histogram', data: [...data, ...skips] };
  }

  // Options in their own order; free text after them, most frequent first.
  const options = answers
    .filter(([label]) => optionOrder.has(label))
    .sort(([a], [b]) => optionOrder.get(a)! - optionOrder.get(b)!);
  const freeText = answers
    .filter(([label]) => !optionOrder.has(label))
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, MAX_FREE_TEXT_CATEGORIES);

  const data = [...options, ...freeText]
    .map(([label, count]) => ({ label, count, percentage: percentage(count, total) }))
    .concat(skips);

  return { chart: categoricalChart(data.length), data };
}
