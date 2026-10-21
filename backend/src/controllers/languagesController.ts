import { NextFunction, Request, Response } from 'express';
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
