import { NextFunction, Request, Response } from 'express';
import { DEFAULT_LANGUAGE_ID } from '../config/language.js';
import { ServiceError } from '../helpers/ServiceError.js';
import { Resource } from '../resources/baseResource.js';
import { UiTranslationResource } from '../resources/uiTranslations.js';
import { UiTranslationService } from '../services/UiTranslationService.js';
import { SaveUiTranslationInput } from '../validators/schemas/uiTranslation.js';

function handleError(res: Response, next: NextFunction, err: unknown, fallback: string): Response | void {
  if (err instanceof ServiceError) {
    return res.status(err.statusCode).json({ success: false, message: err.message });
  }
  console.error(fallback, err);
  return next(err);
}

function parseLanguageId(req: Request): number | null {
  const id = parseInt(req.query.language_id as string, 10);
  return isNaN(id) || id <= 0 ? null : id;
}

export async function getUiTranslations(req: Request, res: Response, next: NextFunction) {
  try {
    const { rows, total, take, skip } = await UiTranslationService.getList(
      req.query as Record<string, any>
    );
    return res.json(
      Resource.paginate(
        UiTranslationResource.collection(rows),
        total,
        take,
        skip,
        'UI translations retrieved successfully'
      )
    );
  } catch (err) {
    return handleError(res, next, err, 'Failed to fetch UI translations');
  }
}

export async function saveUiTranslation(req: Request, res: Response, next: NextFunction) {
  try {
    const { language_id, value } = req.body as SaveUiTranslationInput;
    const row = await UiTranslationService.saveOne(
      language_id,
      req.params.key as string,
      value,
      req.user?.id
    );
    return res.json(Resource.respond(UiTranslationResource.make(row), 'UI translation saved successfully'));
  } catch (err) {
    return handleError(res, next, err, 'Failed to save UI translation');
  }
}

/**
 * Public: key → text map for the patient-facing questionnaire page. Without `language_id`
 * (screens before the language is chosen) the English texts are returned.
 */
export async function getPublicUiTranslations(req: Request, res: Response, next: NextFunction) {
  try {
    const languageId = parseLanguageId(req) ?? DEFAULT_LANGUAGE_ID;
    const translations = await UiTranslationService.getPublicMap(languageId);
    return res.json(Resource.respond(translations, 'UI translations retrieved successfully'));
  } catch (err) {
    return handleError(res, next, err, 'Failed to fetch UI translations');
  }
}
