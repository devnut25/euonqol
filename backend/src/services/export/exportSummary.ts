/**
 * The two sheets that frame the long-format data in the export workbook:
 *
 *   Summary  — what the file is (survey, filters, who and when) and who took
 *              part, so it reads on its own away from the dashboard;
 *   Columns  — what every column of LongData means.
 *
 * The participation figures count every assignment the filters select, including
 * those LongData may not contain (not started, or unfinished on an
 * anonymous-on-invitation survey): only aggregate numbers, never a patient. The
 * patient and language counts follow LongData. Everything runs before any row is
 * streamed: Summary is the first sheet of the workbook.
 */

import type ExcelJS from 'exceljs';
import type { PrismaClient } from '../../generated/app/index.js';
import type { ExportColumn } from './exportColumns.js';
import { ACCESS_MODE_LABELS, LIFECYCLE_STATUS_LABELS, labelOf } from './exportLabels.js';

/** What the export was asked for, as the Summary sheet reports it. */
export interface SummaryInput {
  surveyId: number;
  /** The assignments LongData is built from. */
  assignmentWhere: Record<string, unknown>;
  /** Every assignment the filters select, for the participation counts. */
  participationWhere: Record<string, unknown>;
  questionnaires: { surveyQuestionnaireId: number; title: string; patientGroupName: string }[];
  filters: {
    questionnaireId?: number;
    groupId?: number;
    accessMode?: string;
    dateFrom?: string;
    dateTo?: string;
    completionStatus?: string;
  };
  questionnaireTitleById: Map<number, string>;
  rowCount: number;
  columnCount: number;
  totalColumnCount: number;
  exportedBy: string;
  languages: Map<number, string>;
}

interface StatusCounts {
  completed: number;
  inProgress: number;
  notStarted: number;
}

const emptyCounts = (): StatusCounts => ({ completed: 0, inProgress: 0, notStarted: 0 });

function addStatus(counts: StatusCounts, status: string | null, n: number) {
  if (status === 'completed') counts.completed += n;
  else if (status === 'in_progress') counts.inProgress += n;
  else counts.notStarted += n;
}

const total = (c: StatusCounts) => c.completed + c.inProgress + c.notStarted;

/** `12 (40%)`, or just the count when there is nothing to divide by. */
function withShare(n: number, of: number): string {
  return of > 0 ? `${n} (${Math.round((n / of) * 100)}%)` : String(n);
}

function formatDate(date: Date | null | undefined): string {
  return date ? date.toISOString().replace('T', ' ').slice(0, 19) : '';
}

function formatDay(date: Date | null | undefined): string {
  return date ? date.toISOString().slice(0, 10) : '';
}

const STATUS_FILTER_LABELS: Record<string, string> = {
  completed: 'Completed only',
  in_progress: 'Pending only',
  all: 'Completed and pending',
};

