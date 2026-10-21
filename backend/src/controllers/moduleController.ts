import { NextFunction, Request, Response } from 'express';
import { ServiceError } from '../helpers/ServiceError.js';
import { Resource } from '../resources/baseResource.js';
import { ModuleDetailResource, ModuleResource, ModuleResourceAll } from '../resources/modules.js';
import { ModuleService } from '../services/ModuleService.js';

/**
 * GET /euonqol-api/modules
 * Lista tutti i moduli con filtri
 * Query params (QueryBuilder style):
 *   ?filter[type]=static&filter[is_active]=true&filter[kit_version_id]=1
 *   ?search=nome
 *   ?sort=-created_at
 *   ?page=1&limit=50
 */
export async function getModules(req: Request, res: Response, next: NextFunction) {
  try {
    const { resource = 'minimal' } = req.query as any;
    const { modules, total, take, skip } = await ModuleService.getList(
      req.query as Record<string, any>
    );

    const data = ModuleResource.resolveCollection(resource, modules);

    return res.json(Resource.paginate(data, total, take, skip, 'Modules retrieved successfully'));
  } catch (err: any) {
    return next(err);
  }
}

/**
 * GET /euonqol-api/modules/all
 * Active modules for a patient group OR of type feedback/socio-demo.
 * Query: filter[patient_group_id]=1&filter[is_active]=true
 */
export async function getModulesAll(req: Request, res: Response, next: NextFunction) {
  try {
    const { modules, total, take, skip } = await ModuleService.getAll(
      req.query as Record<string, any>
    );

    return res.json(
      Resource.paginate(
        ModuleResourceAll.collection(modules),
        total,
        take,
        skip,
        'Modules retrieved successfully'
      )
    );
  } catch (err: any) {
    console.error('Error getModulesAll:', err?.message ?? err);
    return next(err);
  }
}

/**
 * GET /euonqol-api/modules/:id
 * Dettagli di un modulo specifico
 */
export async function getModuleById(req: Request, res: Response, next: NextFunction) {
  try {
    const moduleId = parseInt(req.params.id as string, 10);

    if (isNaN(moduleId)) {
      return res.status(400).json({ success: false, message: 'Invalid module ID' });
    }

    const module = await ModuleService.getById(moduleId);

    if (!module) {
      return res.status(404).json({ success: false, message: 'Module not found' });
    }

    return res.json(
      Resource.respond(ModuleDetailResource.make(module), 'Module retrieved successfully')
    );
  } catch (err: any) {
    return next(err);
  }
}

/**
 * POST /euonqol-api/modules
 * Crea un nuovo modulo
 */
export async function createModule(req: Request, res: Response, next: NextFunction) {
  try {
    const { kitVersionId, name, type, patientGroupId, groupName, catSettingId } = req.body;

    if (!kitVersionId || !name || !type) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields: kitVersionId, name, type',
      });
    }

    const module = await ModuleService.create(
      { kitVersionId, name, type, patientGroupId, groupName, catSettingId },
      req.user?.id ?? null
    );

    return res
      .status(201)
      .json(Resource.respond(ModuleDetailResource.make(module), 'Module created successfully'));
  } catch (err: any) {
    if (err instanceof ServiceError) {
      return res.status(err.statusCode).json({ success: false, message: err.message });
    }
    return next(err);
  }
}

/**
 * PUT /euonqol-api/modules/:id
 * Aggiorna un modulo esistente
 */
export async function updateModule(req: Request, res: Response, next: NextFunction) {
  try {
    const moduleId = parseInt(req.params.id as string, 10);

    if (isNaN(moduleId)) {
      return res.status(400).json({ success: false, message: 'Invalid module ID' });
    }

    const { name, is_active, patientGroupId, groupName } = req.body;

    const module = await ModuleService.update(moduleId, {
      name,
      is_active,
      patientGroupId,
      groupName,
    });

    return res.json(
      Resource.respond(ModuleDetailResource.make(module), 'Module updated successfully')
    );
  } catch (err: any) {
    if (err instanceof ServiceError) {
      return res.status(err.statusCode).json({ success: false, message: err.message });
    }
    return next(err);
  }
}

/**
 * DELETE /euonqol-api/modules/:id
 * Elimina un modulo (solo se non usato in questionari)
 */
export async function deleteModule(req: Request, res: Response, next: NextFunction) {
  try {
    const moduleId = parseInt(req.params.id as string, 10);

    if (isNaN(moduleId)) {
      return res.status(400).json({ success: false, message: 'Invalid module ID' });
    }

    const deleted = await ModuleService.delete(moduleId);

    return res.json(
      Resource.respond(
        { id: deleted.id, name: deleted.name, kitVersionDeleted: deleted.kitVersionDeleted },
        deleted.kitVersionDeleted
          ? 'Module deleted successfully. The kit version was also removed since it had no modules or questions left.'
          : 'Module deleted successfully'
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
 * GET /euonqol-api/modules/:id/questions
 * Ottiene tutte le domande di un modulo ordinate per position
 */
export async function getModuleQuestions(req: Request, res: Response, next: NextFunction) {
  try {
    const moduleId = parseInt(req.params.id as string, 10);
    const languageId = parseInt((req.query.languageId as string) ?? '14', 10);
    const includeInactive = req.query.includeInactive === 'true';

    if (isNaN(moduleId)) {
      return res.status(400).json({ success: false, message: 'Invalid module ID' });
    }

    if (isNaN(languageId)) {
      return res.status(400).json({ success: false, message: 'Invalid language ID' });
    }

    const { module, questions } = await ModuleService.getModuleQuestions(moduleId, {
      languageId,
      includeInactive,
    });

    return res.json({
      module: {
        id: module.id,
        name: module.name,
        type: module.type,
        is_active: module.is_active,
        kitVersion: (module as any).kit_version,
      },
      questions,
      totalQuestions: questions.length,
      filters: { languageId, includeInactive },
    });
  } catch (err: any) {
    if (err instanceof ServiceError) {
      return res.status(err.statusCode).json({ success: false, message: err.message });
    }
    return next(err);
  }
}

/**
 * PUT /euonqol-api/modules/:id/questions
 * Bulk update delle domande di un modulo con riordinamento
 * Body: { questions: [{ questionId: number, position: number, isActive?: boolean }] }
 */
export async function updateModuleQuestions(req: Request, res: Response, next: NextFunction) {
  try {
    const moduleId = parseInt(req.params.id as string, 10);
    const { questions } = req.body;

    if (isNaN(moduleId)) {
      return res.status(400).json({ success: false, message: 'Invalid module ID' });
    }

    if (!Array.isArray(questions)) {
      return res.status(400).json({ success: false, message: 'questions must be an array' });
    }

    const result = await ModuleService.updateModuleQuestions(
      moduleId,
      questions,
      req.user?.id ?? null
    );

    return res.json(
      Resource.respond(
        {
          module: { id: result.module.id, name: result.module.name, type: result.module.type },
          affectedCount: result.affectedCount,
          activeQuestions: result.activeQuestions,
        },
        `Successfully updated ${result.affectedCount} question(s)`
      )
    );
  } catch (err: any) {
    if (err instanceof ServiceError) {
      return res.status(err.statusCode).json({ success: false, message: err.message });
    }
    return next(err);
  }
}
