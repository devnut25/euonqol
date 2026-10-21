import XLSX from 'xlsx';
import { PrismaClient } from '../generated/app/index.js';
import { ServiceError } from '../helpers/ServiceError.js';
import { CatItemBankImportService } from './CatItemBankImportService.js';

const prisma = new PrismaClient();

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
    if (bankIds.length > 0) {
      const rows = await prisma.$queryRaw<{ cat_item_bank_id: number; language_count: bigint }[]>`
        SELECT cat_item_bank_id, language_count
        FROM euonqol.cat_item_bank_language_counts
        WHERE cat_item_bank_id = ANY(${bankIds}::int[])
      `;
      langCountMap = new Map(rows.map((r) => [r.cat_item_bank_id, Number(r.language_count)]));
    }

    const itemsWithLang = items.map((item) => ({
      ...item,
      language_count: langCountMap.get(item.id) ?? 0,
    }));

    return { items: itemsWithLang, total, take: pageSize, skip };
  }

  static async getById(id: number) {
    const bank = await prisma.cat_item_banks.findUnique({
      where: { id },
      include: {
        cat_item_bank_scales: {
          include: {
            cat_setting: { select: { id: true, name: true, setting_key: true } },
            patient_group: { select: { id: true, name: true } },
          },
          orderBy: [{ scale_code: 'asc' }, { patient_group_id: 'asc' }],
        },
        _count: { select: { questions: true, modules: true } },
      },
    });
    if (!bank) return null;

    const { questions } = await CatItemBankService.getQuestions(id, {
      languageId: '29',
      pageSize: '500',
    });

    const [langRow] = await prisma.$queryRaw<{ languages: any }[]>`
      SELECT languages FROM euonqol.cat_item_bank_language_counts WHERE cat_item_bank_id = ${id}
    `;

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
   * Paginated, read-only browse of a bank's CAT items — mirrors the shape used by
   * ModuleService.getModuleQuestions for consistency in the admin UI.
   */
  static async getQuestions(catItemBankId: number, query: Record<string, any>) {
    const bank = await prisma.cat_item_banks.findUnique({ where: { id: catItemBankId } });
    if (!bank) throw new ServiceError('CAT item bank not found', 404);

    const languageId = parseInt(query.languageId ?? '14', 10);
    const page = Math.max(parseInt(query.page ?? '1', 10) || 1, 1);
    const pageSize = Math.min(parseInt(query.pageSize ?? '100', 10) || 100, 500);
    const skip = (page - 1) * pageSize;

    const [total, questions] = await Promise.all([
      prisma.questions.count({ where: { cat_item_bank_id: catItemBankId } }),
      prisma.questions.findMany({
        where: { cat_item_bank_id: catItemBankId },
        include: {
          cat_questions: { where: { language_id: languageId }, select: { question: true } },
        },
        orderBy: { order_position: 'asc' },
        skip,
        take: pageSize,
      }),
    ]);

    return {
      questions: questions.map((q) => ({
        id: q.id,
        questionCode: q.question_code,
        scale: q.scale,
        questionText: q.cat_questions[0]?.question ?? '',
      })),
      total,
      page,
      pageSize,
    };
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
