import { CatItemBankPolicy } from '../policy/catItemBankPolicy.js';
import { Resource, ResourceOptions } from './baseResource.js';

export class CatItemBankResource extends Resource<any> {
  protected policy: CatItemBankPolicy;

  constructor(data: any, options: ResourceOptions = {}) {
    super(data, options);
    this.policy = new CatItemBankPolicy(options.policy?.authUser ?? null);
  }

  protected getAuthorizations(): Record<string, boolean> {
    return this.policy.getAuthorizations(this.data);
  }

  transform() {
    const {
      id,
      name,
      description,
      is_active,
      created_at,
      updated_at,
      _count,
      cat_item_bank_scales,
      questions,
      language_count,
      languages,
    } = this.data;

    return {
      id,
      name,
      description,
      isActive: is_active,
      questionCount: _count?.questions ?? 0,
      moduleCount: _count?.modules ?? 0,
      languageCount: language_count ?? 0,
      ...(questions !== undefined ? { questions } : {}),
      ...(languages !== undefined ? { languages } : {}),
      ...(cat_item_bank_scales !== undefined
        ? {
            scales: cat_item_bank_scales.map((s: any) => ({
              id: s.id,
              scaleCode: s.scale_code,
              displayName: s.display_name,
              patientGroup: s.patient_group ? { id: s.patient_group.id, name: s.patient_group.name } : null,
              catSetting: s.cat_setting
                ? { id: s.cat_setting.id, name: s.cat_setting.name, settingKey: s.cat_setting.setting_key }
                : null,
            })),
          }
        : {}),
      createdAt: created_at,
      updatedAt: updated_at,
    };
  }
}
