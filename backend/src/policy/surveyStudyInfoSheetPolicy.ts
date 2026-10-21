// policies/SurveyStudyInfoSheetPolicy.ts

import { SurveyStatusEnum } from '@/config/enums';

export class SurveyStudyInfoSheetPolicy {
  /**
   * L'utente che sta facendo la richiesta
   */
  constructor(private authUser: { id: string; role?: string } | null) {}

  /**
   * Può visualizzare la study info sheet?
   */
  view(sheet: any): boolean {
    if (!this.authUser) return false;
    return true;
  }

  /**
   * Può modificare la sheet? Non se la survey associata è completata.
   */
  update(sheet: any): boolean {
    if (!this.authUser) return false;
    return sheet.surveyStatus !== SurveyStatusEnum.COMPLETED;
  }

  /**
   * Può eliminare la sheet? Non se la survey associata è completata.
   */
  delete(sheet: any): boolean {
    if (!this.authUser) return false;
    return sheet.surveyStatus !== SurveyStatusEnum.COMPLETED;
  }

  /**
   * Può creare una nuova sheet per questa survey? Non se la survey è completata.
   */
  create(survey: any): boolean {
    if (!this.authUser) return false;
    return survey?.status !== SurveyStatusEnum.COMPLETED;
  }

  /**
   * Ritorna tutte le autorizzazioni per una sheet target
   */
  getAuthorizations(sheet: any): Record<string, boolean> {
    return {
      view: this.view(sheet),
      update: this.update(sheet),
      delete: this.delete(sheet),
    };
  }
}
