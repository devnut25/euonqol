import { PrismaClient } from '../generated/app/index.js';
import { QueryBuilder } from '../helpers/QueryBuilder.js';
import { ServiceError } from '../helpers/ServiceError.js';
import { CttNormModelConfig } from '../models/CttNorm.js';

const prisma = new PrismaClient();

export interface CreateCttNormInput {
  name: string;
  description?: string;
  norms: unknown;
  is_active?: boolean;
}

export interface UpdateCttNormInput {
  name?: string;
  description?: string;
  norms?: unknown;
  is_active?: boolean;
}

const COUNT_SELECT = { select: { surveys: true, questionnaires: true } } as const;

export class CttNormService {
  private static validateNorms(norms: unknown): void {
    if (!Array.isArray(norms)) {
      throw new ServiceError('norms must be a JSON array of scale entries', 400);
    }
    if (norms.length === 0) {
      throw new ServiceError('At least one scale is required', 400);
    }

    const seenCodes = new Set<string>();

    norms.forEach((entry, index) => {
      if (!entry || typeof entry !== 'object') {
        throw new ServiceError(`Entry ${index}: must be an object`, 400);
      }
      const { name, scaleCode, average, sd } = entry as Record<string, unknown>;

      if (typeof name !== 'string' || name.trim().length === 0) {
        throw new ServiceError(`Entry ${index}: name is required`, 400);
      }
      if (typeof scaleCode !== 'string' || scaleCode.trim().length === 0) {
        throw new ServiceError(`Entry ${index}: scaleCode is required`, 400);
      }
      if (seenCodes.has(scaleCode)) {
        throw new ServiceError(`Duplicate scaleCode: "${scaleCode}"`, 400);
      }
      seenCodes.add(scaleCode);

      if (typeof average !== 'number' || isNaN(average)) {
        throw new ServiceError(`Scale "${scaleCode}": average must be a number`, 400);
      }
      if (typeof sd !== 'number' || isNaN(sd) || sd <= 0) {
        throw new ServiceError(`Scale "${scaleCode}": sd must be a positive number`, 400);
      }
    });
  }

  static async getList(query: Record<string, any>) {
    const { where, orderBy, take, skip } = QueryBuilder.for(CttNormModelConfig, query).build();

    // Guard against take <= 0 (e.g. per_page=-1, the "no limit" convention used by
    // api-select fields) — Prisma treats a negative take as "N from the end of the
    // reversed order", silently truncating to the wrong row instead of returning all.
    const effectiveTake = take && take > 0 ? take : undefined;

    const [total, versions] = await Promise.all([
      prisma.ctt_norms_versions.count({ where }),
      prisma.ctt_norms_versions.findMany({
        where,
        include: { _count: COUNT_SELECT },
        orderBy,
        take: effectiveTake,
        skip,
      }),
    ]);

    return { versions, total, take: effectiveTake ?? total, skip };
  }

  static async getAll(query: Record<string, any>) {
    const { where, orderBy, take, skip } = QueryBuilder.for(CttNormModelConfig, query)
      .withBaseFilters({ is_active: true })
      .build();

    const effectiveTake = take && take > 0 ? take : undefined;

    const [total, versions] = await Promise.all([
      prisma.ctt_norms_versions.count({ where }),
      prisma.ctt_norms_versions.findMany({
        where,
        include: { _count: COUNT_SELECT },
        orderBy,
        take: effectiveTake,
        skip,
      }),
    ]);

    return { versions, total, take: effectiveTake ?? total, skip };
  }

  static async getById(id: number) {
    const version = await prisma.ctt_norms_versions.findUnique({
      where: { id },
      include: { _count: COUNT_SELECT },
    });

    if (!version) throw new ServiceError('CTT norms version not found', 404);

    return version;
  }

  static async create(data: CreateCttNormInput, userId?: string | null) {
    const { name, description, norms, is_active = true } = data;

    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      throw new ServiceError('name is required', 400);
    }
    if (!norms) throw new ServiceError('norms is required', 400);

    CttNormService.validateNorms(norms);

    return prisma.ctt_norms_versions.create({
      data: {
        name: name.trim(),
        description: description?.trim() || null,
        norms,
        is_active: Boolean(is_active),
        created_by: userId ?? null,
      },
      include: { _count: COUNT_SELECT },
    });
  }

  static async update(id: number, data: UpdateCttNormInput) {
    const version = await prisma.ctt_norms_versions.findUnique({
      where: { id },
      include: { _count: { select: { surveys: true } } },
    });

    if (!version) throw new ServiceError('CTT norms version not found', 404);

    if (version._count.surveys > 0) {
      throw new ServiceError(
        'Cannot modify a norms version that is already used by one or more surveys',
        403
      );
    }

    const { name, description, norms, is_active } = data;

    if (norms !== undefined) CttNormService.validateNorms(norms);

    return prisma.ctt_norms_versions.update({
      where: { id },
      data: {
        ...(name !== undefined && { name: String(name).trim() }),
        ...(description !== undefined && { description: description?.trim() || null }),
        ...(norms !== undefined && { norms: norms as any }),
        ...(is_active !== undefined && { is_active: Boolean(is_active) }),
      },
      include: { _count: COUNT_SELECT },
    });
  }

  static async delete(id: number) {
    const version = await prisma.ctt_norms_versions.findUnique({
      where: { id },
      include: { _count: COUNT_SELECT },
    });

    if (!version) throw new ServiceError('CTT norms version not found', 404);

    if (version._count.surveys > 0 || version._count.questionnaires > 0) {
      throw new ServiceError(
        'Cannot delete a norms version that is used by one or more surveys or questionnaires',
        403
      );
    }

    return prisma.ctt_norms_versions.delete({ where: { id } });
  }
}
