// policies/SurveyPolicy.ts

import { SurveyStatusEnum } from '@/config/enums';

export class SurveyPolicy {
  /**
   * L'utente che sta facendo la richiesta
   */
  constructor(private authUser: { id: string; role?: string } | null) {}

  /**
   * Può visualizzare la survey?
   */
  view(survey: any): boolean {
    if (!this.authUser) return false;
    return true;
  }

  /**
   * Può modificare la survey? Non se è completata.
   */
  update(survey: any): boolean {
    if (!this.authUser) return false;
    return survey?.status !== SurveyStatusEnum.COMPLETED;
  }

  /**
   * Può eliminare la survey? Non se è completata.
   */
  delete(survey: any): boolean {
    if (!this.authUser) return false;
    return survey?.status !== SurveyStatusEnum.COMPLETED;
  }

  /**
   * Può creare una nuova survey?
   */
  create(): boolean {
    return !!this.authUser;
  }

  /**
   * Ritorna tutte le autorizzazioni per una survey target
   */
  getAuthorizations(survey: any): Record<string, boolean> {
    return {
      view: this.view(survey),
      update: this.update(survey),
      delete: this.delete(survey),
    };
  }
}