/** Loads everything the Summary sheet shows, then writes it as the first sheet. */
export async function writeSummarySheet(
  prisma: PrismaClient,
  workbook: ExcelJS.stream.xlsx.WorkbookWriter,
  input: SummaryInput
): Promise<void> {
  const { assignmentWhere, participationWhere } = input;

  const [
    survey,
    bySqAndStatus,
    byAccessMode,
    patients,
    answeredLanguages,
    startedWithoutAnswers,
    completedRange,
    group,
  ] = await Promise.all([
      prisma.surveys.findUnique({
        where: { id: input.surveyId },
        select: {
          id: true,
          name: true,
          status: true,
          access_mode: true,
          starting_date: true,
          end_date: true,
          max_completions: true,
          ctt_norms_version: { select: { name: true } },
          surveys_questionnaires: {
            select: {
              questionnaire: {
                select: { title: true, ctt_norms_version: { select: { name: true } } },
              },
            },
          },
        },
      }),
      prisma.survey_questionnaire_patients_assignment.groupBy({
        by: ['survey_questionnaire_id', 'completion_status'],
        where: participationWhere,
        _count: { id: true },
      }),
      prisma.survey_questionnaire_patients_assignment.groupBy({
        by: ['access_mode', 'completion_status'],
        where: participationWhere,
        _count: { id: true },
      }),
      prisma.survey_questionnaire_patients_assignment.findMany({
        where: assignmentWhere,
        distinct: ['patient_id'],
        select: { patient: { select: { is_anonymous: true } } },
      }),
      // One entry per (assignment, language): a questionnaire answered in one
      // language counts once, however many answers it has.
      prisma.responses.findMany({
        where: { assignment: assignmentWhere },
        distinct: ['assignment_id', 'language_id'],
        select: { language_id: true },
      }),
      // Started but left before the first answer was saved: no response
      // language, so missing from the language table.
      prisma.survey_questionnaire_patients_assignment.count({
        where: {
          AND: [
            assignmentWhere,
            { completion_status: { in: ['in_progress', 'completed'] } },
            { responses: { none: {} } },
          ],
        },
      }),
      prisma.survey_questionnaire_patients_assignment.aggregate({
        where: { AND: [participationWhere, { completion_status: 'completed' }] },
        _min: { completed_at: true },
        _max: { completed_at: true },
      }),
      input.filters.groupId
        ? prisma.patient_groups.findUnique({
            where: { id: input.filters.groupId },
            select: { name: true },
          })
        : Promise.resolve(null),
    ]);

  // ── Aggregates ────────────────────────────────────────────────────────────
  const overall = emptyCounts();
  const bySq = new Map<number, StatusCounts>();
  for (const row of bySqAndStatus) {
    addStatus(overall, row.completion_status, row._count.id);
    const counts = bySq.get(row.survey_questionnaire_id) ?? emptyCounts();
    addStatus(counts, row.completion_status, row._count.id);
    bySq.set(row.survey_questionnaire_id, counts);
  }

  // A questionnaire targets exactly one group, so the group table is the
  // questionnaire table summed by group.
  const byGroup = new Map<string, StatusCounts>();
  for (const q of input.questionnaires) {
    const counts = bySq.get(q.surveyQuestionnaireId);
    if (!counts) continue;
    const name = q.patientGroupName || '—';
    const acc = byGroup.get(name) ?? emptyCounts();
    acc.completed += counts.completed;
    acc.inProgress += counts.inProgress;
    acc.notStarted += counts.notStarted;
    byGroup.set(name, acc);
  }

  const byMode = new Map<string, StatusCounts>();
  for (const row of byAccessMode) {
    const mode = row.access_mode ?? '';
    const counts = byMode.get(mode) ?? emptyCounts();
    addStatus(counts, row.completion_status, row._count.id);
    byMode.set(mode, counts);
  }

  const byLanguage = new Map<string, number>();
  for (const { language_id } of answeredLanguages) {
    const name = input.languages.get(language_id) ?? `Language ${language_id}`;
    byLanguage.set(name, (byLanguage.get(name) ?? 0) + 1);
  }

  const anonymous = patients.filter((p) => p.patient.is_anonymous).length;

  // Norms versions in use: the survey's, plus any questionnaire that overrides
  // it with a different one.
  const surveyNorms = survey?.ctt_norms_version?.name ?? 'Built-in defaults';
  const overrides = (survey?.surveys_questionnaires ?? [])
    .filter((sq) => {
      const name = sq.questionnaire.ctt_norms_version?.name;
      return name && name !== surveyNorms;
    })
    .map((sq) => `${sq.questionnaire.ctt_norms_version!.name} (${sq.questionnaire.title})`);
  const norms =
    overrides.length > 0 ? `${surveyNorms}; overridden by: ${overrides.join(', ')}` : surveyNorms;

  const f = input.filters;
  const filterLines = [
    f.questionnaireId
      ? `Questionnaire: ${input.questionnaireTitleById.get(f.questionnaireId) ?? `#${f.questionnaireId}`}`
      : null,
    f.groupId ? `Patient group: ${group?.name ?? `#${f.groupId}`}` : null,
    f.accessMode ? `Access mode: ${ACCESS_MODE_LABELS[f.accessMode] ?? f.accessMode}` : null,
    f.dateFrom || f.dateTo ? `Dates: ${f.dateFrom ?? '…'} – ${f.dateTo ?? '…'}` : null,
    f.completionStatus
      ? `Assignment status: ${STATUS_FILTER_LABELS[f.completionStatus] ?? f.completionStatus}`
      : null,
  ].filter((l): l is string => l !== null);

  const assigned = total(overall);
  const target = survey?.max_completions ?? null;

  // A spontaneous respondent who leaves cannot resume: what is unfinished there
  // is not completed, not in progress. Nor can anything be not started: the
  // assignment only comes into being when the respondent starts, already in
  // progress. The status is hidden there, unless the data says otherwise.
  const spontaneous = survey?.access_mode === 'anonymous_spontaneous';
  const inProgressLabel = spontaneous ? 'Not completed' : 'Pending';
  const showNotStarted = !spontaneous || overall.notStarted > 0;
  const statusHeaders = [
    'Accesses',
    'Completed',
    inProgressLabel,
    ...(showNotStarted ? ['Not started'] : []),
  ];
  const statusCells = (c: StatusCounts) => [
    total(c),
    c.completed,
    c.inProgress,
    ...(showNotStarted ? [c.notStarted] : []),
  ];

  // ── Sheet ─────────────────────────────────────────────────────────────────
  const sheet = workbook.addWorksheet('Summary');
  sheet.columns = [
    { width: 34 },
    { width: 44 },
    { width: 14 },
    { width: 14 },
    { width: 14 },
    { width: 14 },
  ];

  const title = (text: string) => {
    const row = sheet.addRow([text]);
    row.font = { bold: true, size: 13 };
    row.commit();
  };
  const section = (text: string) => {
    sheet.addRow([]).commit();
    const row = sheet.addRow([text]);
    row.font = { bold: true, size: 12 };
    row.commit();
  };
  const field = (label: string, value: string | number) => {
    const row = sheet.addRow([label, value]);
    row.getCell(1).font = { bold: true };
    row.commit();
  };
  const tableHeader = (cells: string[]) => {
    const row = sheet.addRow(cells);
    row.font = { bold: true };
    row.commit();
  };
  const tableRow = (cells: (string | number)[]) => sheet.addRow(cells).commit();

  title('Survey data export — summary');

  section('Export');
  field('Survey', survey?.name ?? '');
  field('Survey status', labelOf(LIFECYCLE_STATUS_LABELS, survey?.status));
  field('Access mode', labelOf(ACCESS_MODE_LABELS, survey?.access_mode));
  field(
    'Survey period',
    survey?.starting_date || survey?.end_date
      ? `${formatDay(survey?.starting_date) || '…'} – ${formatDay(survey?.end_date) || '…'}`
      : ''
  );
  field('Exported at', `${formatDate(new Date())} (UTC)`);
  field('Exported by', input.exportedBy);
  if (filterLines.length === 0) {
    field('Filters', 'None: the whole survey');
  } else {
    filterLines.forEach((line, i) => field(i === 0 ? 'Filters' : '', line));
  }
  field('Rows in LongData', input.rowCount);
  field('Columns', `${input.columnCount} of ${input.totalColumnCount}`);
  field('CTT norms', norms);
  field('Dates', 'Every date and time in this file is in UTC.');

  section('Participation');
  field('Accesses', assigned);
  field('Completed', withShare(overall.completed, assigned));
  field(inProgressLabel, withShare(overall.inProgress, assigned));
  if (showNotStarted) field('Not started', withShare(overall.notStarted, assigned));
  if (target) field('Completion target', `${withShare(overall.completed, target)} of ${target}`);
  field(
    'Patients',
    anonymous > 0 ? `${patients.length} (${anonymous} anonymous)` : patients.length
  );
  field('First completion', formatDate(completedRange._min.completed_at));
  field('Last completion', formatDate(completedRange._max.completed_at));

  section('By questionnaire');
  tableHeader(['Questionnaire', 'Patient group', ...statusHeaders]);
  for (const q of input.questionnaires) {
    const c = bySq.get(q.surveyQuestionnaireId) ?? emptyCounts();
    tableRow([q.title, q.patientGroupName, ...statusCells(c)]);
  }

  // A breakdown with a single row only repeats the totals above.
  if (byGroup.size > 1) {
    section('By patient group');
    tableHeader(['Patient group', '', ...statusHeaders]);
    for (const [name, c] of [...byGroup.entries()].sort(([a], [b]) => a.localeCompare(b))) {
      tableRow([name, '', ...statusCells(c)]);
    }
  }

  if (byMode.size > 1) {
    section('By access mode');
    tableHeader(['Access mode', '', ...statusHeaders]);
    for (const [mode, c] of byMode) {
      tableRow([ACCESS_MODE_LABELS[mode] ?? mode, '', ...statusCells(c)]);
    }
  }

  section('By response language');
  tableHeader(['Language', 'Questionnaires answered']);
  for (const [name, n] of [...byLanguage.entries()].sort((a, b) => b[1] - a[1])) {
    tableRow([name, n]);
  }
  if (startedWithoutAnswers > 0) {
    tableRow([
      `${startedWithoutAnswers} started questionnaire(s) have no answer saved, so no response language: they are not counted here.`,
    ]);
  }

  await sheet.commit();
}

/** Writes the column legend: one row per column present in LongData. */
export async function writeColumnsSheet(
  workbook: ExcelJS.stream.xlsx.WorkbookWriter,
  columns: ExportColumn[]
): Promise<void> {
  const sheet = workbook.addWorksheet('Columns');
  sheet.columns = [{ width: 30 }, { width: 100 }];

  const header = sheet.addRow(['Column', 'Meaning']);
  header.font = { bold: true };
  header.commit();

  for (const c of columns) {
    sheet.addRow([c.header, c.description]).commit();
  }

  await sheet.commit();
}
