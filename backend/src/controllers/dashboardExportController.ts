import { NextFunction, Request, Response } from 'express';
import { PrismaClient } from '../generated/app/index.js';
import { parseStatusFilter } from '../helpers/statusFilters.js';
import { getVisibleSurveyIds } from '../helpers/surveyScope.js';
import { Resource } from '../resources/baseResource.js';
import { resolveColumns, UnknownColumnError } from '../services/export/exportColumns.js';
import {
  countExportRows,
  ExportEmptyError,
  MAX_EXPORT_ROWS,
  ExportTooLargeError,
  prepareExport,
  streamSurveyLongExport,
  type ExportFilters,
} from '../services/export/surveyLongExportService.js';

const prisma = new PrismaClient();

/** Keeps the survey name usable inside a Content-Disposition filename. */
function slugify(name: string): string {
  return (
    name
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^a-zA-Z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .slice(0, 60) || 'survey'
  );
}

function parseIntParam(value: unknown): number | undefined {
  if (typeof value !== 'string' || !value.trim()) return undefined;
  const parsed = parseInt(value, 10);
  return Number.isNaN(parsed) ? undefined : parsed;
}

function parseStringParam(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value : undefined;
}

/** Filters from the export dialog; each one is optional. */
function readExportFilters(query: Request['query']): ExportFilters {
  return {
    questionnaireId: parseIntParam(query.questionnaireId),
    groupId: parseIntParam(query.groupId),
    accessMode: parseStringParam(query.accessMode),
    dateFrom: parseStringParam(query.dateFrom),
    dateTo: parseStringParam(query.dateTo),
    completionStatus: query.completionStatus
      ? parseStatusFilter(query.completionStatus)
      : undefined,
  };
}

/**
 * GET /euonqol-api/dashboard/download/surveys/:surveyId/export
 *
 * Streams every response of a survey as a long-format XLSX, one row per answer,
 * honouring the caller's column selection. The dashboard dock does not send its
 * filters: by default the download is the whole survey. The filters below come
 * only from the export dialog, offered when the whole survey is over the row
 * limit (the 413 below carries the count it needs to say so).
 *
 * Everything that can fail recoverably is resolved by `prepareExport` before the
 * first byte goes out: once the stream starts, the status code is already sent.
 */
export async function exportSurveyLongData(req: Request, res: Response, next: NextFunction) {
  try {
    const surveyId = parseIntParam(req.params.surveyId);
    if (surveyId === undefined) {
      return res.status(400).json({ success: false, message: 'Invalid survey id' });
    }

    let columns;
    try {
      columns = resolveColumns(parseStringParam(req.query.columns));
    } catch (err) {
      if (err instanceof UnknownColumnError) {
        return res.status(400).json({ success: false, message: err.message });
      }
      throw err;
    }
    if (columns.length === 0) {
      return res.status(400).json({ success: false, message: 'No columns selected' });
    }

    const userId = req.user?.id;
    const isManager = req.user?.user_type === 'manager';
    const visibleIds = await getVisibleSurveyIds(userId, isManager, String(surveyId));
    if (!visibleIds.includes(surveyId)) {
      return res
        .status(403)
        .json({ success: false, message: 'You do not have access to this survey' });
    }

    let prepared;
    try {
      prepared = await prepareExport(prisma, surveyId, readExportFilters(req.query));
    } catch (err) {
      if (err instanceof ExportEmptyError) {
        return res.status(404).json({ success: false, message: err.message });
      }
      if (err instanceof ExportTooLargeError) {
        return res.status(413).json({
          success: false,
          message: err.message,
          meta: { rowCount: err.rowCount, maxRows: err.maxRows },
        });
      }
      throw err;
    }

    // YYYYMMDD_HHMM in UTC, like every date in the file.
    const stamp = new Date().toISOString().slice(0, 16).replace(/-|:/g, '').replace('T', '_');
    const filename = `${slugify(prepared.surveyName)}_long_${stamp}.xlsx`;

    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    );
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

    try {
      const user = req.user;
      const fullName = [user?.firstName, user?.lastName].filter(Boolean).join(' ');
      const exportedBy = fullName ? `${fullName} <${user?.email}>` : (user?.email ?? '');
      await streamSurveyLongExport(prisma, prepared, columns, res, exportedBy);
    } catch (err) {
      // Headers are already out, so there is no status left to send: log it and
      // break the connection, which surfaces client-side as a failed download
      // rather than a silently truncated file.
      console.error(`[Export] Streaming failed for survey ${surveyId}:`, err);
      res.destroy();
    }
  } catch (err) {
    if (res.headersSent) {
      console.error('[Export] Failed after headers were sent:', err);
      return res.destroy();
    }
    return next(err);
  }
}

/**
 * GET /euonqol-api/dashboard/download/surveys/:surveyId/export/count
 *
 * How many rows the export would have with the given dialog filters, against
 * the limit: lets the dialog say so before the user tries to download.
 */
export async function countSurveyLongExport(req: Request, res: Response, next: NextFunction) {
  try {
    const surveyId = parseIntParam(req.params.surveyId);
    if (surveyId === undefined) {
      return res.status(400).json({ success: false, message: 'Invalid survey id' });
    }

    const visibleIds = await getVisibleSurveyIds(
      req.user?.id,
      req.user?.user_type === 'manager',
      String(surveyId)
    );
    if (!visibleIds.includes(surveyId)) {
      return res
        .status(403)
        .json({ success: false, message: 'You do not have access to this survey' });
    }

    const rowCount = await countExportRows(prisma, surveyId, readExportFilters(req.query));
    return res.json(Resource.respond({ rowCount, maxRows: MAX_EXPORT_ROWS }));
  } catch (err) {
    return next(err);
  }
}
