import { NextFunction, Request, Response } from 'express';
import { ServiceError } from '../helpers/ServiceError.js';
import { SurveyEligibilityQuestionPolicy } from '../policy/surveyEligibilityQuestionPolicy.js';
import { Resource } from '../resources/baseResource.js';
import { SurveyEligibilityQuestionResource } from '../resources/surveyEligibilityQuestion.js';
import { SurveyEligibilityService } from '../services/SurveyEligibilityService.js';

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

export async function getEligibilityQuestions(req: Request, res: Response, next: NextFunction) {
  try {
    const surveyId = parseSurveyId(req.params.id, res);
    if (surveyId === null) return;

    const search = typeof req.query.search === 'string' ? req.query.search : undefined;
    const questions = await SurveyEligibilityService.getEligibilityQuestions(surveyId, search);
    const surveyStatus = await SurveyEligibilityService.getSurveyStatus(surveyId);
    const response = Resource.paginate(
      SurveyEligibilityQuestionResource.collection(questions, {
        policy: { authUser: req.user ?? null },
      }),
      questions.length,
      questions.length || 1,
      0,
      'Eligibility questions retrieved successfully'
    );
    (response.meta as any).authorizations = {
      create: new SurveyEligibilityQuestionPolicy(req.user ?? null).create({ status: surveyStatus }),
    };
    return res.json(response);
  } catch (err: any) {
    return handleError(res, next, err, 'Failed to fetch eligibility questions');
  }
}

export async function createEligibilityQuestion(req: Request, res: Response, next: NextFunction) {
  try {
    const surveyId = parseSurveyId(req.params.id, res);
    if (surveyId === null) return;

    const question = await SurveyEligibilityService.createEligibilityQuestion(surveyId, req.body);
    return res
      .status(201)
      .json(
        Resource.respond(
          SurveyEligibilityQuestionResource.make(question, { policy: { authUser: req.user ?? null } }),
          'Eligibility question created successfully'
        )
      );
  } catch (err: any) {
    return handleError(res, next, err, 'Failed to create eligibility question');
  }
}

export async function updateEligibilityQuestion(req: Request, res: Response, next: NextFunction) {
  try {
    const surveyId = parseSurveyId(req.params.id, res);
    if (surveyId === null) return;
    const qid = parseIntParam(req.params.qid);
    if (isNaN(qid)) return res.status(400).json({ success: false, message: 'Invalid question ID' });

    const question = await SurveyEligibilityService.updateEligibilityQuestion(surveyId, qid, req.body);
    return res.json(
      Resource.respond(
        SurveyEligibilityQuestionResource.make(question, { policy: { authUser: req.user ?? null } }),
        'Eligibility question updated successfully'
      )
    );
  } catch (err: any) {
    return handleError(res, next, err, 'Failed to update eligibility question');
  }
}

export async function deleteEligibilityQuestion(req: Request, res: Response, next: NextFunction) {
  try {
    const surveyId = parseSurveyId(req.params.id, res);
    if (surveyId === null) return;
    const qid = parseIntParam(req.params.qid);
    if (isNaN(qid)) return res.status(400).json({ success: false, message: 'Invalid question ID' });

    await SurveyEligibilityService.deleteEligibilityQuestion(surveyId, qid);
    return res.json(Resource.respond(null, 'Eligibility question deleted successfully'));
  } catch (err: any) {
    return handleError(res, next, err, 'Failed to delete eligibility question');
  }
}

export async function toggleEligibilityTranslationFallback(req: Request, res: Response, next: NextFunction) {
  try {
    const qid = parseIntParam(req.params.qid);
    const langId = parseIntParam(req.params.langId);
    if (isNaN(qid) || isNaN(langId)) return res.status(400).json({ success: false, message: 'Invalid IDs' });

    const is_fallback = await SurveyEligibilityService.toggleEligibilityTranslationFallback(qid, langId);
    return res.json(Resource.respond({ is_fallback }, 'Fallback toggled successfully'));
  } catch (err: any) {
    return handleError(res, next, err, 'Failed to toggle fallback');
  }
}

export async function reorderEligibilityQuestions(req: Request, res: Response, next: NextFunction) {
  try {
    const surveyId = parseSurveyId(req.params.id, res);
    if (surveyId === null) return;

    const { order } = req.body;
    if (!Array.isArray(order)) return res.status(400).json({ success: false, message: 'order array is required' });

    await SurveyEligibilityService.reorderEligibilityQuestions(surveyId, order);
    return res.json(Resource.respond(null, 'Questions reordered successfully'));
  } catch (err: any) {
    return handleError(res, next, err, 'Failed to reorder questions');
  }
}

export async function setEligibilityLanguageFallback(req: Request, res: Response, next: NextFunction) {
  try {
    const surveyId = parseSurveyId(req.params.id, res);
    if (surveyId === null) return;

    const { language_id } = req.body;
    const langId = parseInt(language_id, 10);
    if (isNaN(langId)) return res.status(400).json({ success: false, message: 'Invalid language_id' });

    await SurveyEligibilityService.setEligibilityLanguageFallback(surveyId, langId);
    return res.json(Resource.respond({ language_id: langId }, 'Language fallback updated successfully'));
  } catch (err: any) {
    return handleError(res, next, err, 'Failed to set language fallback');
  }
}

export async function upsertEligibilityTranslations(req: Request, res: Response, next: NextFunction) {
  try {
    const surveyId = parseSurveyId(req.params.id, res);
    if (surveyId === null) return;
    const langId = parseIntParam(req.params.langId);
    if (isNaN(langId)) return res.status(400).json({ success: false, message: 'Invalid language ID' });

    await SurveyEligibilityService.upsertEligibilityTranslations(surveyId, langId, req.body);
    return res.json(Resource.respond(null, 'Translations saved successfully'));
  } catch (err: any) {
    return handleError(res, next, err, 'Failed to save translations');
  }
}

export async function deleteEligibilityLanguage(req: Request, res: Response, next: NextFunction) {
  try {
    const surveyId = parseSurveyId(req.params.id, res);
    if (surveyId === null) return;
    const langId = parseIntParam(req.params.langId);
    if (isNaN(langId)) return res.status(400).json({ success: false, message: 'Invalid language ID' });

    await SurveyEligibilityService.deleteEligibilityLanguage(surveyId, langId);
    return res.json(Resource.respond(null, 'Language removed successfully'));
  } catch (err: any) {
    return handleError(res, next, err, 'Failed to delete language');
  }
}
