import { NextFunction, Request, Response } from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import XLSX from 'xlsx';
import { ServiceError } from '../helpers/ServiceError.js';
import { Resource } from '../resources/baseResource.js';
import { CatItemBankResource } from '../resources/catItemBanks.js';
import { CatItemBankImportService } from '../services/CatItemBankImportService.js';
import { CatItemBankService } from '../services/CatItemBankService.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TEMPLATE_PATH = path.resolve(__dirname, '../../data/templates/CatItemBank_Template.xlsx');

/**
 * GET /euonqol-api/cat-item-banks
 * Lists all reusable CAT item banks.
 */
export async function getCatItemBanks(req: Request, res: Response, next: NextFunction) {
  try {
    const { items, total, take, skip } = await CatItemBankService.getList(
      req.query as Record<string, any>
    );

    const data = CatItemBankResource.collection(items, { policy: { authUser: req.user ?? null } });

    return res.json(
      Resource.paginate(data, total, take, skip, 'CAT item banks retrieved successfully')
    );
  } catch (error) {
    return next(error);
  }
}

/**
 * GET /euonqol-api/cat-item-banks/:id
 * Returns a single CAT item bank, including its ScaleCode -> cat_setting mappings.
 */
export async function getCatItemBankById(req: Request, res: Response, next: NextFunction) {
  try {
    const id = parseInt(req.params.id as string, 10);
    if (isNaN(id)) {
      return res.status(400).json({ success: false, message: 'Invalid ID format' });
    }

    const bank = await CatItemBankService.getById(id);
    if (!bank) {
      return res.status(404).json({ success: false, message: 'CAT item bank not found' });
    }

    return res.json(
      Resource.respond(
        CatItemBankResource.make(bank, { policy: { authUser: req.user ?? null } }),
        'CAT item bank retrieved successfully'
      )
    );
  } catch (error) {
    return next(error);
  }
}

/**
 * POST /euonqol-api/cat-item-banks
 * Creates a new CAT item bank and imports its items from an Excel file in one call.
 * Body: { name, description?, fileContent: base64, fileName }.
 */
export async function createCatItemBank(req: Request, res: Response, next: NextFunction) {
  try {
    const { name, description, fileContent, fileName } = req.body;

    const { bank, questionCount, translationCount, languageCount, answerProfileCount } =
      await CatItemBankService.create({ name, description, fileContent, fileName }, req.user?.id ?? null);

    const created = await CatItemBankService.getById(bank.id);

    return res.status(201).json(
      Resource.respond(
        CatItemBankResource.make(created, { policy: { authUser: req.user ?? null } }),
        `Imported ${questionCount} items, ${translationCount} translations, ${languageCount} languages and ${answerProfileCount} answer profiles`
      )
    );
  } catch (error) {
    if (error instanceof ServiceError) {
      if (error.field) {
        return res.status(error.statusCode).json({
          success: false,
          message: error.message,
          errors: { [error.field]: [error.message] },
        });
      }
      return res.status(error.statusCode).json({ success: false, message: error.message });
    }
    return next(error);
  }
}

/**
 * PATCH /euonqol-api/cat-item-banks/:id
 * Updates an existing CAT item bank.
 */
export async function updateCatItemBank(req: Request, res: Response, next: NextFunction) {
  const id = parseInt(req.params.id as string, 10);
  if (isNaN(id)) {
    return res.status(400).json({ success: false, message: 'Invalid ID format' });
  }

  const { name, description, is_active } = req.body;

  try {
    if (name) {
      const conflict = await CatItemBankService.findByName(name, id);
      if (conflict) {
        return res.status(409).json({
          success: false,
          message: `A CAT item bank named "${name}" already exists`,
        });
      }
    }

    const updated = await CatItemBankService.update(id, { name, description, is_active });
    if (!updated) {
      return res.status(404).json({ success: false, message: 'CAT item bank not found' });
    }

    return res.json(
      Resource.respond(
        CatItemBankResource.make(updated, { policy: { authUser: req.user ?? null } }),
        'CAT item bank updated successfully'
      )
    );
  } catch (error) {
    return next(error);
  }
}

/**
 * DELETE /euonqol-api/cat-item-banks/:id
 * Deletes a CAT item bank. Blocked if it is still referenced by any module.
 */
export async function deleteCatItemBank(req: Request, res: Response, next: NextFunction) {
  const id = parseInt(req.params.id as string, 10);
  if (isNaN(id)) {
    return res.status(400).json({ success: false, message: 'Invalid ID format' });
  }

  try {
    const deleted = await CatItemBankService.delete(id);
    if (!deleted) {
      return res.status(404).json({ success: false, message: 'CAT item bank not found' });
    }
    return res.json(Resource.respond(null, 'CAT item bank deleted successfully'));
  } catch (error) {
    if (error instanceof ServiceError) {
      return res.status(error.statusCode).json({ success: false, message: error.message });
    }
    return next(error);
  }
}

/**
 * GET /euonqol-api/cat-item-banks/:id/questions
 * Read-only, paginated browse of a bank's CAT items.
 */
