import { NextFunction, Request, Response } from 'express';
import { ServiceError } from '../helpers/ServiceError.js';
import { EmailTemplatePolicy } from '../policy/emailTemplatePolicy.js';
import { Resource } from '../resources/baseResource.js';
import { EmailTemplateResource } from '../resources/emailTemplates.js';
import { EmailTemplateService } from '../services/EmailTemplateService.js';

function parseParams(req: Request) {
  return {
    surveyId: parseInt(req.params.surveyId as string, 10),
    questionnaireId: parseInt(req.params.questionnaireId as string, 10),
    languageId: req.params.languageId !== undefined ? parseInt(req.params.languageId as string, 10) : undefined,
  };
}

/**
 * GET /euonqol-api/surveys/:surveyId/questionnaires/:questionnaireId/email-templates
 * List all email templates for a survey+questionnaire pair
 */
export async function listEmailTemplates(req: Request, res: Response, next: NextFunction) {
  try {
    const { surveyId, questionnaireId } = parseParams(req);
    if (isNaN(surveyId) || isNaN(questionnaireId)) {
      return res.status(400).json({ success: false, message: 'Invalid survey or questionnaire ID' });
    }

    const { templates, total, take, skip, surveyStatus, questionnaireStatus } = await EmailTemplateService.list(
      surveyId,
      questionnaireId,
      req.query as Record<string, any>
    );

    const response = Resource.paginate(
      EmailTemplateResource.collection(templates, { policy: { authUser: req.user ?? null } }),
      total,
      take,
      skip,
      'Email templates retrieved successfully'
    );
    (response.meta as any).authorizations = {
      create: new EmailTemplatePolicy(req.user ?? null).create({ surveyStatus, questionnaireStatus }),
    };
    return res.json(response);
  } catch (err: any) {
    if (err instanceof ServiceError) {
      return res.status(err.statusCode).json({ success: false, message: err.message });
    }
    return next(err);
  }
}

/**
 * GET /euonqol-api/surveys/:surveyId/questionnaires/:questionnaireId/email-templates/:languageId
 * Fetch a single email template
 */
export async function getEmailTemplate(req: Request, res: Response, next: NextFunction) {
  try {
    const { surveyId, questionnaireId, languageId } = parseParams(req);
    if (isNaN(surveyId) || isNaN(questionnaireId) || isNaN(languageId as number)) {
      return res.status(400).json({ success: false, message: 'Invalid parameters' });
    }

    const template = await EmailTemplateService.getById(surveyId, questionnaireId, languageId as number);

    return res.json(
      Resource.respond(
        EmailTemplateResource.make(template, { policy: { authUser: req.user ?? null } }),
        'Email template retrieved successfully'
      )
    );
  } catch (err: any) {
    if (err instanceof ServiceError) {
      return res.status(err.statusCode).json({ success: false, message: err.message });
    }
    return next(err);
  }
}

/**
 * POST /euonqol-api/surveys/:surveyId/questionnaires/:questionnaireId/email-templates
 * Create an email template for a specific language
 */
export async function createEmailTemplate(req: Request, res: Response, next: NextFunction) {
  try {
    const { surveyId, questionnaireId } = parseParams(req);
    if (isNaN(surveyId) || isNaN(questionnaireId)) {
      return res.status(400).json({ success: false, message: 'Invalid survey or questionnaire ID' });
    }

    const template = await EmailTemplateService.create(surveyId, questionnaireId, req.body);

    return res
      .status(201)
      .json(
        Resource.respond(
          EmailTemplateResource.make(template, { policy: { authUser: req.user ?? null } }),
          'Email template created successfully'
        )
      );
  } catch (err: any) {
    if (err instanceof ServiceError) {
      return res.status(err.statusCode).json({ success: false, message: err.message });
    }
    return next(err);
  }
}

/**
 * PUT /euonqol-api/surveys/:surveyId/questionnaires/:questionnaireId/email-templates/:languageId
 * Update subject and/or body of an existing template
 */
export async function updateEmailTemplate(req: Request, res: Response, next: NextFunction) {
  try {
    const { surveyId, questionnaireId, languageId } = parseParams(req);
    if (isNaN(surveyId) || isNaN(questionnaireId) || isNaN(languageId as number)) {
      return res.status(400).json({ success: false, message: 'Invalid parameters' });
    }

    const template = await EmailTemplateService.update(
      surveyId,
      questionnaireId,
      languageId as number,
      req.body
    );

    return res.json(
      Resource.respond(
        EmailTemplateResource.make(template, { policy: { authUser: req.user ?? null } }),
        'Email template updated successfully'
      )
    );
  } catch (err: any) {
    if (err instanceof ServiceError) {
      return res.status(err.statusCode).json({ success: false, message: err.message });
    }
    return next(err);
  }
}

/**
 * PUT /euonqol-api/surveys/:surveyId/questionnaires/:questionnaireId/email-templates/:languageId/fallback
 * Toggle fallback for a specific language template
 */
export async function toggleEmailTemplateFallback(req: Request, res: Response, next: NextFunction) {
  try {
    const { surveyId, questionnaireId, languageId } = parseParams(req);
    if (isNaN(surveyId) || isNaN(questionnaireId) || isNaN(languageId as number)) {
      return res.status(400).json({ success: false, message: 'Invalid parameters' });
    }

    const is_fallback = await EmailTemplateService.toggleFallback(
      surveyId,
      questionnaireId,
      languageId as number
    );

    return res.json(Resource.respond({ is_fallback }, 'Fallback toggled successfully'));
  } catch (err: any) {
    if (err instanceof ServiceError) {
      return res.status(err.statusCode).json({ success: false, message: err.message });
    }
    return next(err);
  }
}

/**
 * DELETE /euonqol-api/surveys/:surveyId/questionnaires/:questionnaireId/email-templates/:languageId
 * Delete a template for a specific language
 */
export async function deleteEmailTemplate(req: Request, res: Response, next: NextFunction) {
  try {
    const { surveyId, questionnaireId, languageId } = parseParams(req);
    if (isNaN(surveyId) || isNaN(questionnaireId) || isNaN(languageId as number)) {
      return res.status(400).json({ success: false, message: 'Invalid parameters' });
    }

    await EmailTemplateService.delete(surveyId, questionnaireId, languageId as number);

    return res.json(Resource.respond(null, 'Template deleted successfully'));
  } catch (err: any) {
    if (err instanceof ServiceError) {
      return res.status(err.statusCode).json({ success: false, message: err.message });
    }
    return next(err);
  }
}
