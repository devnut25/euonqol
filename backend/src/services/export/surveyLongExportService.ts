/**
 * Survey long-format data export.
 *
 * One XLSX row per row in `responses` — no more, no less. Items that were never
 * administered (the adaptive CAT bank is far larger than what any patient sees)
 * produce no answer and therefore no row, but every answer that exists is
 * exported, skips included.
 *
 * The answers are the source; the questionnaire structure only decorates them.
 * The reverse — selecting answers by walking the current catalogue — silently
 * dropped everything whose question or module had since been deactivated, which
 * is why a respondent could show fewer rows than they had answered. A question
 * no longer in the questionnaire now exports with empty module columns.
 *
 * By default the export is the whole survey: the dashboard dock filters narrow
 * what the tabs show, not what gets downloaded. Every assignment with answers is
 * in — finished and in-progress alike, told apart by the `completion_status`
 * column — except on anonymous-on-invitation surveys, where an unfinished
 * questionnaire still belongs to a patient not yet anonymized and is never
 * exported (see {@link EXPORTABLE_ASSIGNMENT}). Only when the whole survey would exceed {@link MAX_EXPORT_ROWS} does
 * the export dialog offer its own filters ({@link ExportFilters}) to cut it down.
 * In-progress ones carry no scores yet (scoring runs on completion) and no
 * completion date; assignments nobody has started have no answers, so no rows.
 *
 * The workbook is streamed straight onto the response with exceljs, so memory
 * stays flat regardless of dataset size. The flip side is that headers go out
 * with the first byte: every recoverable failure (empty result, too many rows)
 * MUST be detected before writing starts, which is what `prepareExport` is for.
 */

import ExcelJS from 'exceljs';
import type { Writable } from 'node:stream';
import type { PrismaClient } from '../../generated/app/index.js';
import { normalizeScaleCode } from '../../config/scaleDimensions.js';
import { buildDateRange, completionWhere, type StatusFilter } from '../../helpers/statusFilters.js';
import { EXPORT_COLUMNS, type ExportColumn, type ExportRow } from './exportColumns.js';
import { loadSurveyScaleNames } from '../scores/surveyScaleNames.js';
import { loadExportLookups } from './exportLookups.js';
import { writeColumnsSheet, writeSummarySheet } from './exportSummary.js';
import { estimateViewedAt } from './questionViewTime.js';
import { isDisclaimer, resolveAnswerCells, stripHtml } from './exportAnswer.js';
import { indexAssignmentScores, resolveScore, type ModuleScoreContext } from './scoreResolver.js';

/**
 * Upper bound on exported rows. Excel itself stops at 1_048_576; this sits below
 * that so the user gets an actionable message instead of a corrupt file.
 */
export const MAX_EXPORT_ROWS = Number(process.env.MAX_EXPORT_ROWS ?? 500_000);

/** Assignments pulled per round-trip — `scores` is bulky, so keep batches small. */
const CHUNK_SIZE = 250;

/**
 * Optional narrowing, set from the export dialog when the whole survey is too
 * large. Every field left out means "no restriction".
 */
export interface ExportFilters {
  questionnaireId?: number;
  groupId?: number;
  accessMode?: string;
  dateFrom?: string;
  dateTo?: string;
  /** Assignment status. Left out, finished and in-progress are both exported. */
  completionStatus?: StatusFilter;
}

export class ExportTooLargeError extends Error {
  constructor(
    public readonly rowCount: number,
    public readonly maxRows: number
  ) {
    super(
      `This export would produce ${rowCount.toLocaleString('en-US')} rows, over the ` +
        `${maxRows.toLocaleString('en-US')} row limit. Narrow it down with the filters and ` +
        `try again.`
    );
    this.name = 'ExportTooLargeError';
  }
}

export class ExportEmptyError extends Error {
  constructor() {
    super('No responses found for this survey and filters');
    this.name = 'ExportEmptyError';
  }
}

interface QuestionMeta {
  id: number;
  question_code: string;
  question_kind: string;
  scale: string | null;
  score_system: string | null;
  answer_profile_id: number | null;
  /** `text` for open questions; the player tells disclaimers apart with it. */
  question_type: string | null;
  /** Set on adaptive items: they belong to a bank, not to a questionnaire. */
  cat_item_bank_id: number | null;
}

