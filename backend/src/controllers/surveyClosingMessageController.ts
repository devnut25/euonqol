import { NextFunction, Request, Response } from 'express';
import { ServiceError } from '../helpers/ServiceError.js';
import { SurveyClosingMessagePolicy } from '../policy/surveyClosingMessagePolicy.js';
import { Resource } from '../resources/baseResource.js';
import { SurveyClosingMessageResource } from '../resources/surveyClosingMessages.js';
import { SurveyClosingMessageService } from '../services/SurveyClosingMessageService.js';

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

export async function getSurveyClosingMessages(req: Request, res: Response, next: NextFunction) {
  try {
    const surveyId = parseSurveyId(req.params.id, res);
    if (surveyId === null) return;

    const rows = await SurveyClosingMessageService.getMessages(surveyId);
    const surveyStatus = await SurveyClosingMessageService.getSurveyStatus(surveyId);
    const response = Resource.paginate(
      SurveyClosingMessageResource.collection(rows, { policy: { authUser: req.user ?? null } }),
      rows.length,
      rows.length || 1,
      0,
      'Closing messages retrieved successfully'
    );
    (response.meta as any).authorizations = {
      create: new SurveyClosingMessagePolicy(req.user ?? null).create({ status: surveyStatus }),
    };
    return res.json(response);
  } catch (err: any) {
    return handleError(res, next, err, 'Failed to fetch closing messages');
  }
}

export async function getSurveyClosingMessageById(req: Request, res: Response, next: NextFunction) {
  try {
    const surveyId = parseSurveyId(req.params.id, res);
    if (surveyId === null) return;
    const closingMessageId = parseIntParam(req.params.closingMessageId);
    if (isNaN(closingMessageId)) return res.status(400).json({ error: 'Invalid closing message ID' });

    const row = await SurveyClosingMessageService.getMessageById(surveyId, closingMessageId);
    return res.json(
      Resource.respond(
        SurveyClosingMessageResource.make(row, { policy: { authUser: req.user ?? null } }),
        'Closing message retrieved successfully'
      )
    );
  } catch (err: any) {
    return handleError(res, next, err, 'Failed to fetch closing message');
  }
}

export async function getSurveyClosingMessageHistory(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const surveyId = parseSurveyId(req.params.id, res);
    if (surveyId === null) return;
    const languageId = parseIntParam(req.query.language_id as string | string[]);
    if (isNaN(languageId)) return res.status(400).json({ error: 'Invalid language_id' });

    const rows = await SurveyClosingMessageService.getMessageHistory(surveyId, languageId);
    return res.json(
      Resource.respond(
        SurveyClosingMessageResource.collection(rows, { policy: { authUser: req.user ?? null } }),
        'Closing message history retrieved successfully'
      )
    );
  } catch (err: any) {
    return handleError(res, next, err, 'Failed to fetch closing message history');
  }
}

export async function upsertSurveyClosingMessage(req: Request, res: Response, next: NextFunction) {
  try {
    const surveyId = parseSurveyId(req.params.id, res);
    if (surveyId === null) return;

    const row = await SurveyClosingMessageService.upsertMessage(surveyId, req.body);
    return res.json(
      Resource.respond(
        SurveyClosingMessageResource.make(row, { policy: { authUser: req.user ?? null } }),
        'Closing message saved successfully'
      )
    );
  } catch (err: any) {
    return handleError(res, next, err, 'Failed to save closing message');
  }
}

export async function updateSurveyClosingMessage(req: Request, res: Response, next: NextFunction) {
  try {
    const surveyId = parseSurveyId(req.params.id, res);
    if (surveyId === null) return;

    const row = await SurveyClosingMessageService.upsertMessage(surveyId, req.body);
    return res.json(
      Resource.respond(
        SurveyClosingMessageResource.make(row, { policy: { authUser: req.user ?? null } }),
        'Closing message saved successfully'
      )
    );
  } catch (err: any) {
    return handleError(res, next, err, 'Failed to save closing message');
  }
}

export async function toggleClosingMessageFallback(req: Request, res: Response, next: NextFunction) {
  try {
    const surveyId = parseSurveyId(req.params.id, res);
    if (surveyId === null) return;
    const closingMessageId = parseIntParam(req.params.closingMessageId);
    if (isNaN(closingMessageId)) return res.status(400).json({ error: 'Invalid closing message ID' });

    const is_fallback = await SurveyClosingMessageService.toggleMessageFallback(
      surveyId,
      closingMessageId
    );
    return res.json(Resource.respond({ is_fallback }, 'Fallback toggled successfully'));
  } catch (err: any) {
    return handleError(res, next, err, 'Failed to toggle fallback');
  }
}

export async function deleteSurveyClosingMessage(req: Request, res: Response, next: NextFunction) {
  try {
    const surveyId = parseSurveyId(req.params.id, res);
    if (surveyId === null) return;
    const closingMessageId = parseIntParam(req.params.closingMessageId);
    if (isNaN(closingMessageId)) return res.status(400).json({ error: 'Invalid closing message ID' });

    await SurveyClosingMessageService.deleteMessage(surveyId, closingMessageId);
    return res.json(Resource.respond(null, 'Closing message deleted successfully'));
  } catch (err: any) {
    return handleError(res, next, err, 'Failed to delete closing message');
  }
}
