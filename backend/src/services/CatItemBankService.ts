import XLSX from 'xlsx';
import { prisma } from '../config/database.js';
import { QueryBuilder } from '../helpers/QueryBuilder.js';
import { ServiceError } from '../helpers/ServiceError.js';
import { CatItemBankQuestionModelConfig } from '../models/CatItemBankQuestion.js';
import { CatItemBankImportService } from './CatItemBankImportService.js';

export class CatItemBankService {
  static async getList(query: Record<string, any>) {
    const page = parseInt(query.page ?? '1', 10);
    const pageSize = Math.min(parseInt(query.pageSize ?? '100', 10), 200);
    const skip = (page - 1) * pageSize;

    const whereClause: any = {};
    if (query.search && typeof query.search === 'string') {
      whereClause.OR = [
        { name: { contains: query.search, mode: 'insensitive' as const } },
        { description: { contains: query.search, mode: 'insensitive' as const } },
      ];
    }
    if (query.isActive === 'true') {
      whereClause.is_active = true;
    } else if (query.isActive === 'false') {
      whereClause.is_active = false;
    }

    const [total, items] = await Promise.all([
      prisma.cat_item_banks.count({ where: whereClause }),
      prisma.cat_item_banks.findMany({
        where: whereClause,
        select: {
          id: true,
          name: true,
          description: true,
          is_active: true,
          created_at: true,
          updated_at: true,
          _count: { select: { questions: true, modules: true } },
        },
        orderBy: { id: 'asc' },
        skip,
        take: pageSize,
      }),
    ]);

    const bankIds = items.map((item) => item.id);
    let langCountMap = new Map<number, number>();
    let usageCountMap = new Map<number, { survey_count: number; questionnaire_count: number }>();
    if (bankIds.length > 0) {
      const [langRows, usageRows] = await Promise.all([
        prisma.$queryRaw<{ cat_item_bank_id: number; language_count: bigint }[]>`
          SELECT cat_item_bank_id, language_count
          FROM euonqol.cat_item_bank_language_counts
          WHERE cat_item_bank_id = ANY(${bankIds}::int[])
        `,
        // Distinct questionnaires / surveys reached through the bank's dynamic modules
        prisma.$queryRaw<
          { cat_item_bank_id: number; questionnaire_count: bigint; survey_count: bigint }[]
        >`
          SELECT m.cat_item_bank_id,
                 COUNT(DISTINCT qm.questionnaire_id) AS questionnaire_count,
                 COUNT(DISTINCT sq.survey_id) AS survey_count
          FROM euonqol.modules m
          JOIN euonqol.questionnaires_modules qm ON qm.module_id = m.id
          LEFT JOIN euonqol.surveys_questionnaires sq ON sq.questionnaire_id = qm.questionnaire_id
          WHERE m.cat_item_bank_id = ANY(${bankIds}::int[])
          GROUP BY m.cat_item_bank_id
        `,
      ]);
      langCountMap = new Map(langRows.map((r) => [r.cat_item_bank_id, Number(r.language_count)]));
      usageCountMap = new Map(
        usageRows.map((r) => [
          r.cat_item_bank_id,
          {
            survey_count: Number(r.survey_count),
            questionnaire_count: Number(r.questionnaire_count),
          },
        ])
      );
    }

    const itemsWithLang = items.map((item) => ({
      ...item,
      language_count: langCountMap.get(item.id) ?? 0,
      survey_count: usageCountMap.get(item.id)?.survey_count ?? 0,
      questionnaire_count: usageCountMap.get(item.id)?.questionnaire_count ?? 0,
    }));

    return { items: itemsWithLang, total, take: pageSize, skip };
  }

  static async getById(id: number) {
    const bank = await prisma.cat_item_banks.findUnique({
      where: { id },
      include: {
        modules: {
          select: { id: true, name: true, type: true, is_active: true },
          orderBy: { name: 'asc' },
        },
        _count: { select: { questions: true, modules: true } },
      },
    });
    if (!bank) return null;

    const [{ questions }, [langRow]] = await Promise.all([
      CatItemBankService.getQuestions(id, { languageId: '29', per_page: '500' }),
      prisma.$queryRaw<{ languages: any }[]>`
        SELECT languages FROM euonqol.cat_item_bank_language_counts WHERE cat_item_bank_id = ${id}
      `,
    ]);

    return { ...bank, questions, languages: langRow?.languages ?? [] };
  }

  /**
   * Creates a new CAT item bank and imports its items from an Excel file (base64)
   * in one step — mirrors KitVersionService.create's create-then-import-then-rollback
   * pattern so a bank never ends up saved without the content it was created for.
   */
  static async create(
    data: { name: string; description?: string | null; fileContent: string; fileName: string },
    userId?: string | null
  ) {
    const existing = await CatItemBankService.findByName(data.name);
    if (existing) {
      throw new ServiceError(`A CAT item bank named "${data.name}" already exists`, 409, 'name');
    }

    let buffer: Buffer;
    try {
      buffer = Buffer.from(data.fileContent, 'base64');
    } catch {
      throw new ServiceError('Invalid fileContent: could not decode base64');
    }

    let workbook: XLSX.WorkBook;
    try {
      workbook = XLSX.read(buffer, { type: 'buffer' });
    } catch {
      throw new ServiceError('Invalid Excel file: could not parse workbook');
    }

    const bank = await prisma.cat_item_banks.create({
      data: {
        name: data.name,
        description: data.description ?? null,
        created_by: userId ?? null,
      },
    });

    try {
      const importResult = await CatItemBankImportService.importItems(
        workbook,
        bank.id,
        userId ?? null
      );
      return { bank, ...importResult };
    } catch (err) {
      // Best-effort cleanup: remove the orphaned bank record so retries work.
      await prisma.cat_item_banks.delete({ where: { id: bank.id } }).catch(() => {});
      throw err;
    }
  }

