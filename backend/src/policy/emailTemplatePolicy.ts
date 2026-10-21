// policies/EmailTemplatePolicy.ts

import { QuestionnaireStatusEnum, SurveyStatusEnum } from '@/config/enums';

export class EmailTemplatePolicy {
  /**
   * L'utente che sta facendo la richiesta
   */
  constructor(private authUser: { id: string; role?: string } | null) {}

  /**
   * Può visualizzare il template email?
   */
  view(template: any): boolean {
    if (!this.authUser) return false;
    return true;
  }

  /**
   * Può modificare il template? Non se la survey o il questionario associati sono completati.
   */
  update(template: any): boolean {
    if (!this.authUser) return false;
    return (
      template.surveyStatus !== SurveyStatusEnum.COMPLETED &&
      template.questionnaireStatus !== QuestionnaireStatusEnum.COMPLETED
    );
  }

  /**
   * Può eliminare il template? Non se la survey o il questionario associati sono completati.
   */
  delete(template: any): boolean {
    if (!this.authUser) return false;
    return (
      template.surveyStatus !== SurveyStatusEnum.COMPLETED &&
      template.questionnaireStatus !== QuestionnaireStatusEnum.COMPLETED
    );
  }

  /**
   * Può creare un nuovo template per questo questionario? Non se la survey o il questionario sono completati.
   */
  create(context: { surveyStatus?: string; questionnaireStatus?: string }): boolean {
    if (!this.authUser) return false;
    return (
      context?.surveyStatus !== SurveyStatusEnum.COMPLETED &&
      context?.questionnaireStatus !== QuestionnaireStatusEnum.COMPLETED
    );
  }

  /**
   * Ritorna tutte le autorizzazioni per un template target
   */
  getAuthorizations(template: any): Record<string, boolean> {
    return {
      view: this.view(template),
      update: this.update(template),
      delete: this.delete(template),
    };
  }
}
