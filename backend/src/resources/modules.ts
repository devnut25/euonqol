import { ModulePickerTypeEnum, ModuleTypeEnum } from '../config/enums.js';
import { Resource, ResourceOptions } from './baseResource.js';

/**
 * List representation — used in paginated list responses.
 */
export class ModuleResource extends Resource<any> {
  transform() {
    const {
      id,
      name,
      type,
      is_active,
      group_name,
      kit_version,
      patient_group,
      cat_setting,
      cat_item_bank,
      _count,
      language_count,
      survey_count,
      created_at,
      updated_at,
    } = this.data;

    return {
      id,
      name,
      type,
      is_active,
      group_name: group_name ?? null,
      question_count: _count?.modules_questions ?? 0,
      canDelete: (_count?.questionnaires_modules ?? 0) === 0,
      questionnaire_count: _count?.questionnaires_modules ?? 0,
      survey_count: survey_count ?? 0,
      language_count: language_count ?? 0,
      kit_version: kit_version ?? null,
      patient_group: patient_group ?? null,
      cat_setting: cat_setting ?? null,
      cat_item_bank: cat_item_bank ?? null,
      created_at: created_at?.toISOString() ?? null,
      updated_at: updated_at?.toISOString() ?? null,
    };
  }

  /**
   * Resolves the correct Resource class for a collection based on the requested type.
   */
  static resolveCollection(type: string, items: any[], options: ResourceOptions = {}): any[] {
    switch (type) {
      case 'detail':
        return ModuleDetailResource.collection(items, options);
      default:
        return ModuleResource.collection(items, options);
    }
  }

  /**
   * Resolves the correct Resource class for a single item based on the requested type.
   */
  static resolveItem(type: string, item: any, options: ResourceOptions = {}): any {
    switch (type) {
      default:
        return ModuleDetailResource.make(item, options);
    }
  }
}

/**
 * Maps a DB module type to the one exposed in questionnaire contexts:
 * `socio-demo` is relabelled `additional`, every other type is unchanged.
 */
export const toPickerModuleType = (type: string) =>
  type === ModuleTypeEnum.SOCIO_DEMO ? ModulePickerTypeEnum.ADDITIONAL : type;

/**
 * Minimal representation for GET /modules/all (questionnaire module picker).
 */
export class ModuleResourceAll extends Resource<any> {
  transform() {
    const { id, name, type } = this.data;

    return {
      id,
      name,
      type: toPickerModuleType(type),
    };
  }
}

/**
 * Detailed representation — used in create/update/detail responses.
 */
export class ModuleDetailResource extends Resource<any> {
  transform() {
    const {
      id,
      name,
      type,
      is_active,
      group_name,
      patient_group_id,
      cat_setting_id,
      cat_setting,
      cat_item_bank_id,
      cat_item_bank,
      languages,
      questions,
      _count,
      created_at,
      updated_at,
    } = this.data;

    return {
      id,
      name,
      type,
      is_active,
      group_name: group_name ?? null,
      patient_group_id: patient_group_id ?? null,
      cat_setting_id: cat_setting_id ?? null,
      cat_item_bank_id: cat_item_bank_id ?? null,
      question_count: _count?.modules_questions ?? 0,
      used_in_questionnaires: _count?.questionnaires_modules ?? 0,
      canDelete: (_count?.questionnaires_modules ?? 0) === 0,
      languages: languages ?? [],
      questions: questions ?? [],
      cat_setting: cat_setting ?? null,
      cat_item_bank: cat_item_bank ?? null,
      created_at: created_at?.toISOString() ?? null,
      updated_at: updated_at?.toISOString() ?? null,
    };
  }
}
