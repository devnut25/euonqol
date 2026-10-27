import { NextFunction, Request, Response } from 'express';
import { prisma } from '../config/database.js';
import { ServiceError } from '../helpers/ServiceError.js';
import { Resource } from '../resources/baseResource.js';
import { QuestionnairePolicy } from '../policy/questionnairePolicy.js';
import { QuestionnaireDetailResource, QuestionnaireResource } from '../resources/questionnaires.js';
import { QuestionnaireService } from '../services/QuestionnaireService.js';

/**
 * POST /euonqol-api/surveys/:surveyId/questionnaires
 * Create a new questionnaire within a survey
 */
export async function createQuestionnaire(req: Request, res: Response, next: NextFunction) {
  try {
    const surveyIdNum = parseInt(req.params.surveyId as string, 10);
    if (isNaN(surveyIdNum)) {
      return res.status(400).json({ success: false, message: 'Invalid survey ID' });
    }

    const questionnaire = await QuestionnaireService.create(
      surveyIdNum,
      req.body,
      req.user?.id ?? null
    );

    return res
      .status(201)
      .json(
        Resource.respond(
          QuestionnaireDetailResource.make(questionnaire, {
            policy: { authUser: req.user ?? null },
          }),
          'Questionnaire created successfully'
        )
      );
  } catch (err: any) {
    if (err instanceof ServiceError) {
      return res.status(err.statusCode).json({ success: false, message: err.message });
    }
    console.error('Error creating questionnaire:', err?.message ?? err);
    return next(err);
  }
}

/**
 * GET /euonqol-api/surveys/:surveyId/questionnaires
 * List questionnaires for a survey
 */
export async function getSurveyQuestionnaires(req: Request, res: Response, next: NextFunction) {
  try {
    const surveyIdNum = parseInt(req.params.surveyId as string, 10);
    if (isNaN(surveyIdNum)) {
      return res.status(400).json({ success: false, message: 'Invalid survey ID' });
    }

    const { questionnaires, total, take, skip, survey, activeQuestionnairesCount } =
      await QuestionnaireService.getSurveyQuestionnaires(
        surveyIdNum,
        req.query as Record<string, any>
      );

    const data = QuestionnaireResource.collection(questionnaires, {
      policy: { authUser: req.user ?? null },
    });
    const response = Resource.paginate(data, total, take, skip, 'Questionnaires retrieved successfully');
    (response.meta as any).survey = survey;
    (response.meta as any).activeQuestionnairesCount = activeQuestionnairesCount;
    (response.meta as any).authorizations = {
      create: new QuestionnairePolicy(req.user ?? null).create(survey),
    };

    return res.json(response);
  } catch (err: any) {
    if (err instanceof ServiceError) {
      return res.status(err.statusCode).json({ success: false, message: err.message });
    }
    console.error('Error fetching survey questionnaires:', err?.message ?? err);
    return next(err);
  }
}

/**
 * GET /euonqol-api/questionnaires/:id
 * Get questionnaire details
 */
export async function getQuestionnaireById(req: Request, res: Response, next: NextFunction) {
  try {
    const questionnaireId = parseInt(req.params.id as string, 10);
    if (isNaN(questionnaireId)) {
      return res.status(400).json({ success: false, message: 'Invalid questionnaire ID' });
    }

    const questionnaire = await QuestionnaireService.getById(questionnaireId);

    return res.json(
      Resource.respond(
        QuestionnaireDetailResource.make(questionnaire, {
          policy: { authUser: req.user ?? null },
        }),
        'Questionnaire retrieved successfully'
      )
    );
  } catch (err: any) {
    if (err instanceof ServiceError) {
      return res.status(err.statusCode).json({ success: false, message: err.message });
    }
    console.error('Error fetching questionnaire:', err?.message ?? err);
    return next(err);
  }
}

/**
 * PUT /euonqol-api/questionnaires/:id
 * Update questionnaire details
 */
export async function updateQuestionnaire(req: Request, res: Response, next: NextFunction) {
  try {
    const questionnaireId = parseInt(req.params.id as string, 10);
    if (isNaN(questionnaireId)) {
      return res.status(400).json({ success: false, message: 'Invalid questionnaire ID' });
    }

    const questionnaire = await QuestionnaireService.update(questionnaireId, req.body);

    return res.json(
      Resource.respond(
        QuestionnaireDetailResource.make(questionnaire, {
          policy: { authUser: req.user ?? null },
        }),
        'Questionnaire updated successfully'
      )
    );
  } catch (err: any) {
    if (err instanceof ServiceError) {
      return res.status(err.statusCode).json({ success: false, message: err.message });
    }
    console.error('Error updating questionnaire:', err?.message ?? err);
    return next(err);
  }
}

