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
      survey_count,
      questionnaire_count,
      modules,
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
      surveyCount: survey_count ?? 0,
      questionnaireCount: questionnaire_count ?? 0,
      ...(modules !== undefined
        ? {
            modules: modules.map((m: any) => ({
              id: m.id,
              name: m.name,
              type: m.type,
              isActive: m.is_active,
            })),
          }
        : {}),
      ...(questions !== undefined
        ? { questions: CatItemBankQuestionResource.collection(questions) }
        : {}),
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

/**
 * A CAT item of a bank (GET /cat-item-banks/:id/questions), with its text in the
 * requested language.
 */
export class CatItemBankQuestionResource extends Resource<any> {
  transform() {
    const { id, question_code, scale, cat_questions } = this.data;

    return {
      id,
      questionCode: question_code,
      scale,
      questionText: cat_questions?.[0]?.question ?? '',
    };
  }
}
