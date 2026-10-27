import { prisma } from '../config/database.js';
import { NextFunction, Request, Response } from 'express';

/**
 * GET /euonqol-api/answer-profiles
 * Lista answer profiles con paginazione e ricerca
 */
export async function getAnswerProfiles(req: Request, res: Response, next: NextFunction) {
  try {
    const {
      search = '',
      page = '1',
      pageSize = '50',
    } = req.query;

    const pageNum = parseInt(page as string, 10);
    const pageSizeNum = Math.min(parseInt(pageSize as string, 10), 200); // max 200
    const skip = (pageNum - 1) * pageSizeNum;

    // Build search filter
    const whereClause = search
      ? {
          OR: [
            { code: { contains: search as string, mode: 'insensitive' as const } },
            { description: { contains: search as string, mode: 'insensitive' as const } },
          ],
        }
      : {};

    // Count total for pagination
    const total = await prisma.answer_profiles.count({ where: whereClause });

    // Get paginated results
    const profiles = await prisma.answer_profiles.findMany({
      where: whereClause,
      select: {
        id: true,
        code: true,
        description: true,
        created_at: true,
        updated_at: true,
        _count: {
          select: {
            answer_options: true,
          },
        },
      },
      orderBy: { code: 'asc' },
      skip,
      take: pageSizeNum,
    });

    res.json({
      data: profiles.map(p => ({
        id: p.id,
        code: p.code,
        description: p.description,
        optionsCount: p._count.answer_options,
        createdAt: p.created_at,
        updatedAt: p.updated_at,
      })),
      pagination: {
        page: pageNum,
        pageSize: pageSizeNum,
        total,
        totalPages: Math.ceil(total / pageSizeNum),
      },
    });
  } catch (error) {
    return next(error);
  }
}

/**
 * GET /euonqol-api/answer-profiles/:code/options
 * Opzioni tradotte per un answer profile
 */
export async function getAnswerProfileOptions(req: Request, res: Response, next: NextFunction) {
  try {
    const { code } = req.params;
    const { languageId } = req.query;

    // Ensure code is a string
    const profileCode = Array.isArray(code) ? code[0] : code;

    if (!languageId) {
      return res.status(400).json({ error: 'languageId query parameter is required' });
    }

    const langId = parseInt(languageId as string, 10);
    if (isNaN(langId)) {
      return res.status(400).json({ error: 'languageId must be a valid integer' });
    }

    // Find answer profile
    const profile = await prisma.answer_profiles.findUnique({
      where: { code: profileCode },
      select: {
        id: true,
        code: true,
        description: true,
      },
    });

    if (!profile) {
      return res.status(404).json({ error: `Answer profile '${profileCode}' not found` });
    }

    // Get options with translations
    const options = await prisma.answer_options.findMany({
      where: { answer_profile_id: profile.id },
      select: {
        id: true,
        value: true,
        option_code: true,
        display_order: true,
        is_selectable: true,
        answer_option_i18n: {
          where: { language_id: langId },
          select: {
            label: true,
          },
        },
      },
      orderBy: { display_order: 'asc' },
    });

    // Try English (id=14) fallback if no translation found
    const englishId = 14;
    const needsFallback = options.some(opt => opt.answer_option_i18n.length === 0);

    let fallbackTranslations: Map<number, string> = new Map();
    if (needsFallback && langId !== englishId) {
      const englishOptions = await prisma.answer_options.findMany({
        where: { answer_profile_id: profile.id },
        select: {
          id: true,
          answer_option_i18n: {
            where: { language_id: englishId },
            select: {
              label: true,
            },
          },
        },
      });

      englishOptions.forEach(opt => {
        if (opt.answer_option_i18n.length > 0) {
          fallbackTranslations.set(opt.id, opt.answer_option_i18n[0].label);
        }
      });
    }

    res.json({
      profile: {
        id: profile.id,
        code: profile.code,
        description: profile.description,
      },
      options: options.map(opt => ({
        id: opt.id,
        value: opt.value,
        optionCode: opt.option_code,
        displayOrder: opt.display_order,
        isSelectable: opt.is_selectable,
        label: opt.answer_option_i18n.length > 0
          ? opt.answer_option_i18n[0].label
          : (fallbackTranslations.get(opt.id) || `[${opt.value}]`),
        isFallback: opt.answer_option_i18n.length === 0 && fallbackTranslations.has(opt.id),
      })),
    });
  } catch (error) {
    return next(error);
  }
}
