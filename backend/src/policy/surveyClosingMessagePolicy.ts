// policies/SurveyClosingMessagePolicy.ts

import { SurveyStatusEnum } from '@/config/enums';

export class SurveyClosingMessagePolicy {
  /**
   * L'utente che sta facendo la richiesta
   */
  constructor(private authUser: { id: string; role?: string } | null) {}

  /**
   * Può visualizzare il messaggio di chiusura?
   */
  view(closingMessage: any): boolean {
    if (!this.authUser) return false;
    return true;
  }

  /**
   * Può modificare il messaggio di chiusura? Non se la survey associata è completata.
   */
  update(closingMessage: any): boolean {
    if (!this.authUser) return false;
    return closingMessage.surveyStatus !== SurveyStatusEnum.COMPLETED;
  }

  /**
   * Può eliminare il messaggio di chiusura? Non se la survey associata è completata.
   */
  delete(closingMessage: any): boolean {
    if (!this.authUser) return false;
    return closingMessage.surveyStatus !== SurveyStatusEnum.COMPLETED;
  }

  /**
   * Può creare un nuovo messaggio di chiusura per questa survey? Non se la survey è completata.
   */
  create(survey: any): boolean {
    if (!this.authUser) return false;
    return survey?.status !== SurveyStatusEnum.COMPLETED;
  }

  /**
   * Ritorna tutte le autorizzazioni per un messaggio di chiusura target
   */
  getAuthorizations(closingMessage: any): Record<string, boolean> {
    return {
      view: this.view(closingMessage),
      update: this.update(closingMessage),
      delete: this.delete(closingMessage),
    };
  }
}