export async function getCatItemBankQuestions(req: Request, res: Response, next: NextFunction) {
  try {
    const id = parseInt(req.params.id as string, 10);
    if (isNaN(id)) {
      return res.status(400).json({ success: false, message: 'Invalid ID format' });
    }

    const result = await CatItemBankService.getQuestions(id, req.query as Record<string, any>);

    return res.json(
      Resource.paginate(
        result.questions,
        result.total,
        result.pageSize,
        (result.page - 1) * result.pageSize,
        'CAT item bank questions retrieved successfully'
      )
    );
  } catch (error) {
    if (error instanceof ServiceError) {
      return res.status(error.statusCode).json({ success: false, message: error.message });
    }
    return next(error);
  }
}

/**
 * GET /euonqol-api/cat-item-banks/:id/scales
 * Lists a bank's ScaleCode -> cat_setting mappings.
 */
export async function getCatItemBankScales(req: Request, res: Response, next: NextFunction) {
  try {
    const id = parseInt(req.params.id as string, 10);
    if (isNaN(id)) {
      return res.status(400).json({ success: false, message: 'Invalid ID format' });
    }

    const scales = await CatItemBankService.getScales(id);

    return res.json(
      Resource.respond(
        scales.map((s) => ({
          id: s.id,
          scaleCode: s.scale_code,
          displayName: s.display_name,
          patientGroup: s.patient_group ? { id: s.patient_group.id, name: s.patient_group.name } : null,
          catSetting: s.cat_setting
            ? { id: s.cat_setting.id, name: s.cat_setting.name, settingKey: s.cat_setting.setting_key }
            : null,
        })),
        'Scale mappings retrieved successfully'
      )
    );
  } catch (error) {
    if (error instanceof ServiceError) {
      return res.status(error.statusCode).json({ success: false, message: error.message });
    }
    return next(error);
  }
}

/**
 * PATCH /euonqol-api/cat-item-banks/:id/scales/:scaleId
 * Repoints a bank's ScaleCode -> cat_setting mapping without a full re-upload.
 */
export async function updateCatItemBankScale(req: Request, res: Response, next: NextFunction) {
  try {
    const id = parseInt(req.params.id as string, 10);
    const scaleId = parseInt(req.params.scaleId as string, 10);
    if (isNaN(id) || isNaN(scaleId)) {
      return res.status(400).json({ success: false, message: 'Invalid ID format' });
    }

    const { cat_setting_id, display_name } = req.body;

    const updated = await CatItemBankService.updateScale(id, scaleId, {
      cat_setting_id,
      display_name,
    });

    return res.json(
      Resource.respond(
        {
          id: updated.id,
          scaleCode: updated.scale_code,
          displayName: updated.display_name,
          patientGroup: updated.patient_group
            ? { id: updated.patient_group.id, name: updated.patient_group.name }
            : null,
          catSetting: {
            id: updated.cat_setting.id,
            name: updated.cat_setting.name,
            settingKey: updated.cat_setting.setting_key,
          },
        },
        'Scale mapping updated successfully'
      )
    );
  } catch (error) {
    if (error instanceof ServiceError) {
      return res.status(error.statusCode).json({ success: false, message: error.message });
    }
    return next(error);
  }
}

/**
 * GET /euonqol-api/cat-item-banks/template
 * Download the Excel template for uploading items into a CAT Item Bank.
 * NOTE: must be routed before /:id.
 */
export async function downloadCatItemBankTemplate(req: Request, res: Response, next: NextFunction) {
  return res.download(TEMPLATE_PATH, 'CatItemBank_Template.xlsx', (err) => {
    if (err) {
      console.error('Error sending CAT item bank template:', err);
      next(err);
    }
  });
}

/**
 * POST /euonqol-api/cat-item-banks/:id/upload
 * Imports raw CAT items (CATquestions/Answers/Languages sheets) into an
 * existing CAT Item Bank. Body: { fileContent: base64, fileName: string }.
 */
export async function uploadCatItemBankItems(req: Request, res: Response, next: NextFunction) {
  try {
    const id = parseInt(req.params.id as string, 10);
    if (isNaN(id)) {
      return res.status(400).json({ success: false, message: 'Invalid ID format' });
    }

    const { fileContent } = req.body;
    if (!fileContent) {
      return res.status(400).json({ success: false, message: 'fileContent is required' });
    }

    const bank = await CatItemBankService.getById(id);
    if (!bank) {
      return res.status(404).json({ success: false, message: 'CAT item bank not found' });
    }

    let buffer: Buffer;
    try {
      buffer = Buffer.from(fileContent, 'base64');
    } catch {
      return res
        .status(400)
        .json({ success: false, message: 'Invalid fileContent: could not decode base64' });
    }

    let workbook: XLSX.WorkBook;
    try {
      workbook = XLSX.read(buffer, { type: 'buffer' });
    } catch {
      return res.status(400).json({ success: false, message: 'Invalid Excel file: could not parse workbook' });
    }

    const result = await CatItemBankImportService.importItems(workbook, id, req.user?.id ?? null);

    return res.status(201).json(
      Resource.respond(
        result,
        `Imported ${result.questionCount} items, ${result.translationCount} translations, ${result.languageCount} languages and ${result.answerProfileCount} answer profiles`
      )
    );
  } catch (error) {
    if (error instanceof ServiceError) {
      return res.status(error.statusCode).json({ success: false, message: error.message });
    }
    return next(error);
  }
}
