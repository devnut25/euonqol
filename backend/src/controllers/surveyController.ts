import { NextFunction, Request, Response } from 'express';
import { ServiceError } from '../helpers/ServiceError.js';
import { Resource } from '../resources/baseResource.js';
import {
  SurveyDetailResource,
  SurveyResource,
  SurveyResourceAll,
  SurveyWriteResource,
} from '../resources/surveys.js';
import { SurveyService } from '../services/SurveyService.js';

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

// ─── Core CRUD ────────────────────────────────────────────────────────────────

export async function getSurveys(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.user) return res.status(401).json({ error: 'Authentication required' });

    const { surveys, total, take, skip } = await SurveyService.getList(
      req.query as Record<string, any>,
      req.user
    );

    return res.json(
      Resource.paginate(
        SurveyResource.collection(surveys, { policy: { authUser: req.user ?? null } }),
        total,
        take,
        skip,
        'Surveys retrieved successfully'
      )
    );
  } catch (err: any) {
    return handleError(res, next, err, 'Failed to fetch surveys');
  }
}

/**
 * GET /euonqol-api/surveys/all
 * Every survey visible to the user, unpaginated (selects and table filters).
 */
export async function getSurveysAll(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.user) return res.status(401).json({ error: 'Authentication required' });

    const { surveys, total } = await SurveyService.getAll(
      req.query as Record<string, any>,
      req.user
    );

    return res.json(
      Resource.paginate(
        SurveyResourceAll.collection(surveys),
        total,
        total,
        0,
        'Surveys retrieved successfully'
      )
    );
  } catch (err: any) {
    return handleError(res, next, err, 'Failed to fetch surveys');
  }
}

export async function getSurveyById(req: Request, res: Response, next: NextFunction) {
  try {
    const surveyId = parseSurveyId(req.params.id, res);
    if (surveyId === null) return;

    const survey = await SurveyService.getById(surveyId);
    return res.json(
      Resource.respond(
        SurveyDetailResource.make(survey, { policy: { authUser: req.user ?? null } }),
        'Survey retrieved successfully'
      )
    );
  } catch (err: any) {
    return handleError(res, next, err, 'Failed to fetch survey');
  }
}

export async function getSurveyPrerequisites(req: Request, res: Response, next: NextFunction) {
  try {
    const surveyId = parseSurveyId(req.params.id, res);
    if (surveyId === null) return;

    const prerequisites = await SurveyService.getPrerequisites(surveyId);
    return res.json(Resource.respond(prerequisites, 'Survey prerequisites retrieved successfully'));
  } catch (err: any) {
    return handleError(res, next, err, 'Failed to fetch survey prerequisites');
  }
}

export async function publishSurvey(req: Request, res: Response, next: NextFunction) {
  try {
    const surveyId = parseSurveyId(req.params.id, res);
    if (surveyId === null) return;

    const survey = await SurveyService.publish(surveyId);
    return res.json(
      Resource.respond(
        SurveyWriteResource.make(survey, { policy: { authUser: req.user ?? null } }),
        'Survey published successfully'
      )
    );
  } catch (err: any) {
    return handleError(res, next, err, 'Failed to publish survey');
  }
}

export async function createSurvey(req: Request, res: Response, next: NextFunction) {
  try {
    const survey = await SurveyService.create(req.body, req.user?.id ?? null);
    return res
      .status(201)
      .json(
        Resource.respond(
          SurveyWriteResource.make(survey, { policy: { authUser: req.user ?? null } }),
          'Survey created successfully'
        )
      );
  } catch (err: any) {
    return handleError(res, next, err, 'Failed to create survey');
  }
}

export async function updateSurvey(req: Request, res: Response, next: NextFunction) {
  try {
    const surveyId = parseSurveyId(req.params.id, res);
    if (surveyId === null) return;

    const survey = await SurveyService.update(surveyId, req.body);
    return res.json(
      Resource.respond(
        SurveyWriteResource.make(survey, { policy: { authUser: req.user ?? null } }),
        'Survey updated successfully'
      )
    );
  } catch (err: any) {
    return handleError(res, next, err, 'Failed to update survey');
  }
}

export async function deleteSurvey(req: Request, res: Response, next: NextFunction) {
  try {
    const surveyId = parseSurveyId(req.params.id, res);
    if (surveyId === null) return;

    const result = await SurveyService.delete(surveyId);
    return res.json(Resource.respond(result, 'Survey deleted successfully'));
  } catch (err: any) {
    return handleError(res, next, err, 'Failed to delete survey');
  }
}

export async function duplicateSurvey(req: Request, res: Response, next: NextFunction) {
  try {
    const surveyId = parseSurveyId(req.params.id, res);
    if (surveyId === null) return;

    const { newSurvey, questionnaireCount } = await SurveyService.duplicate(
      surveyId,
      req.user?.id ?? null,
      req.body ?? {}
    );

    return res
      .status(201)
      .json(
        Resource.respond(
          { id: newSurvey.id, name: newSurvey.name, status: newSurvey.status, questionnaireCount },
          `Survey duplicated successfully as "${newSurvey.name}"`
        )
      );
  } catch (err: any) {
    return handleError(res, next, err, 'Failed to duplicate survey');
  }
}

