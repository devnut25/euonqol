import { prisma } from '../config/database.js';
import { QueryBuilder } from '../helpers/QueryBuilder.js';
import { ServiceError } from '../helpers/ServiceError.js';
import { CttNormModelConfig } from '../models/CttNorm.js';

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
  /**
   * Distinct surveys using each version: the norms are picked on the questionnaire, so
   * surveys are reached through `surveys_questionnaires`; the direct survey FK is kept
   * for API callers that still set it.
   */
  private static async getSurveyCounts(ids: number[]): Promise<Map<number, number>> {
    if (ids.length === 0) return new Map();

    const rows = await prisma.$queryRaw<{ norm_id: number; survey_count: bigint }[]>`
      SELECT norm_id, COUNT(DISTINCT survey_id) AS survey_count
      FROM (
        SELECT ctt_norms_version_id AS norm_id, id AS survey_id
        FROM euonqol.surveys
        WHERE ctt_norms_version_id = ANY(${ids}::int[])
        UNION
        SELECT q.ctt_norms_version_id, sq.survey_id
        FROM euonqol.questionnaires q
        JOIN euonqol.surveys_questionnaires sq ON sq.questionnaire_id = q.id
        WHERE q.ctt_norms_version_id = ANY(${ids}::int[])
      ) u
      GROUP BY norm_id
    `;

    return new Map(rows.map((r) => [r.norm_id, Number(r.survey_count)]));
  }

  private static async withSurveyCount<T extends { id: number }>(versions: T[]) {
    const counts = await CttNormService.getSurveyCounts(versions.map((v) => v.id));
    return versions.map((v) => ({ ...v, survey_count: counts.get(v.id) ?? 0 }));
  }

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

    return {
      versions: await CttNormService.withSurveyCount(versions),
      total,
      take: effectiveTake ?? total,
      skip,
    };
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

    return {
      versions: await CttNormService.withSurveyCount(versions),
      total,
      take: effectiveTake ?? total,
      skip,
    };
  }

  static async getById(id: number) {
    const version = await prisma.ctt_norms_versions.findUnique({
      where: { id },
      include: { _count: COUNT_SELECT },
    });

    if (!version) throw new ServiceError('CTT norms version not found', 404);

    const [withCount] = await CttNormService.withSurveyCount([version]);
    return withCount;
  }

  static async create(data: CreateCttNormInput, userId?: string | null) {
    const { name, description, norms, is_active = true } = data;

    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      throw new ServiceError('name is required', 400);
    }
    if (!norms) throw new ServiceError('norms is required', 400);

    CttNormService.validateNorms(norms);

    const created = await prisma.ctt_norms_versions.create({
      data: {
        name: name.trim(),
        description: description?.trim() || null,
        norms,
        is_active: Boolean(is_active),
        created_by: userId ?? null,
      },
      include: { _count: COUNT_SELECT },
    });

    return { ...created, survey_count: 0 };
  }

  static async update(id: number, data: UpdateCttNormInput) {
    const version = await prisma.ctt_norms_versions.findUnique({ where: { id } });

    if (!version) throw new ServiceError('CTT norms version not found', 404);

    const { name, description, norms, is_active } = data;

    // The normative values are immutable once a survey uses the version; name,
    // description and status stay editable (the edit form always resends `norms`).
    const normsChanged =
      norms !== undefined && JSON.stringify(norms) !== JSON.stringify(version.norms);
    if (normsChanged) {
      const surveyCount = (await CttNormService.getSurveyCounts([id])).get(id) ?? 0;
      if (surveyCount > 0) {
        throw new ServiceError(
          'Cannot modify the norms of a version that is already used by one or more surveys',
          403
        );
      }
    }

    if (norms !== undefined) CttNormService.validateNorms(norms);

    const updated = await prisma.ctt_norms_versions.update({
      where: { id },
      data: {
        ...(name !== undefined && { name: String(name).trim() }),
        ...(description !== undefined && { description: description?.trim() || null }),
        ...(norms !== undefined && { norms: norms as any }),
        ...(is_active !== undefined && { is_active: Boolean(is_active) }),
      },
      include: { _count: COUNT_SELECT },
    });

    const [withCount] = await CttNormService.withSurveyCount([updated]);
    return withCount;
  }

  static async delete(id: number) {
    const version = await prisma.ctt_norms_versions.findUnique({
      where: { id },
      include: { _count: COUNT_SELECT },
    });

    if (!version) throw new ServiceError('CTT norms version not found', 404);

    const surveyCount = (await CttNormService.getSurveyCounts([id])).get(id) ?? 0;
    if (surveyCount > 0 || version._count.questionnaires > 0) {
      throw new ServiceError(
        'Cannot delete a norms version that is used by one or more surveys or questionnaires',
        403
      );
    }

    return prisma.ctt_norms_versions.delete({ where: { id } });
  }
}
