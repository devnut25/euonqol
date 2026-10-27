import { NextFunction, Request, Response } from 'express';
import { ServiceError } from '../helpers/ServiceError.js';
import { SurveyStudyInfoSheetPolicy } from '../policy/surveyStudyInfoSheetPolicy.js';
import { Resource } from '../resources/baseResource.js';
import { SurveyStudyInfoSheetResource } from '../resources/surveyStudyInfoSheets.js';
import { SurveyStudyInfoSheetService } from '../services/SurveyStudyInfoSheetService.js';

function parseSurveyId(id: string | string[], res: Response): number | null {
  const surveyId = parseInt(Array.isArray(id) ? id[0] : id, 10);
  if (isNaN(surveyId)) {
    res.status(400).json({ success: false, message: 'Invalid survey ID' });
    return null;
  }
  return surveyId;
}

function parseIntParam(param: string | string[]): number {
  return parseInt(Array.isArray(param) ? param[0] : param, 10);
}

function handleError(res: Response, next: NextFunction, err: any, fallbackMessage: string) {
  if (err instanceof ServiceError) {
    return res.status(err.statusCode).json({ success: false, message: err.message });
  }
  console.error(`Error: ${fallbackMessage}`, err?.message ?? err);
  return next(err);
}

export async function getSurveyStudyInfoSheets(req: Request, res: Response, next: NextFunction) {
  try {
    const surveyId = parseSurveyId(req.params.id, res);
    if (surveyId === null) return;

    const rows = await SurveyStudyInfoSheetService.getStudyInfoSheets(
      surveyId,
      req.query as Record<string, any>
    );
    const surveyStatus = await SurveyStudyInfoSheetService.getSurveyStatus(surveyId);
    const response = Resource.paginate(
      SurveyStudyInfoSheetResource.collection(rows, { policy: { authUser: req.user ?? null } }),
      rows.length,
      rows.length || 1,
      0,
      'Info & consent retrieved successfully'
    );
    (response.meta as any).authorizations = {
      create: new SurveyStudyInfoSheetPolicy(req.user ?? null).create({ status: surveyStatus }),
    };
    return res.json(response);
  } catch (err: any) {
    return handleError(res, next, err, 'Failed to fetch info & consent');
  }
}

export async function getSurveyStudyInfoSheetById(req: Request, res: Response, next: NextFunction) {
  try {
    const surveyId = parseSurveyId(req.params.id, res);
    if (surveyId === null) return;
    const sheetId = parseIntParam(req.params.sheetId);
    if (isNaN(sheetId)) return res.status(400).json({ error: 'Invalid Info & Consent ID' });

    const row = await SurveyStudyInfoSheetService.getStudyInfoSheetById(surveyId, sheetId);
    return res.json(
      Resource.respond(
        SurveyStudyInfoSheetResource.make(row, { policy: { authUser: req.user ?? null } }),
        'Info & Consent retrieved successfully'
      )
    );
  } catch (err: any) {
    return handleError(res, next, err, 'Failed to fetch Info & Consent');
  }
}

export async function getSurveyStudyInfoSheetHistory(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const surveyId = parseSurveyId(req.params.id, res);
    if (surveyId === null) return;
    const languageId = parseIntParam(req.query.language_id as string | string[]);
    if (isNaN(languageId)) return res.status(400).json({ error: 'Invalid language_id' });

    const rows = await SurveyStudyInfoSheetService.getStudyInfoSheetHistory(surveyId, languageId);
    return res.json(
      Resource.respond(
        SurveyStudyInfoSheetResource.collection(rows, { policy: { authUser: req.user ?? null } }),
        'Info & Consent history retrieved successfully'
      )
    );
  } catch (err: any) {
    return handleError(res, next, err, 'Failed to fetch Info & Consent history');
  }
}

export async function upsertSurveyStudyInfoSheet(req: Request, res: Response, next: NextFunction) {
  try {
    const surveyId = parseSurveyId(req.params.id, res);
    if (surveyId === null) return;

    const { language_id, content } = req.body;
    if (!language_id || !content?.trim()) {
      return res.status(400).json({ error: 'language_id and content are required' });
    }

    const row = await SurveyStudyInfoSheetService.upsertStudyInfoSheet(
      surveyId,
      req.body,
      req.file
    );
    return res.json(
      Resource.respond(
        SurveyStudyInfoSheetResource.make(row, { policy: { authUser: req.user ?? null } }),
        'Info & Consent saved successfully'
      )
    );
  } catch (err: any) {
    return handleError(res, next, err, 'Failed to save Info & Consent');
  }
}

export async function updateSurveyStudyInfoSheet(req: Request, res: Response, next: NextFunction) {
  try {
    const surveyId = parseSurveyId(req.params.id, res);
    if (surveyId === null) return;

    const { language_id, content } = req.body;
    if (!language_id || !content?.trim()) {
      return res.status(400).json({ error: 'language_id and content are required' });
    }

    const row = await SurveyStudyInfoSheetService.upsertStudyInfoSheet(
      surveyId,
      req.body,
      req.file
    );
    return res.json(
      Resource.respond(
        SurveyStudyInfoSheetResource.make(row, { policy: { authUser: req.user ?? null } }),
        'Info & Consent saved successfully'
      )
    );
  } catch (err: any) {
    return handleError(res, next, err, 'Failed to save Info & Consent');
  }
}

export async function toggleStudyInfoSheetFallback(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const surveyId = parseSurveyId(req.params.id, res);
    if (surveyId === null) return;
    const sheetId = parseIntParam(req.params.sheetId);
    if (isNaN(sheetId)) return res.status(400).json({ error: 'Invalid Info & Consent ID' });

    const is_fallback = await SurveyStudyInfoSheetService.toggleStudyInfoSheetFallback(
      surveyId,
      sheetId
    );
    return res.json(Resource.respond({ is_fallback }, 'Fallback toggled successfully'));
  } catch (err: any) {
    return handleError(res, next, err, 'Failed to toggle fallback');
  }
}

export async function deleteSurveyStudyInfoSheet(req: Request, res: Response, next: NextFunction) {
  try {
    const surveyId = parseSurveyId(req.params.id, res);
    if (surveyId === null) return;
    const sheetId = parseIntParam(req.params.sheetId);
    if (isNaN(sheetId)) return res.status(400).json({ error: 'Invalid Info & Consent ID' });

    await SurveyStudyInfoSheetService.deleteStudyInfoSheet(surveyId, sheetId);
    return res.json(Resource.respond(null, 'Info & Consent deleted successfully'));
  } catch (err: any) {
    return handleError(res, next, err, 'Failed to delete Info & Consent');
  }
}
