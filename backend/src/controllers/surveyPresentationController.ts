import { NextFunction, Request, Response } from 'express';
import { ServiceError } from '../helpers/ServiceError.js';
import { SurveyPresentationPolicy } from '../policy/surveyPresentationPolicy.js';
import { Resource } from '../resources/baseResource.js';
import { SurveyPresentationResource } from '../resources/surveyPresentations.js';
import { SurveyPresentationService } from '../services/SurveyPresentationService.js';

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

export async function getSurveyPresentations(req: Request, res: Response, next: NextFunction) {
  try {
    const surveyId = parseSurveyId(req.params.id, res);
    if (surveyId === null) return;

    const rows = await SurveyPresentationService.getPresentations(surveyId);
    const surveyStatus = await SurveyPresentationService.getSurveyStatus(surveyId);
    const response = Resource.paginate(
      SurveyPresentationResource.collection(rows, { policy: { authUser: req.user ?? null } }),
      rows.length,
      rows.length || 1,
      0,
      'Presentations retrieved successfully'
    );
    (response.meta as any).authorizations = {
      create: new SurveyPresentationPolicy(req.user ?? null).create({ status: surveyStatus }),
    };
    return res.json(response);
  } catch (err: any) {
    return handleError(res, next, err, 'Failed to fetch presentations');
  }
}

export async function getSurveyPresentationById(req: Request, res: Response, next: NextFunction) {
  try {
    const surveyId = parseSurveyId(req.params.id, res);
    if (surveyId === null) return;
    const presentationId = parseIntParam(req.params.presentationId);
    if (isNaN(presentationId)) return res.status(400).json({ error: 'Invalid presentation ID' });

    const row = await SurveyPresentationService.getPresentationById(surveyId, presentationId);
    return res.json(
      Resource.respond(
        SurveyPresentationResource.make(row, { policy: { authUser: req.user ?? null } }),
        'Presentation retrieved successfully'
      )
    );
  } catch (err: any) {
    return handleError(res, next, err, 'Failed to fetch presentation');
  }
}

export async function getSurveyPresentationHistory(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const surveyId = parseSurveyId(req.params.id, res);
    if (surveyId === null) return;
    const languageId = parseIntParam(req.query.language_id as string | string[]);
    if (isNaN(languageId)) return res.status(400).json({ error: 'Invalid language_id' });

    const rows = await SurveyPresentationService.getPresentationHistory(surveyId, languageId);
    return res.json(
      Resource.respond(
        SurveyPresentationResource.collection(rows, { policy: { authUser: req.user ?? null } }),
        'Presentation history retrieved successfully'
      )
    );
  } catch (err: any) {
    return handleError(res, next, err, 'Failed to fetch presentation history');
  }
}

export async function upsertSurveyPresentation(req: Request, res: Response, next: NextFunction) {
  try {
    const surveyId = parseSurveyId(req.params.id, res);
    if (surveyId === null) return;

    const { language_id, content } = req.body;
    if (!language_id || !content?.trim()) {
      return res.status(400).json({ error: 'language_id and content are required' });
    }

    const row = await SurveyPresentationService.upsertPresentation(surveyId, req.body, req.file);
    return res.json(
      Resource.respond(
        SurveyPresentationResource.make(row, { policy: { authUser: req.user ?? null } }),
        'Presentation saved successfully'
      )
    );
  } catch (err: any) {
    return handleError(res, next, err, 'Failed to save presentation');
  }
}

export async function updateSurveyPresentation(req: Request, res: Response, next: NextFunction) {
  try {
    const surveyId = parseSurveyId(req.params.id, res);
    if (surveyId === null) return;

    const { language_id, content } = req.body;
    if (!language_id || !content?.trim()) {
      return res.status(400).json({ error: 'language_id and content are required' });
    }

    const row = await SurveyPresentationService.upsertPresentation(surveyId, req.body, req.file);
    return res.json(
      Resource.respond(
        SurveyPresentationResource.make(row, { policy: { authUser: req.user ?? null } }),
        'Presentation saved successfully'
      )
    );
  } catch (err: any) {
    return handleError(res, next, err, 'Failed to save presentation');
  }
}

export async function togglePresentationFallback(req: Request, res: Response, next: NextFunction) {
  try {
    const surveyId = parseSurveyId(req.params.id, res);
    if (surveyId === null) return;
    const presentationId = parseIntParam(req.params.presentationId);
    if (isNaN(presentationId)) return res.status(400).json({ error: 'Invalid presentation ID' });

    const is_fallback = await SurveyPresentationService.togglePresentationFallback(
      surveyId,
      presentationId
    );
    return res.json(Resource.respond({ is_fallback }, 'Fallback toggled successfully'));
  } catch (err: any) {
    return handleError(res, next, err, 'Failed to toggle fallback');
  }
}

export async function deleteSurveyPresentation(req: Request, res: Response, next: NextFunction) {
  try {
    const surveyId = parseSurveyId(req.params.id, res);
    if (surveyId === null) return;
    const presentationId = parseIntParam(req.params.presentationId);
    if (isNaN(presentationId)) return res.status(400).json({ error: 'Invalid presentation ID' });

    await SurveyPresentationService.deletePresentation(surveyId, presentationId);
    return res.json(Resource.respond(null, 'Presentation deleted successfully'));
  } catch (err: any) {
    return handleError(res, next, err, 'Failed to delete presentation');
  }
}
