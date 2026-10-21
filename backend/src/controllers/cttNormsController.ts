import { NextFunction, Request, Response } from 'express';
import { ServiceError } from '../helpers/ServiceError.js';
import { Resource } from '../resources/baseResource.js';
import { CttNormDetailResource, CttNormResource } from '../resources/cttNorms.js';
import { CttNormService } from '../services/CttNormService.js';

/**
 * GET /euonqol-api/ctt-norms
 * Paginated list of CTT norms versions. Admin + manager.
 * Supports QueryBuilder params: ?filter[is_active]=true&search=name&sort=-created_at&page=1&limit=50
 */
export async function getCttNormsVersions(req: Request, res: Response, next: NextFunction) {
  try {
    const { versions, total, take, skip } = await CttNormService.getList(
      req.query as Record<string, any>
    );

    return res.json(
      Resource.paginate(
        CttNormResource.collection(versions),
        total,
        take,
        skip,
        'CTT norms versions retrieved successfully'
      )
    );
  } catch (err: any) {
    if (err instanceof ServiceError) {
      return res.status(err.statusCode).json({ success: false, message: err.message });
    }
    console.error('Error getCttNormsVersions:', err?.message ?? err);
    return next(err)
  }
}

/**
 * GET /euonqol-api/ctt-norms/all
 * All active CTT norms versions (no pagination). Admin + manager.
 * Used for select dropdowns when creating/editing surveys and questionnaires.
 */
export async function getCttNormsAll(req: Request, res: Response, next: NextFunction) {
  try {
    const { versions, total, take, skip } = await CttNormService.getAll(
      req.query as Record<string, any>
    );

    return res.json(
      Resource.paginate(
        CttNormResource.collection(versions),
        total,
        take,
        skip,
        'CTT norms versions retrieved successfully'
      )
    );
  } catch (err: any) {
    if (err instanceof ServiceError) {
      return res.status(err.statusCode).json({ success: false, message: err.message });
    }
    console.error('Error getCttNormsAll:', err?.message ?? err);
    return next(err);
  }
}

/**
 * GET /euonqol-api/ctt-norms/:id
 * Single CTT norms version with full norms JSON. Admin + manager.
 */
export async function getCttNormsVersionById(req: Request, res: Response, next: NextFunction) {
  try {
    const id = parseInt(req.params.id as string, 10);
    if (isNaN(id)) return res.status(400).json({ success: false, message: 'Invalid id' });

    const version = await CttNormService.getById(id);

    return res.json(
      Resource.respond(CttNormDetailResource.make(version), 'CTT norms version retrieved successfully')
    );
  } catch (err: any) {
    if (err instanceof ServiceError) {
      return res.status(err.statusCode).json({ success: false, message: err.message });
    }
    console.error('Error getCttNormsVersionById:', err?.message ?? err);
    return next(err)
  }
}

/**
 * POST /euonqol-api/ctt-norms
 * Creates a new CTT norms version. Admin only.
 */
export async function createCttNormsVersion(req: Request, res: Response, next: NextFunction) {
  try {
    const { name, description, norms, is_active } = req.body;

    const version = await CttNormService.create(
      { name, description, norms, is_active },
      req.user?.id ?? null
    );

    return res
      .status(201)
      .json(
        Resource.respond(
          CttNormDetailResource.make(version),
          'CTT norms version created successfully'
        )
      );
  } catch (err: any) {
    if (err instanceof ServiceError) {
      return res.status(err.statusCode).json({ success: false, message: err.message });
    }
    console.error('Error createCttNormsVersion:', err?.message ?? err);
    return next(err);
  }
}

/**
 * PUT /euonqol-api/ctt-norms/:id
 * PATCH /euonqol-api/ctt-norms/:id
 * Updates a CTT norms version. Admin only.
 * Blocked if the version is already used by at least one survey.
 */
export async function updateCttNormsVersion(req: Request, res: Response, next: NextFunction) {
  try {
    const id = parseInt(req.params.id as string, 10);
    if (isNaN(id)) return res.status(400).json({ success: false, message: 'Invalid id' });

    const { name, description, norms, is_active } = req.body;

    const version = await CttNormService.update(id, { name, description, norms, is_active });

    return res.json(
      Resource.respond(CttNormDetailResource.make(version), 'CTT norms version updated successfully')
    );
  } catch (err: any) {
    if (err instanceof ServiceError) {
      return res.status(err.statusCode).json({ success: false, message: err.message });
    }
    console.error('Error updateCttNormsVersion:', err?.message ?? err);
    return next(err);
  }
}

/**
 * DELETE /euonqol-api/ctt-norms/:id
 * Deletes a CTT norms version. Admin only.
 * Blocked if the version is used by at least one survey or questionnaire.
 */
export async function deleteCttNormsVersion(req: Request, res: Response, next: NextFunction) {
  try {
    const id = parseInt(req.params.id as string, 10);
    if (isNaN(id)) return res.status(400).json({ success: false, message: 'Invalid id' });

    await CttNormService.delete(id);

    return res.json(Resource.respond(null, 'CTT norms version deleted successfully'));
  } catch (err: any) {
    if (err instanceof ServiceError) {
      return res.status(err.statusCode).json({ success: false, message: err.message });
    }
    console.error('Error deleteCttNormsVersion:', err?.message ?? err);
    return next(err);
  }
}