interface ModuleMeta {
  id: number;
  name: string;
  type: string;
  dimensionOrder: string[] | null;
  /** Set on dynamic modules: the bank its adaptive items are drawn from. */
  catItemBankId: number | null;
}

interface QuestionnaireMeta {
  surveyQuestionnaireId: number;
  questionnaireId: number;
  title: string;
  /**
   * Patient group of the questionnaire, which is the patient's own group.
   *
   * The questionnaire is where the group actually lives
   * (`questionnaires.patient_group_id`, NOT NULL), and a patient belongs to
   * exactly one questionnaire. `patients.group_id` is a nullable copy of it:
   * every creation path writes it today, but patients created before they did
   * have none, so this is the fallback for them.
   */
  patientGroupName: string;
  /** question_id → module it belongs to, within this questionnaire. */
  moduleByQuestion: Map<number, ModuleMeta>;
  /**
   * cat_item_bank_id → the dynamic module drawing from it.
   *
   * An adaptive item is picked at run time out of the bank and has no
   * `modules_questions` row, so this is the only way to attribute its answer to
   * a module — and therefore to give it a type, a scale and an IRT score.
   */
  dynamicModuleByBank: Map<number, ModuleMeta>;
}

export interface PreparedExport {
  surveyId: number;
  surveyName: string;
  questionnaires: QuestionnaireMeta[];
  questionsById: Map<number, QuestionMeta>;
  /** Assignments LongData is built from: the filters, minus what may not be exported. */
  assignmentWhere: Record<string, unknown>;
  /** Every assignment the filters select, for the Summary's participation counts. */
  participationWhere: Record<string, unknown>;
  /** Full scale names by canonical code, as the Scores tab shows them. */
  scaleNames: Record<string, string>;
  /** Rows LongData will have, already counted for the row guard. */
  rowCount: number;
  filters: ExportFilters;
}

/** Reads `dimensionOrder` out of a cat_setting's untrusted JSON configuration. */
function readDimensionOrder(apiConfiguration: unknown): string[] | null {
  if (typeof apiConfiguration !== 'object' || apiConfiguration === null) return null;
  const order = (apiConfiguration as Record<string, unknown>).dimensionOrder;
  if (!Array.isArray(order)) return null;
  const strings = order.filter((d): d is string => typeof d === 'string');
  return strings.length > 0 ? strings : null;
}

/**
 * Assignments whose answers may leave the platform.
 *
 * An anonymous-on-invitation patient is only anonymized once their questionnaire
 * is completed: until then the row still carries the identifier entered at
 * invitation, so those assignments are never exported, whatever the filters.
 * Traced surveys are pseudonymized by design and export in-progress ones too.
 */
const EXPORTABLE_ASSIGNMENT: Record<string, unknown> = {
  OR: [
    { access_mode: null },
    { access_mode: { not: 'anonymous_on_invitation' } },
    { completion_status: 'completed' },
  ],
};

/** {@link buildAssignmentWhere} restricted to what may be exported. */
function buildExportableWhere(surveyId: number, filters: ExportFilters): Record<string, unknown> {
  return { AND: [buildAssignmentWhere(surveyId, filters), EXPORTABLE_ASSIGNMENT] };
}

/**
 * The survey's assignments, narrowed only by the filters actually given.
 *
 * This is everything the filters select, including assignments that may not be
 * exported: the Summary counts them, LongData uses {@link buildExportableWhere}.
 */
function buildAssignmentWhere(surveyId: number, filters: ExportFilters): Record<string, unknown> {
  const where: Record<string, unknown> = {
    survey_questionnaire: {
      survey_id: surveyId,
      ...(filters.questionnaireId ? { questionnaire_id: filters.questionnaireId } : {}),
      // Read off the questionnaire, see helpers/statusFilters.ts#questionnaireScope.
      ...(filters.groupId ? { questionnaire: { patient_group_id: filters.groupId } } : {}),
    },
  };

  if (filters.accessMode) where.access_mode = filters.accessMode;

  // Status and dates follow the same rules as the dashboard, so a date range
  // places in-progress assignments by their last activity. With neither given
  // nothing is added: assignments nobody started have no answers anyway.
  const dateRange = buildDateRange(filters.dateFrom, filters.dateTo);
  if (filters.completionStatus || dateRange) {
    Object.assign(where, completionWhere(filters.completionStatus ?? 'all', dateRange));
  }

  return where;
}