/**
 * PUT /euonqol-api/questionnaires/:id/modules
 * Add/reorder/remove modules in questionnaire
 */
export async function updateQuestionnaireModules(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const questionnaireId = parseInt(req.params.id as string, 10);
    if (isNaN(questionnaireId)) {
      return res.status(400).json({ success: false, message: 'Invalid questionnaire ID' });
    }

    const { modules } = req.body;
    if (!Array.isArray(modules)) {
      return res.status(400).json({ success: false, message: 'Modules must be an array' });
    }

    // Get questionnaire with patient_group_id and type
    const questionnaire = await prisma.questionnaires.findUnique({
      where: { id: questionnaireId },
      select: {
        id: true,
        patient_group_id: true,
        type: true,
        status: true,
      },
    });

    if (!questionnaire) {
      return res.status(404).json({ error: 'Questionnaire not found' });
    }

    // Modules can only be changed while the questionnaire is still in draft
    if (questionnaire.status !== 'draft') {
      return res.status(403).json({
        error: 'Cannot modify modules of a non-draft questionnaire',
        message: 'Modules can only be changed while the questionnaire is in draft status.',
      });
    }

    // Block module updates if questionnaire has been activated (has assignments)
    const modulesAssignmentCount = await prisma.survey_questionnaire_patients_assignment.count({
      where: { survey_questionnaire: { questionnaire_id: questionnaireId } },
    });
    if (modulesAssignmentCount > 0) {
      return res.status(403).json({
        error: 'Cannot modify modules of an active questionnaire',
        message: 'This questionnaire already has patient assignments. Module structure is locked.',
      });
    }

    // Extract module IDs
    const moduleIds = modules.map((m: any) => m.moduleId).filter((id: any) => id);

    if (moduleIds.length === 0) {
      // Remove all modules
      await prisma.questionnaires_modules.deleteMany({
        where: { questionnaire_id: questionnaireId },
      });

      return res.json({
        message: 'All modules removed successfully',
        questionnaire: { id: questionnaireId },
        updatedCount: 0,
      });
    }

    // Validate all modules exist and match patient_group + type
    const foundModules = await prisma.modules.findMany({
      where: { id: { in: moduleIds } },
      select: {
        id: true,
        patient_group_id: true,
        type: true,
        name: true,
      },
    });

    if (foundModules.length !== moduleIds.length) {
      const missingIds = moduleIds.filter((id: number) => !foundModules.find((m) => m.id === id));
      return res.status(404).json({
        error: 'Some modules not found',
        missingModuleIds: missingIds,
      });
    }

    // CRITICAL: Validate patient_group consistency
    const invalidGroupModules = foundModules.filter(
      (m) => m.patient_group_id !== questionnaire.patient_group_id
    );

    if (invalidGroupModules.length > 0) {
      return res.status(400).json({
        error: 'All modules must belong to the same patient group as the questionnaire',
        questionnairePatientGroupId: questionnaire.patient_group_id,
        invalidModules: invalidGroupModules.map((m) => ({
          id: m.id,
          name: m.name,
          patient_group_id: m.patient_group_id,
        })),
      });
    }

    // Validate type consistency: socio-demo and feedback modules can be mixed with any
    // questionnaire type. Only static/dynamic consistency is enforced between other modules.
    const coreModules = foundModules.filter(
      (m) => m.type !== 'socio-demo' && m.type !== 'feedback'
    );
    const invalidTypeModules = coreModules.filter((m) => m.type !== questionnaire.type);

    if (invalidTypeModules.length > 0) {
      return res.status(400).json({
        error: `Questionnaire type "${questionnaire.type}" requires non-socio-demo/feedback modules of the same type`,
        questionnaireType: questionnaire.type,
        invalidModules: invalidTypeModules.map((m) => ({
          id: m.id,
          name: m.name,
          type: m.type,
        })),
      });
    }

    // Perform update in transaction
    const result = await prisma.$transaction(async (tx) => {
      // Delete existing modules
      await tx.questionnaires_modules.deleteMany({
        where: { questionnaire_id: questionnaireId },
      });

      // Insert new modules
      const createPromises = modules.map((moduleData: any) => {
        return tx.questionnaires_modules.create({
          data: {
            questionnaire_id: questionnaireId,
            module_id: moduleData.moduleId,
            position: moduleData.position,
            is_active: moduleData.is_active ?? true,
          },
        });
      });

      return await Promise.all(createPromises);
    });

    return res.json({
      message: `Successfully updated ${result.length} module(s)`,
      questionnaire: {
        id: questionnaireId,
        type: questionnaire.type,
      },
      updatedCount: result.length,
    });
  } catch (error) {
    console.error('Error updating questionnaire modules:', error);
    return next(error);
  }
}

