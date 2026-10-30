import { NextFunction, Request, Response } from 'express';
import { ServiceError } from '../helpers/ServiceError.js';
import { Resource } from '../resources/baseResource.js';
import { LanguageResource } from '../resources/languages.js';
import { LanguageService } from '../services/LanguageService.js';

export async function getLanguages(req: Request, res: Response, next: NextFunction) {
  try {
    const { languages, total, take, skip } = await LanguageService.getList(
      req.query as Record<string, any>
    );

    return res.json(
      Resource.paginate(
        LanguageResource.collection(languages),
        total,
        take,
        skip,
        'Languages retrieved successfully'
      )
    );
  } catch (err: any) {
    console.error('Error getLanguages:', err?.message ?? err);
    return next(err);
  }
}

export async function getLanguagesAll(req: Request, res: Response, next: NextFunction) {
  try {
    const { languages, total, take, skip } = await LanguageService.getAll(
      req.query as Record<string, any>
    );

    return res.json(
      Resource.paginate(
        LanguageResource.collection(languages),
        total,
        take,
        skip,
        'Languages retrieved successfully'
      )
    );
  } catch (err: any) {
    console.error('Error getLanguagesAll:', err?.message ?? err);
    return next(err);
  }
}

/**
 * POST /euonqol-api/languages
 * Adds a language (append-only: no update/delete). Admin only.
 */
export async function createLanguage(req: Request, res: Response, next: NextFunction) {
  try {
    const language = await LanguageService.create(req.body);

    return res
      .status(201)
      .json(Resource.respond(LanguageResource.make(language), 'Language created successfully'));
  } catch (err: any) {
    if (err instanceof ServiceError) {
      return res
        .status(err.statusCode)
        .json({ success: false, message: err.message, field: err.field });
    }
    console.error('Error createLanguage:', err?.message ?? err);
    return next(err);
  }
}
