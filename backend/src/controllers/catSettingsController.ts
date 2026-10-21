import { NextFunction, Request, Response } from 'express';
import { ServiceError } from '../helpers/ServiceError.js';
import { Resource } from '../resources/baseResource.js';
import { CatSettingResource } from '../resources/catSettings.js';
import * as catService from '../services/cat/catService.js';
import { CatSettingService } from '../services/CatSettingService.js';

/**
 * GET /euonqol-api/cat-settings
 * Lista tutti i CAT settings disponibili
 */
export async function getCatSettings(req: Request, res: Response, next: NextFunction) {
  try {
    const { items, total, take, skip } = await CatSettingService.getList(
      req.query as Record<string, any>
    );

    const data = CatSettingResource.collection(items);

    return res.json(
      Resource.paginate(data, total, take, skip, 'CAT settings retrieved successfully')
    );
  } catch (error) {
    return next(error);
  }
}

/**
 * GET /euonqol-api/cat-settings/:id
 * Ottiene un singolo CAT setting per ID
 */
export async function getCatSettingById(req: Request, res: Response, next: NextFunction) {
  try {
    const id = parseInt(req.params.id as string, 10);
    if (isNaN(id)) {
      return res.status(400).json({ success: false, message: 'Invalid ID format' });
    }

    const catSetting = await CatSettingService.getById(id);

    if (!catSetting) {
      return res.status(404).json({ success: false, message: 'CAT setting not found' });
    }

    return res.json(
      Resource.respond(CatSettingResource.make(catSetting), 'CAT setting retrieved successfully')
    );
  } catch (error) {
    return next(error);
  }
}

/**
 * GET /euonqol-api/cat-settings/fetch-from-cat/:settingKey
 * Proxy: calls the external CAT API and returns the extracted api_configuration.
 */
export async function fetchFromCatApi(req: Request, res: Response, next: NextFunction) {
  const settingKey = req.params.settingKey as string;
  if (!settingKey) {
    return res.status(400).json({ error: 'settingKey is required' });
  }

  try {
    const apiConfiguration = await catService.fetchApiConfiguration(settingKey);
    return res.json({ api_configuration: apiConfiguration });
  } catch (err: any) {
    const status = err?.statusCode ?? err?.response?.status;
    if (status === 404) {
      return res.status(404).json({ error: `CAT setting "${settingKey}" not found on CAT API` });
    }
    return next(err);
  }
}

/**
 * POST /euonqol-api/cat-settings
 * Create a new CAT setting.
 */
export async function createCatSetting(req: Request, res: Response, next: NextFunction) {
  const { name, description, setting_key, api_configuration } = req.body;

  if (!name || !setting_key) {
    return res.status(400).json({ success: false, message: 'name and setting_key are required' });
  }

  try {
    const existing = await CatSettingService.findByKey(setting_key);
    if (existing) {
      return res.status(409).json({
        success: false,
        message: `A CAT setting with key "${setting_key}" already exists`,
      });
    }

    const created = await CatSettingService.create({
      name,
      description,
      setting_key,
      api_configuration,
    });

    return res
      .status(201)
      .json(Resource.respond(CatSettingResource.make(created), 'CAT setting created successfully'));
  } catch (error) {
    return next(error);
  }
}

/**
 * PATCH /euonqol-api/cat-settings/:id
 * Update an existing CAT setting.
 */
export async function updateCatSetting(req: Request, res: Response, next: NextFunction) {
  const id = parseInt(req.params.id as string, 10);
  if (isNaN(id)) {
    return res.status(400).json({ success: false, message: 'Invalid ID format' });
  }

  const { name, description, setting_key, api_configuration } = req.body;

  try {
    const existing = await CatSettingService.getById(id);
    if (!existing) {
      return res.status(404).json({ success: false, message: 'CAT setting not found' });
    }

    if (setting_key && setting_key !== existing.setting_key) {
      const conflict = await CatSettingService.findByKey(setting_key, id);
      if (conflict) {
        return res.status(409).json({
          success: false,
          message: `A CAT setting with key "${setting_key}" already exists`,
        });
      }
    }

    const updated = await CatSettingService.update(id, {
      name,
      description,
      setting_key,
      api_configuration,
    });

    return res.json(
      Resource.respond(CatSettingResource.make(updated), 'CAT setting updated successfully')
    );
  } catch (error) {
    return next(error);
  }
}

/**
 * POST /euonqol-api/cat-settings/check-missing
 * Given { settingKeys: string[] }, returns which ones don't exist in the DB yet.
 * Used by the Module Library dynamic upload form to preview auto-creation.
 */
export async function checkMissingCatSettings(req: Request, res: Response, next: NextFunction) {
  try {
    const settingKeys = Array.isArray(req.body?.settingKeys) ? req.body.settingKeys : [];
    const missing = await CatSettingService.findMissingKeys(settingKeys);
    return res.json(Resource.respond({ missing }, 'Missing CAT settings computed successfully'));
  } catch (error) {
    return next(error);
  }
}

/**
 * POST /euonqol-api/cat-settings/bulk
 * Given { settings: { name, setting_key, description? }[] }, creates any that don't
 * already exist (matched by setting_key). Non-blocking helper for the upload flow —
 * importDynamic also auto-creates missing settings server-side regardless.
 */
export async function bulkCreateCatSettings(req: Request, res: Response, next: NextFunction) {
  try {
    const settings = Array.isArray(req.body?.settings) ? req.body.settings : [];
    const result = await CatSettingService.bulkCreate(settings);
    return res.json(Resource.respond(result, 'CAT settings bulk-created successfully'));
  } catch (error) {
    return next(error);
  }
}

/**
 * DELETE /euonqol-api/cat-settings/:id
 * Deletes a CAT setting. Admin only.
 * Blocked if the setting is used by at least one survey.
 */
export async function deleteCatSetting(req: Request, res: Response, next: NextFunction) {
  const id = parseInt(req.params.id as string, 10);
  if (isNaN(id)) {
    return res.status(400).json({ success: false, message: 'Invalid ID format' });
  }

  try {
    const deleted = await CatSettingService.delete(id);
    if (!deleted) {
      return res.status(404).json({ success: false, message: 'CAT setting not found' });
    }
    return res.json(Resource.respond(null, 'CAT setting deleted successfully'));
  } catch (error) {
    if (error instanceof ServiceError) {
      return res.status(error.statusCode).json({ success: false, message: error.message });
    }
    return next(error);
  }
}
