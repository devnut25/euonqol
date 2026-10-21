import { NextFunction, Request, Response } from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { KitVersionTypeEnum } from '../config/enums.js';
import { PrismaClient } from '../generated/app/index.js';
import { ServiceError } from '../helpers/ServiceError.js';
import { KitVersionPolicy } from '../policy/kitVersionPolicy.js';
import { Resource } from '../resources/baseResource.js';
import {
  KitQuestionResource,
  KitVersionDeleteResource,
  KitVersionDetailResource,
  KitVersionResource,
  KitVersionWriteResource,
} from '../resources/kitVersions.js';
import { KitVersionService } from '../services/KitVersionService.js';
import { CreateKitVersionInput, UpdateKitVersionInput } from '../validators/schemas/kitVersion.js';

const prisma = new PrismaClient();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TEMPLATES_DIR = path.resolve(__dirname, '../../data/templates');

const KIT_TEMPLATE_MAP: Record<KitVersionTypeEnum, string> = {
  [KitVersionTypeEnum.STATIC]: 'Static_Template.xlsx',
  [KitVersionTypeEnum.CAT]: 'Dynamic_Template.xlsx',
  [KitVersionTypeEnum.SOCIO_DEMO]: 'Additional_Informations_Template.xlsx',
  [KitVersionTypeEnum.FEEDBACK]: 'Feedback_Template.xlsx',
};

/**
 * GET /euonqol-api/kit-versions/template/:type
 * Download the Excel template for a given kit type
 */
export async function downloadKitTemplate(req: Request, res: Response, next: NextFunction) {
  const type = req.params.type as KitVersionTypeEnum;
  const fileName = KIT_TEMPLATE_MAP[type];
  if (!fileName) {
    return res.status(400).json({ success: false, message: `Unknown kit type: ${req.params.type}` });
  }
  const filePath = path.join(TEMPLATES_DIR, fileName);
  return res.download(filePath, fileName, (err) => {
    if (err) {
      console.error('Error sending kit template:', err);
      next(err);
    }
  });
}
export async function getKitVersions(req: Request, res: Response, next: NextFunction) {
  try {
    const { versions, total, page, pageSize } = await KitVersionService.getList(
      req.query as Record<string, any>
    );

    const options = { policy: { authUser: req.user ?? null } };
    const data = KitVersionResource.collection(versions, options);

    const policy = new KitVersionPolicy(req.user ?? null);
    const authorizations = { create: policy.create() };

    return res.json(
      Resource.paginate(
        data,
        total,
        pageSize,
        (page - 1) * pageSize,
        'Kit versions retrieved successfully',
        authorizations
      )
    );
  } catch (err: any) {
    return next(err);
  }
}

/**
 * GET /euonqol-api/kit-versions/:id
 */
export async function getKitVersionById(req: Request, res: Response, next: NextFunction) {
  try {
    const versionId = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id, 10);

    if (isNaN(versionId)) {
      return res.status(400).json({ success: false, message: 'Invalid kit version ID' });
    }

    const version = await KitVersionService.getById(versionId);

    if (!version) {
      return res.status(404).json({ success: false, message: 'Kit version not found' });
    }

    const options = { policy: { authUser: req.user ?? null } };
    return res.json(
      Resource.respond(
        KitVersionDetailResource.make(version, options),
        'Kit version retrieved successfully'
      )
    );
  } catch (err: any) {
    return next(err);
  }
}

/**
 * GET /euonqol-api/kit-versions/:id/questions
 */
export async function getKitVersionQuestions(req: Request, res: Response, next: NextFunction) {
  try {
    const versionId = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id, 10);

    if (isNaN(versionId)) {
      return res.status(400).json({ success: false, message: 'Invalid kit version ID' });
    }

    const kitVersion = await KitVersionService.getById(versionId);

    if (!kitVersion) {
      return res.status(404).json({ success: false, message: 'Kit version not found' });
    }

    const { questions, total, page, pageSize, filters } = await KitVersionService.getQuestions(
      versionId,
      req.query as Record<string, any>
    );

    const data = KitQuestionResource.collection(questions);

    return res.json({
      ...Resource.paginate(
        data,
        total,
        pageSize,
        (page - 1) * pageSize,
        'Questions retrieved successfully'
      ),
      kit_version: KitVersionResource.make(kitVersion),
      filters,
    });
  } catch (err: any) {
    if (err instanceof ServiceError) {
      return res.status(err.statusCode).json({ success: false, message: err.message });
    }
    return next(err);
  }
}

/**
 * POST /euonqol-api/kit-versions
 * Create a new kit version and import questions from Excel (admin only)
 */