/**
 * Rows the export would have, one per answer, without building it.
 *
 * The export dialog calls it live while the filters change, so it shares
 * {@link buildAssignmentWhere} with the export itself: the preview and the file
 * cannot disagree.
 */
export async function countExportRows(
  prisma: PrismaClient,
  surveyId: number,
  filters: ExportFilters = {}
): Promise<number> {
  return prisma.responses.count({
    where: { assignment: buildExportableWhere(surveyId, filters) },
  });
}

/**
 * `YYYY-MM-DD HH:MM:SS.mmm` in UTC, the format every date column of LongData
 * uses. Milliseconds are kept: answers given within the same second would
 * otherwise look simultaneous.
 */
function formatTimestamp(date: Date | null | undefined): string {
  return date ? date.toISOString().replace('T', ' ').slice(0, 23) : '';
}

/**
 * Loads metadata and enforces the row guard, before any byte is written.
 *
 * Throws {@link ExportEmptyError} or {@link ExportTooLargeError} so the caller can
 * still answer with JSON.
 */
export async function prepareExport(
  prisma: PrismaClient,
  surveyId: number,
  filters: ExportFilters = {}
): Promise<PreparedExport> {
  const survey = await prisma.surveys.findUnique({
    where: { id: surveyId },
    select: { id: true, name: true },
  });
  if (!survey) throw new ExportEmptyError();

  const surveyQuestionnaires = await prisma.surveys_questionnaires.findMany({
    where: {
      survey_id: surveyId,
      ...(filters.questionnaireId ? { questionnaire_id: filters.questionnaireId } : {}),
    },
    select: {
      id: true,
      questionnaire_id: true,
      questionnaire: {
        select: { id: true, title: true, patient_group: { select: { name: true } } },
      },
    },
  });
  if (surveyQuestionnaires.length === 0) throw new ExportEmptyError();

  const questionnaireIds = surveyQuestionnaires.map((sq) => sq.questionnaire_id);

  const moduleRows = await prisma.questionnaires_modules.findMany({
    where: { questionnaire_id: { in: questionnaireIds }, is_active: true },
    orderBy: [{ questionnaire_id: 'asc' }, { position: 'asc' }],
    select: {
      questionnaire_id: true,
      position: true,
      module: {
        select: {
          id: true,
          name: true,
          type: true,
          cat_item_bank_id: true,
          cat_setting: { select: { api_configuration: true } },
          modules_questions: {
            where: { is_active: true },
            orderBy: { position: 'asc' },
            select: {
              question: {
                select: {
                  id: true,
                  question_code: true,
                  question_kind: true,
                  scale: true,
                  score_system: true,
                  answer_profile_id: true,
                  question_type: true,
                  cat_item_bank_id: true,
                },
              },
            },
          },
        },
      },
    },
  });

  const questionsById = new Map<number, QuestionMeta>();
  const moduleByQuestionPerQuestionnaire = new Map<number, Map<number, ModuleMeta>>();
  const dynamicModuleByBankPerQuestionnaire = new Map<number, Map<number, ModuleMeta>>();

  for (const row of moduleRows) {
    const moduleMeta: ModuleMeta = {
      id: row.module.id,
      name: row.module.name,
      type: row.module.type,
      dimensionOrder: readDimensionOrder(row.module.cat_setting?.api_configuration),
      catItemBankId: row.module.cat_item_bank_id,
    };

    if (moduleMeta.type === 'dynamic' && moduleMeta.catItemBankId != null) {
      let byBank = dynamicModuleByBankPerQuestionnaire.get(row.questionnaire_id);
      if (!byBank) {
        byBank = new Map();
        dynamicModuleByBankPerQuestionnaire.set(row.questionnaire_id, byBank);
      }
      if (!byBank.has(moduleMeta.catItemBankId)) byBank.set(moduleMeta.catItemBankId, moduleMeta);
    }

    let moduleByQuestion = moduleByQuestionPerQuestionnaire.get(row.questionnaire_id);
    if (!moduleByQuestion) {
      moduleByQuestion = new Map();
      moduleByQuestionPerQuestionnaire.set(row.questionnaire_id, moduleByQuestion);
    }

    for (const mq of row.module.modules_questions) {
      questionsById.set(mq.question.id, mq.question);

      // A question may sit in two modules of the same questionnaire; modules are
      // walked in position order, so the first one wins deterministically.
      const existing = moduleByQuestion.get(mq.question.id);
      if (existing) {
        console.warn(
          `[Export] Question ${mq.question.id} appears in several modules of questionnaire ` +
            `${row.questionnaire_id}; attributing it to module ${existing.id}`
        );
        continue;
      }
      moduleByQuestion.set(mq.question.id, moduleMeta);
    }
  }

  const assignmentWhere = buildExportableWhere(surveyId, filters);

  // One row per answer, so the answers can simply be counted: exact, and cheap
  // on the (assignment_id) index.
  const rowCount = await countExportRows(prisma, surveyId, filters);
  if (rowCount === 0) throw new ExportEmptyError();
  if (rowCount > MAX_EXPORT_ROWS) throw new ExportTooLargeError(rowCount, MAX_EXPORT_ROWS);

  // Questions that were answered but are no longer in the catalogue — because
  // the question or its module has since been deactivated, or it was answered
  // through a path that does not go via modules_questions. Their answers are
  // still facts and must be exported, so their metadata is loaded here and they
  // take part in the label lookups like any other question.
  const catalogueIds = [...questionsById.keys()];
  const orphanRows = await prisma.responses.findMany({
    where: {
      assignment: assignmentWhere,
      ...(catalogueIds.length > 0 ? { question_id: { notIn: catalogueIds } } : {}),
    },
    select: { question_id: true },
    distinct: ['question_id'],
  });

  if (orphanRows.length > 0) {
    const orphanQuestions = await prisma.questions.findMany({
      where: { id: { in: orphanRows.map((r) => r.question_id) } },
      select: {
        id: true,
        question_code: true,
        question_kind: true,
        scale: true,
        score_system: true,
        answer_profile_id: true,
        question_type: true,
        cat_item_bank_id: true,
      },
    });
    for (const q of orphanQuestions) questionsById.set(q.id, q);

    // Adaptive items are expected to be missing from modules_questions and are
    // resolved through their bank, so they are not what this warning is about.
    const unresolvable = orphanQuestions.filter((q) => q.cat_item_bank_id == null).length;
    if (unresolvable > 0) {
      console.warn(
        `[Export] Survey ${surveyId}: ${unresolvable} answered question(s) are not in the ` +
          'current questionnaire structure (deactivated module or question). They are ' +
          'exported with empty module columns rather than dropped.'
      );
    }
  }

  return {
    surveyId: survey.id,
    surveyName: survey.name,
    scaleNames: await loadSurveyScaleNames(prisma, surveyId),
    rowCount,
    filters,
    questionnaires: surveyQuestionnaires.map((sq) => ({
      surveyQuestionnaireId: sq.id,
      questionnaireId: sq.questionnaire_id,
      title: sq.questionnaire.title,
      patientGroupName: sq.questionnaire.patient_group?.name ?? '',
      moduleByQuestion: moduleByQuestionPerQuestionnaire.get(sq.questionnaire_id) ?? new Map(),
      dynamicModuleByBank:
        dynamicModuleByBankPerQuestionnaire.get(sq.questionnaire_id) ?? new Map(),
    })),
    questionsById,
    assignmentWhere,
    participationWhere: buildAssignmentWhere(surveyId, filters),
  };
}

