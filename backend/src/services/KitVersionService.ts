import { KitVersionTypeEnum } from '@/config/enums.js';
import XLSX from 'xlsx';
import { prisma } from '../config/database.js';
import { QueryBuilder } from '../helpers/QueryBuilder.js';
import { ServiceError } from '../helpers/ServiceError.js';
import { KitVersionModelConfig } from '../models/KitVersion.js';
import { CreateKitVersionInput, UpdateKitVersionInput } from '../validators/schemas/kitVersion.js';
import { KitVersionImportService } from './KitVersionImportService.js';

export class KitVersionService {
  /**
   * Returns a paginated list of kit versions with question count.
   * Supports ?search=, ?sort=, ?page=, ?pageSize= (max 200).
   */
  static async getList(query: Record<string, any>) {
    const page = Math.max(parseInt(query.page) || 1, 1);
    const pageSize = Math.min(parseInt(query.pageSize) || 50, 200);
    const skip = (page - 1) * pageSize;

    const builder = QueryBuilder.for(KitVersionModelConfig, query);
    const { where, orderBy } = builder.build();

    const [total, versions] = await Promise.all([
      prisma.kit_versions.count({ where }),
      prisma.kit_versions.findMany({
        where,
        select: {
          id: true,
          name: true,
          is_active: true,
          created_at: true,
          updated_at: true,
          _count: { select: { questions: true, modules: { where: { is_active: true } } } },
        },
        orderBy,
        skip,
        take: pageSize,
      }),
    ]);

    // Batch-fetch distinct language counts for the fetched page
    const kitIds = versions.map((v) => v.id);
    let langCountMap = new Map<number, number>();
    if (kitIds.length > 0) {
      const rows = await prisma.$queryRaw<{ kit_version_id: number; lang_count: bigint }[]>`
        SELECT q.kit_version_id, COUNT(DISTINCT t.language_id)::int AS lang_count
        FROM (
          SELECT question_id, language_id FROM euonqol.static_questions
          UNION
          SELECT question_id, language_id FROM euonqol.cat_questions
          UNION
          SELECT question_id, language_id FROM euonqol.socio_demo_questions
          UNION
          SELECT question_id, language_id FROM euonqol.feedback_question_translations
        ) t
        JOIN euonqol.questions q ON q.id = t.question_id
        WHERE q.kit_version_id = ANY(${kitIds}::int[])
        GROUP BY q.kit_version_id
      `;
      langCountMap = new Map(rows.map((r) => [r.kit_version_id, Number(r.lang_count)]));
    }

    const versionsWithLang = versions.map((v) => ({
      ...v,
      language_count: langCountMap.get(v.id) ?? 0,
    }));

    return { versions: versionsWithLang, total, page, pageSize };
  }