export async function createKitVersion(req: Request, res: Response, next: NextFunction) {
  try {
    const input = req.body as CreateKitVersionInput;

    const {
      kitVersion,
      questionCount,
      translationCount,
      languageCount,
      answerProfileCount,
      moduleCount,
    } = await KitVersionService.create(input, req.user?.id ?? null);

    return res.status(201).json(
      Resource.respond(
        {
          id: kitVersion.id,
          name: kitVersion.name,
          is_active: kitVersion.is_active,
          question_count: questionCount,
          translation_count: translationCount,
          language_count: languageCount,
          answer_profile_count: answerProfileCount,
          module_count: moduleCount,
        },
        `Kit version created with ${questionCount} questions, ${languageCount} languages and ${answerProfileCount} answer profiles imported${moduleCount > 0 ? `, ${moduleCount} modules auto-created` : ''}`
      )
    );
  } catch (err: any) {
    if (err instanceof ServiceError) {
      if (err.field) {
        return res.status(err.statusCode).json({
          success: false,
          message: err.message,
          errors: { [err.field]: [err.message] },
        });
      }
      return res.status(err.statusCode).json({ success: false, message: err.message });
    }
    return next(err);
  }
}

/**
 * PUT /euonqol-api/kit-versions/:id
 * Update an existing kit version (admin only)
 */
export async function updateKitVersion(req: Request, res: Response, next: NextFunction) {
  try {
    const versionId = parseInt(req.params.id as string, 10);

    if (isNaN(versionId)) {
      return res.status(400).json({ success: false, message: 'Invalid kit version ID' });
    }

    const input = req.body as UpdateKitVersionInput;
    const updated = await KitVersionService.update(versionId, input);

    const options = { policy: { authUser: req.user ?? null } };
    return res.json(
      Resource.respond(
        KitVersionWriteResource.make(updated, options),
        'Kit version updated successfully'
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
 * DELETE /euonqol-api/kit-versions/:id
 * Soft-delete a kit version (admin only) by setting is_active to false
 */
export async function deleteKitVersion(req: Request, res: Response, next: NextFunction) {
  try {
    const versionId = parseInt(req.params.id as string, 10);

    if (isNaN(versionId)) {
      return res.status(400).json({ success: false, message: 'Invalid kit version ID' });
    }

    const result = await KitVersionService.delete(versionId);

    const options = { policy: { authUser: req.user ?? null } };
    return res.json(
      Resource.respond(
        KitVersionDeleteResource.make(result, options),
        'Kit version disabled successfully'
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
 * GET /euonqol-api/kit-versions/:id/languages
 * Returns distinct languages that have translations for questions in this kit version.
 * Used to populate the language selector in the module creation form.
 */
export async function getKitVersionLanguages(req: Request, res: Response, next: NextFunction) {
  try {
    const versionId = parseInt(req.params.id as string, 10);
    if (isNaN(versionId)) {
      return res.status(400).json({ success: false, message: 'Invalid kit version ID' });
    }

    const version = await prisma.kit_versions.findUnique({ where: { id: versionId } });
    if (!version) {
      return res.status(404).json({ success: false, message: 'Kit version not found' });
    }

    // Collect distinct language IDs from all translation tables for this kit version
    const [staticLangs, catLangs, socioDemoLangs, feedbackLangs] = await Promise.all([
      prisma.static_questions.findMany({
        where: { question_rel: { kit_version_id: versionId } },
        select: { language_id: true },
        distinct: ['language_id'],
      }),
      prisma.cat_questions.findMany({
        where: { question_rel: { kit_version_id: versionId } },
        select: { language_id: true },
        distinct: ['language_id'],
      }),
      prisma.socio_demo_questions.findMany({
        where: { question_rel: { kit_version_id: versionId } },
        select: { language_id: true },
        distinct: ['language_id'],
      }),
      prisma.feedback_question_translations.findMany({
        where: { question_rel: { kit_version_id: versionId } },
        select: { language_id: true },
        distinct: ['language_id'],
      }),
    ]);

    const langIds = [
      ...new Set([
        ...staticLangs.map((l) => l.language_id),
        ...catLangs.map((l) => l.language_id),
        ...socioDemoLangs.map((l) => l.language_id),
        ...feedbackLangs.map((l) => l.language_id),
      ]),
    ];

    if (langIds.length === 0) {
      return res.json({ success: true, data: [] });
    }

    const languages = await prisma.eu_countries.findMany({
      where: { id: { in: langIds } },
      select: { id: true, language: true },
      orderBy: { id: 'asc' },
    });

    return res.json({ success: true, data: languages });
  } catch (err: any) {
    return next(err);
  }
}