/**
 * Streams the prepared export as XLSX onto `output`.
 *
 * Must only run after {@link prepareExport} has succeeded — once this starts
 * writing, errors can no longer be turned into an HTTP status.
 */
export async function streamSurveyLongExport(
  prisma: PrismaClient,
  prepared: PreparedExport,
  columns: ExportColumn[],
  output: Writable,
  /** Shown in the Summary sheet: who asked for the export. */
  exportedBy: string
): Promise<number> {
  const answerProfileIds = [
    ...new Set(
      [...prepared.questionsById.values()]
        .map((q) => q.answer_profile_id)
        .filter((id): id is number => id != null)
    ),
  ];

  const lookups = await loadExportLookups(
    prisma,
    [...prepared.questionsById.keys()],
    answerProfileIds
  );

  const workbook = new ExcelJS.stream.xlsx.WorkbookWriter({
    stream: output,
    // Only the Summary and Columns headings are styled; LongData rows are not,
    // so this costs nothing on the part that scales with the data.
    useStyles: true,
    useSharedStrings: false,
  });

  // Sheet order is creation order: Summary first, then the data, then the legend.
  await writeSummarySheet(prisma, workbook, {
    surveyId: prepared.surveyId,
    assignmentWhere: prepared.assignmentWhere,
    participationWhere: prepared.participationWhere,
    questionnaires: prepared.questionnaires,
    filters: prepared.filters,
    questionnaireTitleById: new Map(
      prepared.questionnaires.map((q) => [q.questionnaireId, q.title])
    ),
    rowCount: prepared.rowCount,
    columnCount: columns.length,
    totalColumnCount: EXPORT_COLUMNS.length,
    exportedBy,
    languages: lookups.languages,
  });

  const sheet = workbook.addWorksheet('LongData');
  sheet.addRow(columns.map((c) => c.header)).commit();

  let rowsWritten = 0;

  for (const questionnaire of prepared.questionnaires) {
    // Both resolution paths must be indexed, or a module reached only through its
    // item bank would have no score entry and every one of its rows would come out
    // as `no_module_scores`.
    const moduleContexts: ModuleScoreContext[] = [
      ...new Map(
        [
          ...questionnaire.moduleByQuestion.values(),
          ...questionnaire.dynamicModuleByBank.values(),
        ].map((m) => [m.id, { moduleId: m.id, moduleType: m.type, dimensionOrder: m.dimensionOrder }])
      ).values(),
    ];

    let cursor: number | undefined;

    for (;;) {
      const assignments = await prisma.survey_questionnaire_patients_assignment.findMany({
        where: {
          ...prepared.assignmentWhere,
          survey_questionnaire_id: questionnaire.surveyQuestionnaireId,
        },
        take: CHUNK_SIZE,
        ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
        // By patient, so LongData reads in Patient code order (ANON_<patients.id>).
        orderBy: [{ patient_id: 'asc' }, { id: 'asc' }],
        select: {
          id: true,
          access_mode: true,
          completion_status: true,
          completed_at: true,
          scores: true,
          patient_sessions: { select: { start_time: true } },
          patient: {
            select: {
              id: true,
              patient_id: true,
              is_anonymous: true,
              group: { select: { name: true } },
            },
          },
        },
      });

      if (assignments.length === 0) break;
      cursor = assignments[assignments.length - 1].id;

      // Every answer of these assignments. Deliberately NOT narrowed to the
      // questionnaire's current questions: that filter silently dropped answers
      // whose question had since been deactivated. In the order they were given:
      // that order is the Question order column.
      const responses = await prisma.responses.findMany({
        where: { assignment_id: { in: assignments.map((a) => a.id) } },
        orderBy: [{ assignment_id: 'asc' }, { created_at: 'asc' }, { id: 'asc' }],
        select: {
          assignment_id: true,
          question_id: true,
          language_id: true,
          answer_option_id: true,
          answer_text: true,
          socio_demo_answer_id: true,
          feedback_answer_id: true,
          created_at: true,
          updated_at: true,
        },
      });

      const byAssignment = new Map<number, typeof responses>();
      for (const r of responses) {
        const list = byAssignment.get(r.assignment_id);
        if (list) list.push(r);
        else byAssignment.set(r.assignment_id, [r]);
      }

      for (const assignment of assignments) {
        const assignmentResponses = byAssignment.get(assignment.id);
        if (!assignmentResponses || assignmentResponses.length === 0) continue;

        const scoreIndex = indexAssignmentScores(assignment.scores, moduleContexts);

        // Opened at the earliest session: a resumed questionnaire reuses its
        // open session, but any extra one still starts later than the first.
        const sessionStarts = assignment.patient_sessions
          .map((s) => s.start_time)
          .filter((d): d is Date => d !== null);
        const viewedAt = estimateViewedAt(
          sessionStarts.length > 0
            ? new Date(Math.min(...sessionStarts.map((d) => d.getTime())))
            : null,
          assignmentResponses.map((r) => r.created_at)
        );

        // The real identifier only ever goes out for traced surveys. An anonymous
        // access mode with a patient not yet anonymized (an invitee with another
        // questionnaire still open) gets the internal code like everyone else.
        const traced = (assignment.access_mode ?? 'traced') === 'traced';
        const patientCode =
          assignment.patient.is_anonymous || !traced || !assignment.patient.patient_id?.trim()
            ? `ANON_${assignment.patient.id}`
            : assignment.patient.patient_id;

        // A spontaneous respondent who leaves cannot come back to it, so an
        // unfinished questionnaire there is not completed rather than in progress.
        const completionStatus =
          assignment.access_mode === 'anonymous_spontaneous' &&
          assignment.completion_status === 'in_progress'
            ? 'not_completed'
            : (assignment.completion_status ?? '');

        for (const [responseIndex, response] of assignmentResponses.entries()) {
          const question = prepared.questionsById.get(response.question_id);
          // A question with no metadata at all cannot be described; that would
          // mean the row vanished from `questions`, which the FK prevents.
          if (!question) continue;

          // The module is what the catalogue adds on top. Adaptive items have no
          // `modules_questions` row — the engine picks them from the bank at run
          // time — so they are attributed through the bank instead. Only when
          // neither path resolves does the row go out with empty module columns,
          // rather than being dropped.
          const module =
            questionnaire.moduleByQuestion.get(response.question_id) ??
            (question.cat_item_bank_id != null
              ? questionnaire.dynamicModuleByBank.get(question.cat_item_bank_id)
              : undefined);

          const option = response.answer_option_id
            ? lookups.answerOptions.get(response.answer_option_id)
            : undefined;

          const score = module
            ? resolveScore(scoreIndex, {
                moduleId: module.id,
                moduleType: module.type,
                scale: question.scale,
                scoreSystem: question.score_system,
                dimensionOrder: module.dimensionOrder,
              })
            : { scoreType: '' as const, score: null };

          const scaleCode = normalizeScaleCode(question.scale, {
            moduleType: module?.type,
            dimensionOrder: module?.dimensionOrder,
          });

          let answerLabel: string | null = option?.labelEn ?? null;
          if (response.socio_demo_answer_id) {
            answerLabel = lookups.socioDemoLabelEn.get(response.socio_demo_answer_id) ?? null;
          } else if (response.feedback_answer_id) {
            answerLabel = lookups.feedbackLabelEn.get(response.feedback_answer_id) ?? null;
          }

          const ownOptionLabels =
            question.question_kind === 'feedback'
              ? lookups.feedbackLabelEn
              : lookups.socioDemoLabelEn;
          const answer = resolveAnswerCells({
            questionKind: question.question_kind,
            disclaimer: isDisclaimer(
              question.question_type,
              question.answer_profile_id != null ||
                lookups.questionsWithOwnOptions.has(question.id)
            ),
            optionValue: option?.value ?? null,
            labelEn: answerLabel,
            answerText: response.answer_text,
            labelForOption: (id) => ownOptionLabels.get(id),
          });

          const row: ExportRow = {
            patient_code: patientCode,
            is_anonymous: assignment.patient.is_anonymous ? 1 : 0,
            access_mode: assignment.access_mode ?? '',
            patient_group: assignment.patient.group?.name ?? questionnaire.patientGroupName,
            completion_status: completionStatus,
            completed_at: formatTimestamp(assignment.completed_at),
            response_language: lookups.languages.get(response.language_id) ?? '',

            questionnaire_title: questionnaire.title,

            module_name: module?.name ?? '',
            module_type: module?.type ?? '',
            question_code: question.question_code,
            question_kind: question.question_kind,
            question_text_en: stripHtml(lookups.questionTextEn.get(question.id) ?? ''),
            scale_name: scaleCode ? (prepared.scaleNames[scaleCode] ?? '') : '',
            scale_code: scaleCode ?? '',
            // Adaptive items carry no scoring system of their own: they are always IRT.
            score_system: question.score_system || (question.question_kind === 'cat' ? 'IRT' : ''),

            answer_value: answer.value,
            answer_label_en: answer.labelEn,
            answer_text: answer.text,
            question_order: responseIndex + 1,
            question_viewed_at: formatTimestamp(viewedAt[responseIndex]),
            answered_at: formatTimestamp(response.created_at),
            answer_updated_at: formatTimestamp(response.updated_at),

            score: score.score,
          };

          sheet.addRow(columns.map((c) => row[c.key] ?? (c.numeric ? null : ''))).commit();
          rowsWritten++;
        }
      }
    }
  }

  sheet.commit();
  await writeColumnsSheet(workbook, columns);
  await workbook.commit();
  return rowsWritten;
}
