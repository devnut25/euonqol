import { Resource } from './baseResource.js';

export class CttNormResource extends Resource<any> {
  transform() {
    return {
      id: this.data.id,
      name: this.data.name,
      description: this.data.description,
      is_active: this.data.is_active,
      survey_count: this.data._count?.surveys ?? 0,
      questionnaire_count: this.data._count?.questionnaires ?? 0,
      created_by: this.data.created_by,
      created_at: this.data.created_at,
      updated_at: this.data.updated_at,
    };
  }
}

export class CttNormDetailResource extends Resource<any> {
  transform() {
    return {
      id: this.data.id,
      name: this.data.name,
      description: this.data.description,
      norms: this.data.norms,
      is_active: this.data.is_active,
      survey_count: this.data._count?.surveys ?? 0,
      questionnaire_count: this.data._count?.questionnaires ?? 0,
      created_by: this.data.created_by,
      created_at: this.data.created_at,
      updated_at: this.data.updated_at,
    };
  }
}