  static async update(
    id: number,
    data: { name?: string; description?: string | null; is_active?: boolean }
  ) {
    const existing = await prisma.cat_item_banks.findUnique({ where: { id } });
    if (!existing) return null;

    return prisma.cat_item_banks.update({
      where: { id },
      data: {
        name: data.name ?? existing.name,
        description: data.description !== undefined ? data.description : existing.description,
        is_active: data.is_active ?? existing.is_active,
      },
      include: { _count: { select: { questions: true, modules: true } } },
    });
  }

  static async findByName(name: string, excludeId?: number) {
    return prisma.cat_item_banks.findFirst({
      where: { name, ...(excludeId !== undefined ? { NOT: { id: excludeId } } : {}) },
    });
  }

  static async delete(id: number) {
    const existing = await prisma.cat_item_banks.findUnique({
      where: { id },
      include: { _count: { select: { questions: true, modules: true } } },
    });
    if (!existing) return null;

    if (existing._count.modules > 0) {
      throw new ServiceError(
        `Cannot delete CAT item bank: it is used by ${existing._count.modules} module(s)`,
        400
      );
    }

    return prisma.cat_item_banks.delete({ where: { id } });
  }

  /**
   * Paginated, read-only browse of a bank's CAT items (table params: page, per_page,
   * search, sort). `search` matches the code, the scale or the translated text.
   */
  static async getQuestions(catItemBankId: number, query: Record<string, any>) {
    const bank = await prisma.cat_item_banks.findUnique({ where: { id: catItemBankId } });
    if (!bank) throw new ServiceError('CAT item bank not found', 404);

    const languageId = parseInt(query.languageId ?? '29', 10);
    const search = typeof query.search === 'string' ? query.search.trim() : '';

    const { where, orderBy, take, skip } = QueryBuilder.for(CatItemBankQuestionModelConfig, query)
      .withBaseFilters([
        { cat_item_bank_id: catItemBankId },
        ...(search
          ? [
              {
                OR: [
                  { question_code: { contains: search, mode: 'insensitive' } },
                  { scale: { contains: search, mode: 'insensitive' } },
                  {
                    cat_questions: {
                      some: {
                        language_id: languageId,
                        question: { contains: search, mode: 'insensitive' },
                      },
                    },
                  },
                ],
              },
            ]
          : []),
      ])
      .build();

    const effectiveTake = take > 0 ? take : undefined;

    const [total, questions] = await Promise.all([
      prisma.questions.count({ where }),
      prisma.questions.findMany({
        where,
        include: {
          cat_questions: { where: { language_id: languageId }, select: { question: true } },
        },
        orderBy,
        skip,
        ...(effectiveTake !== undefined ? { take: effectiveTake } : {}),
      }),
    ]);

    return { questions, total, take: effectiveTake ?? total, skip };
  }

  /**
   * Lists a bank's (ScaleCode, patient group) -> cat_setting mappings (imported from
   * the CatSettings sheet, editable afterwards without a full re-upload). A scale can
   * map to a different cat_setting per patient group.
   */
  static async getScales(catItemBankId: number) {
    const bank = await prisma.cat_item_banks.findUnique({ where: { id: catItemBankId } });
    if (!bank) throw new ServiceError('CAT item bank not found', 404);

    return prisma.cat_item_bank_scales.findMany({
      where: { cat_item_bank_id: catItemBankId },
      include: {
        cat_setting: { select: { id: true, name: true, setting_key: true } },
        patient_group: { select: { id: true, name: true } },
      },
      orderBy: [{ scale_code: 'asc' }, { patient_group_id: 'asc' }],
    });
  }

  static async updateScale(
    catItemBankId: number,
    scaleId: number,
    data: { cat_setting_id?: number; display_name?: string | null }
  ) {
    const existing = await prisma.cat_item_bank_scales.findFirst({
      where: { id: scaleId, cat_item_bank_id: catItemBankId },
    });
    if (!existing) throw new ServiceError('Scale mapping not found', 404);

    if (data.cat_setting_id) {
      const catSetting = await prisma.cat_settings.findUnique({
        where: { id: data.cat_setting_id },
      });
      if (!catSetting) throw new ServiceError('CAT setting not found', 404);
    }

    return prisma.cat_item_bank_scales.update({
      where: { id: scaleId },
      data: {
        cat_setting_id: data.cat_setting_id ?? existing.cat_setting_id,
        display_name: data.display_name !== undefined ? data.display_name : existing.display_name,
      },
      include: {
        cat_setting: { select: { id: true, name: true, setting_key: true } },
        patient_group: { select: { id: true, name: true } },
      },
    });
  }
}
