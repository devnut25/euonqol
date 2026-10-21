// policies/SurveyPresentationPolicy.ts

import { SurveyStatusEnum } from '@/config/enums';

export class SurveyPresentationPolicy {
  /**
   * L'utente che sta facendo la richiesta
   */
  constructor(private authUser: { id: string; role?: string } | null) {}

  /**
   * Può visualizzare la presentazione?
   */
  view(presentation: any): boolean {
    if (!this.authUser) return false;
    return true;
  }

  /**
   * Può modificare la presentazione? Non se la survey associata è completata.
   */
  update(presentation: any): boolean {
    if (!this.authUser) return false;
    return presentation.surveyStatus !== SurveyStatusEnum.COMPLETED;
  }

  /**
   * Può eliminare la presentazione? Non se la survey associata è completata.
   */
  delete(presentation: any): boolean {
    if (!this.authUser) return false;
    return presentation.surveyStatus !== SurveyStatusEnum.COMPLETED;
  }

  /**
   * Può creare una nuova presentazione per questa survey? Non se la survey è completata.
   */
  create(survey: any): boolean {
    if (!this.authUser) return false;
    return survey?.status !== SurveyStatusEnum.COMPLETED;
  }

  /**
   * Ritorna tutte le autorizzazioni per una presentazione target
   */
  getAuthorizations(presentation: any): Record<string, boolean> {
    return {
      view: this.view(presentation),
      update: this.update(presentation),
      delete: this.delete(presentation),
    };
  }
}
