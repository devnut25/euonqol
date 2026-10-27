import { Resource, ResourceOptions } from './baseResource.js';

export class CatSettingResource extends Resource<any> {
  constructor(data: any, options: ResourceOptions = {}) {
    super(data, options);
  }

  transform() {
    const {
      id,
      name,
      description,
      setting_key,
      api_configuration,
      created_at,
      updated_at,
      _count,
      item_banks,
      module_count,
      cat_item_bank_scales,
    } = this.data;

    // Detail: the scale mappings carry their item bank and its modules, so the
    // relations (and their counts) are derived from them.
    const relations =
      cat_item_bank_scales !== undefined ? CatSettingResource.relations(cat_item_bank_scales) : null;

    return {
      id,
      name,
      description,
      setting_key,
      api_configuration: api_configuration ?? null,
      scaleCount: _count?.cat_item_bank_scales ?? 0,
      itemBanks: relations ? relations.itemBanks : (item_banks ?? []),
      moduleCount: relations ? relations.modules.length : (module_count ?? 0),
      canDelete: (_count?.cat_item_bank_scales ?? 0) === 0,
      ...(relations ? { scales: relations.scales, modules: relations.modules } : {}),
      createdAt: created_at,
      updatedAt: updated_at,
    };
  }

  private static relations(scales: any[]) {
    const itemBanks = new Map<number, { id: number; name: string }>();
    const modules = new Map<number, any>();

    for (const scale of scales) {
      const { id, name } = scale.cat_item_bank;
      itemBanks.set(id, { id, name });
      for (const m of scale.cat_item_bank.modules) {
        modules.set(m.id, {
          id: m.id,
          name: m.name,
          type: m.type,
          isActive: m.is_active,
          itemBank: { id: scale.cat_item_bank.id, name: scale.cat_item_bank.name },
        });
      }
    }

    return {
      itemBanks: [...itemBanks.values()].sort((a, b) => a.name.localeCompare(b.name)),
      scales: scales.map((s) => ({
        id: s.id,
        scaleCode: s.scale_code,
        displayName: s.display_name,
        patientGroup: s.patient_group ? { id: s.patient_group.id, name: s.patient_group.name } : null,
        itemBank: { id: s.cat_item_bank.id, name: s.cat_item_bank.name },
      })),
      modules: [...modules.values()].sort((a, b) => a.name.localeCompare(b.name)),
    };
  }
}
