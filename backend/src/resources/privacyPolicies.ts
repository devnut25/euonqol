import { Resource } from './baseResource.js';

export class PrivacyPolicyResource extends Resource<any> {
  transform() {
    const p = this.data;
    return {
      id: p.id,
      title: p.title,
      language_id: p.language_id,
      language: p.language?.language ?? null,
      language_original: p.language?.original_lang ?? null,
      patient_type: p.patient_type,
      is_active: p.is_active,
      pdf_url: p.pdf_url ?? null,
      pdf_filename: p.pdf_filename ?? null,
      survey_count: p._count?.survey_privacy_policies ?? 0,
      created_at: p.created_at?.toISOString() ?? null,
      updated_at: p.updated_at?.toISOString() ?? null,
    };
  }
}

export class PrivacyPolicyDetailResource extends Resource<any> {
  transform() {
    const p = this.data;
    return {
      id: p.id,
      title: p.title,
      content: p.content,
      language_id: p.language_id,
      language: p.language?.language ?? null,
      language_original: p.language?.original_lang ?? null,
      patient_type: p.patient_type,
      is_active: p.is_active,
      pdf_url: p.pdf_url ?? null,
      pdf_filename: p.pdf_filename ?? null,
      version: p.version,
      survey_count: p._count?.survey_privacy_policies ?? 0,
      created_at: p.created_at?.toISOString() ?? null,
      updated_at: p.updated_at?.toISOString() ?? null,
    };
  }
}
