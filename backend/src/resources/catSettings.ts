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
      modules,
    } = this.data;

    return {
      id,
      name,
      description,
      setting_key,
      api_configuration: api_configuration ?? null,
      moduleCount: _count?.modules ?? 0,
      canDelete: (_count?.cat_item_bank_scales ?? 0) === 0,
      ...(modules !== undefined ? { modules } : {}),
      createdAt: created_at,
      updatedAt: updated_at,
    };
  }
}