/**
 * GET /euonqol-api/questionnaires/:id/preview
 * Get full questionnaire preview with all questions
 */
export async function getQuestionnairePreview(req: Request, res: Response, next: NextFunction) {
  try {
    const questionnaireId = parseInt(req.params.id as string, 10);
    if (isNaN(questionnaireId)) {
      return res.status(400).json({ success: false, message: 'Invalid questionnaire ID' });
    }

    const languageId = parseInt((req.query.languageId as string) ?? '14', 10); // Default: Italian (Italy, id=14)

    const preview = await QuestionnaireService.getPreview(questionnaireId, languageId);

    return res.json(preview);
  } catch (err: any) {
    if (err instanceof ServiceError) {
      return res.status(err.statusCode).json({ success: false, message: err.message });
    }
    console.error('Error generating questionnaire preview:', err?.message ?? err);
    return next(err);
  }
}

/**
 * DELETE /euonqol-api/questionnaires/:id
 * Delete questionnaire (only if not used in assignments)
 */
export async function deleteQuestionnaire(req: Request, res: Response, next: NextFunction) {
  try {
    const questionnaireId = parseInt(req.params.id as string, 10);
    if (isNaN(questionnaireId)) {
      return res.status(400).json({ success: false, message: 'Invalid questionnaire ID' });
    }

    const deleted = await QuestionnaireService.delete(questionnaireId);

    return res.json(
      Resource.respond(
        { id: deleted.id, title: deleted.title },
        'Questionnaire deleted successfully'
      )
    );
  } catch (err: any) {
    if (err instanceof ServiceError) {
      return res.status(err.statusCode).json({ success: false, message: err.message });
    }
    console.error('Error deleting questionnaire:', err?.message ?? err);
    return next(err);
  }
}

/**
 * POST /euonqol-api/surveys/:surveyId/questionnaires/:questionnaireId/public-link
 * Generate a public anonymous link for a questionnaire
 * Modalità 1: Anonima - un singolo link condiviso per tutti
 */
export async function generatePublicLink(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.user) {
      return res.status(401).json({ success: false, message: 'Authentication required' });
    }

    const surveyIdNum = parseInt(req.params.surveyId as string, 10);
    const questionnaireIdNum = parseInt(req.params.questionnaireId as string, 10);

    const result = await QuestionnaireService.generatePublicLink(surveyIdNum, questionnaireIdNum);

    return res
      .status(201)
      .json(Resource.respond(result, 'Public anonymous link generated successfully'));
  } catch (err: any) {
    if (err instanceof ServiceError) {
      return res.status(err.statusCode).json({ success: false, message: err.message });
    }
    console.error('Error generating public link:', err?.message ?? err);
    return next(err);
  }
}

/**
 * GET /euonqol-api/surveys/:surveyId/questionnaires/:questionnaireId/public-link
 * Get the public anonymous link for a questionnaire (if exists)
 */
export async function getPublicLink(req: Request, res: Response, next: NextFunction) {
  try {
    const surveyIdNum = parseInt(req.params.surveyId as string, 10);
    const questionnaireIdNum = parseInt(req.params.questionnaireId as string, 10);

    const result = await QuestionnaireService.getPublicLink(surveyIdNum, questionnaireIdNum);

    return res.json(Resource.respond(result, 'Public link retrieved successfully'));
  } catch (err: any) {
    if (err instanceof ServiceError) {
      return res.status(err.statusCode).json({ success: false, message: err.message });
    }
    console.error('Error fetching public link:', err?.message ?? err);
    return next(err);
  }
}

/**
 * DELETE /euonqol-api/surveys/:surveyId/questionnaires/:questionnaireId/public-link
 * Remove the public anonymous link for a questionnaire
 */
export async function deletePublicLink(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.user) {
      return res.status(401).json({ success: false, message: 'Authentication required' });
    }

    const surveyIdNum = parseInt(req.params.surveyId as string, 10);
    const questionnaireIdNum = parseInt(req.params.questionnaireId as string, 10);

    const result = await QuestionnaireService.deletePublicLink(surveyIdNum, questionnaireIdNum);

    return res.json(Resource.respond(result, 'Public link deleted successfully'));
  } catch (err: any) {
    if (err instanceof ServiceError) {
      return res.status(err.statusCode).json({ success: false, message: err.message });
    }
    console.error('Error deleting public link:', err?.message ?? err);
    return next(err);
  }
}
