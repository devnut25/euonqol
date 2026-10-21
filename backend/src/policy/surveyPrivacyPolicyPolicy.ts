// policies/SurveyPrivacyPolicyPolicy.ts

import { SurveyStatusEnum } from '@/config/enums';

export class SurveyPrivacyPolicyPolicy {
  /**
   * L'utente che sta facendo la richiesta
   */
  constructor(private authUser: { id: string; role?: string } | null) {}

  /**
   * Può visualizzare l'associazione privacy policy-survey?
   */
  view(link: any): boolean {
    if (!this.authUser) return false;
    return true;
  }

  /**
   * Può modificare l'associazione? Non se la survey associata è completata.
   */
  update(link: any): boolean {
    if (!this.authUser) return false;
    return link.surveyStatus !== SurveyStatusEnum.COMPLETED;
  }

  /**
   * Può eliminare l'associazione? Non se la survey associata è completata.
   */
  delete(link: any): boolean {
    if (!this.authUser) return false;
    return link.surveyStatus !== SurveyStatusEnum.COMPLETED;
  }

  /**
   * Può creare una nuova associazione per questa survey? Non se la survey è completata.
   */
  create(survey: any): boolean {
    if (!this.authUser) return false;
    return survey?.status !== SurveyStatusEnum.COMPLETED;
  }

  /**
   * Ritorna tutte le autorizzazioni per un'associazione target
   */
  getAuthorizations(link: any): Record<string, boolean> {
    return {
      view: this.view(link),
      update: this.update(link),
      delete: this.delete(link),
    };
  }
}
