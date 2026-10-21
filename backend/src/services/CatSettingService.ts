import { PrismaClient } from '../generated/app/index.js';
import { ServiceError } from '../helpers/ServiceError.js';
import * as catService from './cat/catService.js';

const prisma = new PrismaClient();

export class CatSettingService {
  static async getList(query: Record<string, any>) {
    const page = parseInt(query.page ?? '1', 10);
    const pageSize = Math.min(parseInt(query.pageSize ?? '100', 10), 200);
    const skip = (page - 1) * pageSize;

    const whereClause: any = {};
    if (query.search && typeof query.search === 'string') {
      whereClause.OR = [
        { name: { contains: query.search, mode: 'insensitive' as const } },
        { setting_key: { contains: query.search, mode: 'insensitive' as const } },
      ];
    }

    const [total, items] = await Promise.all([
      prisma.cat_settings.count({ where: whereClause }),
      prisma.cat_settings.findMany({
        where: whereClause,
        select: {
          id: true,
          name: true,
          description: true,
          setting_key: true,
          created_at: true,
          updated_at: true,
          _count: { select: { modules: true, cat_item_bank_scales: true } },
        },
        orderBy: { id: 'asc' },
        skip,
        take: pageSize,
      }),
    ]);

    return { items, total, take: pageSize, skip };
  }

  static async getById(id: number) {
    return prisma.cat_settings.findUnique({
      where: { id },
      include: {
        modules: {
          select: { id: true, name: true, type: true, is_active: true },
        },
        _count: { select: { modules: true, cat_item_bank_scales: true } },
      },
    });
  }

  static async create(data: {
    name: string;
    description?: string | null;
    setting_key: string;
    api_configuration?: any;
  }) {
    return prisma.cat_settings.create({
      data: {
        name: data.name,
        description: data.description ?? null,
        setting_key: data.setting_key,
        api_configuration: data.api_configuration ?? undefined,
      },
      include: {
        _count: { select: { modules: true } },
      },
    });
  }

  static async update(
    id: number,
    data: {
      name?: string;
      description?: string | null;
      setting_key?: string;
      api_configuration?: any;
    }
  ) {
    const existing = await prisma.cat_settings.findUnique({ where: { id } });
    if (!existing) return null;

    return prisma.cat_settings.update({
      where: { id },
      data: {
        name: data.name ?? existing.name,
        description: data.description !== undefined ? data.description : existing.description,
        setting_key: data.setting_key ?? existing.setting_key,
        api_configuration:
          data.api_configuration !== undefined
            ? data.api_configuration
            : (existing.api_configuration as any),
      },
      include: {
        _count: { select: { modules: true } },
      },
    });
  }

  static async findByKey(setting_key: string, excludeId?: number) {
    return prisma.cat_settings.findFirst({
      where: {
        setting_key,
        ...(excludeId !== undefined ? { NOT: { id: excludeId } } : {}),
      },
    });
  }

  /**
   * Given a list of setting_key values (typically extracted from a dynamic upload's
   * "CatSettings" sheet), returns the subset not yet present in the database — used by
   * the Module Library upload form to preview what importDynamic will auto-create.
   */
  static async findMissingKeys(settingKeys: string[]): Promise<string[]> {
    const uniqueKeys = [...new Set(settingKeys.filter(Boolean))];
    if (uniqueKeys.length === 0) return [];

    const existing = await prisma.cat_settings.findMany({
      where: { setting_key: { in: uniqueKeys } },
      select: { setting_key: true },
    });
    const existingKeys = new Set(existing.map((s) => s.setting_key));

    return uniqueKeys.filter((key) => !existingKeys.has(key));
  }

  /**
   * Bulk-creates CAT settings, skipping any whose setting_key already exists.
   * Also fetches each new setting's api_configuration from the external CAT API —
   * same enrichment as the manual "Fetch from CAT API" admin action. Unlike the
   * old best-effort behavior, a setting whose api_configuration can't be fetched
   * is now NOT created at all (reported under `failed` instead) — a row with no
   * api_configuration is silently broken for the rest of the CAT flow (progress,
   * min-items, stopping criteria all read it), so it must never be persisted this
   * way. The admin can retry once the setting_key/CAT service is fixed.
   * Returns which were created vs skipped vs failed, for the caller to surface.
   */
  static async bulkCreate(settings: { name: string; setting_key: string; description?: string | null }[]): Promise<{
    created: { id: number; name: string; setting_key: string | null }[];
    skipped: string[];
    failed: { setting_key: string; error: string }[];
  }> {
    const created: { id: number; name: string; setting_key: string | null }[] = [];
    const skipped: string[] = [];
    const failed: { setting_key: string; error: string }[] = [];

    for (const s of settings) {
      if (!s.setting_key) continue;
      const existing = await prisma.cat_settings.findFirst({
        where: { setting_key: s.setting_key },
      });
      if (existing) {
        skipped.push(s.setting_key);
        continue;
      }

      let apiConfiguration: any;
      try {
        apiConfiguration = await catService.fetchApiConfiguration(s.setting_key);
      } catch (error: any) {
        console.warn(
          `[CatSettingService] Could not fetch api_configuration for "${s.setting_key}" — skipping creation:`,
          error
        );
        failed.push({
          setting_key: s.setting_key,
          error: error?.message ?? 'Could not reach the CAT API for this setting key',
        });
        continue;
      }

      const row = await prisma.cat_settings.create({
        data: {
          name: s.name || s.setting_key,
          description: s.description ?? null,
          setting_key: s.setting_key,
          api_configuration: apiConfiguration,
        },
      });
      created.push({ id: row.id, name: row.name, setting_key: row.setting_key });
    }

    return { created, skipped, failed };
  }

  static async delete(id: number) {
    const existing = await prisma.cat_settings.findUnique({
      where: { id },
      include: { _count: { select: { cat_item_bank_scales: true } } },
    });
    if (!existing) return null;

    if (existing._count.cat_item_bank_scales > 0) {
      throw new ServiceError(
        `Cannot delete CAT setting: it is used by ${existing._count.cat_item_bank_scales} scale mapping(s) in one or more CAT item banks. Deleting a CAT item bank (once no dynamic module uses it) removes its scale mappings automatically — repoint or remove those first (Settings > CAT Item Bank).`,
        400
      );
    }

    return prisma.cat_settings.delete({ where: { id } });
  }
}