  /**
   * Returns a single kit version with question count broken down by kind.
   * Returns null if not found.
   */
  static async getById(id: number) {
    const version = await prisma.kit_versions.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        is_active: true,
        created_at: true,
        updated_at: true,
        _count: { select: { questions: true } },
      },
    });

    if (!version) return null;

    const [staticCount, catCount, socioDemoCount] = await Promise.all([
      prisma.questions.count({ where: { kit_version_id: id, question_kind: 'static' } }),
      prisma.questions.count({ where: { kit_version_id: id, question_kind: 'cat' } }),
      prisma.questions.count({ where: { kit_version_id: id, question_kind: 'socio-demo' } }),
    ]);

    return {
      ...version,
      question_counts: {
        total: version._count.questions,
        static: staticCount,
        cat: catCount,
        socio_demo: socioDemoCount,
      },
    };
  }

  /**
   * Creates a new kit version and imports questions from an Excel file (base64).
   * Throws ServiceError on validation or conflict.
   */
  static async create(input: CreateKitVersionInput, createdBy: string | null) {
    // 1. Name uniqueness check
    const existing = await prisma.kit_versions.findUnique({ where: { name: input.name } });
    if (existing) {
      throw new ServiceError('A kit version with this name already exists', 409, 'name');
    }

    // 2. Decode base64 → Buffer → Workbook
    let buffer: Buffer;
    try {
      buffer = Buffer.from(input.fileContent, 'base64');
    } catch {
      throw new ServiceError('Invalid fileContent: could not decode base64');
    }

    let workbook: XLSX.WorkBook;
    try {
      workbook = XLSX.read(buffer, { type: 'buffer' });
    } catch {
      throw new ServiceError('Invalid Excel file: could not parse workbook');
    }

    // 3. Create the kit version record
    const kitVersion = await prisma.kit_versions.create({
      data: { name: input.name, is_active: input.is_active, created_by: createdBy },
    });

    // 4. Import questions via dedicated service. If the import fails, roll back the
    //    kit_version record so the user can retry with the same name.
    try {
      if (input.question_kind === KitVersionTypeEnum.STATIC) {
        return await KitVersionImportService.importStatic(
          workbook,
          kitVersion,
          input.fileName,
          createdBy,
          true
        );
      } else if (input.question_kind === KitVersionTypeEnum.CAT) {
        return await KitVersionImportService.importDynamic(
          workbook,
          kitVersion,
          input.fileName,
          createdBy,
          true,
          input.cat_item_bank_id ?? null
        );
      } else if (input.question_kind === KitVersionTypeEnum.FEEDBACK) {
        return await KitVersionImportService.importFeedback(
          workbook,
          kitVersion,
          input.fileName,
          createdBy,
          true
        );
      } else {
        return await KitVersionImportService.importSocioDemo(
          workbook,
          kitVersion,
          input.fileName,
          createdBy,
          true
        );
      }
    } catch (err) {
      // Best-effort cleanup: remove the orphaned kit_version record so retries work
      await prisma.kit_versions.delete({ where: { id: kitVersion.id } }).catch(() => {});
      throw err;
    }
  }

  /**
   * Updates an existing kit version. Throws ServiceError on validation, not found, or conflict.
   */
  static async update(id: number, data: UpdateKitVersionInput) {
    const existing = await prisma.kit_versions.findUnique({ where: { id } });
    if (!existing) {
      throw new ServiceError('Kit version not found', 404);
    }

    return prisma.kit_versions.update({
      where: { id },
      data,
      include: {
        _count: { select: { questions: true, modules: true } },
      },
    });
  }

  /**
   * Soft-deletes a kit version by setting is_active to false.
   * Throws ServiceError if not found.
   */
  static async delete(id: number) {
    const existing = await prisma.kit_versions.findUnique({
      where: { id },
      include: { _count: { select: { questions: true, modules: true } } },
    });
    if (!existing) {
      throw new ServiceError('Kit version not found', 404);
    }

    const updated = await prisma.kit_versions.update({ where: { id }, data: { is_active: false } });

    return {
      ...updated,
      hadQuestions: existing._count.questions,
      hadModules: existing._count.modules,
    };
  }

  /**
   * Returns paginated questions for a kit version with translations.
   * Supports ?patientGroupId=, ?questionKind=, ?languageId=, ?page=, ?pageSize= (max 500).
   */
  static async getQuestions(versionId: number, query: Record<string, any>) {
    const {
      patientGroupId,
      questionKind,
      questionCode,
      languageId = '14',
      page = '1',
      pageSize = '100',
    } = query;

    const langId = parseInt(languageId, 10);
    const pageNum = Math.max(parseInt(page, 10) || 1, 1);
    const pageSizeNum = Math.min(parseInt(pageSize, 10) || 100, 500);
    const skip = (pageNum - 1) * pageSizeNum;

    if (isNaN(langId)) throw new ServiceError('Invalid language ID');

    const where: any = { kit_version_id: versionId };

    if (questionKind) {
      where.question_kind = questionKind;
    }

    if (questionCode) {
      where.question_code = questionCode;
    }

    if (patientGroupId) {
      const groupId = parseInt(patientGroupId, 10);
      if (isNaN(groupId)) throw new ServiceError('Invalid patient group ID');
      where.patient_group_questions = { some: { patient_group_id: groupId } };
    }

    const [total, questions] = await Promise.all([
      prisma.questions.count({ where }),
      prisma.questions.findMany({
        where,
        include: {
          answer_profile: { select: { code: true, description: true } },
          static_questions: {
            where: { language_id: langId },
            select: { head: true, question: true },
          },
          cat_questions: {
            where: { language_id: langId },
            select: { question: true },
          },
          socio_demo_questions: {
            where: { language_id: langId },
            select: { question_text: true },
          },
          feedback_question_translations: {
            where: { language_id: langId },
            select: { question_text: true },
          },
          socio_demo_answers: {
            where: { language_id: langId },
            select: { answer_text: true, answer_type: true, display_order: true },
            orderBy: { display_order: 'asc' },
          },
          patient_group_questions: {
            include: {
              patient_group: { select: { name: true, description: true } },
            },
          },
        },
        orderBy: { order_position: 'asc' },
        skip,
        take: pageSizeNum,
      }),
    ]);

    const taggedQuestions = questions.map((q) => ({ ...q, _lang_id: langId }));

    return {
      questions: taggedQuestions,
      total,
      page: pageNum,
      pageSize: pageSizeNum,
      langId,
      filters: {
        patient_group_id: patientGroupId ? parseInt(patientGroupId, 10) : null,
        question_kind: questionKind || null,
        language_id: langId,
      },
    };
  }
}
