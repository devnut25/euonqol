// policies/SurveyEligibilityQuestionPolicy.ts

import { SurveyStatusEnum } from '@/config/enums';

export class SurveyEligibilityQuestionPolicy {
  /**
   * L'utente che sta facendo la richiesta
   */
  constructor(private authUser: { id: string; role?: string } | null) {}

  /**
   * Può visualizzare la domanda di eligibilità?
   */
  view(question: any): boolean {
    if (!this.authUser) return false;
    return true;
  }

  /**
   * Può modificare la domanda? Non se la survey associata è completata.
   */
  update(question: any): boolean {
    if (!this.authUser) return false;
    return question.surveyStatus !== SurveyStatusEnum.COMPLETED;
  }

  /**
   * Può eliminare la domanda? Non se la survey associata è completata.
   */
  delete(question: any): boolean {
    if (!this.authUser) return false;
    return question.surveyStatus !== SurveyStatusEnum.COMPLETED;
  }

  /**
   * Può creare una nuova domanda per questa survey? Non se la survey è completata.
   */
  create(survey: any): boolean {
    if (!this.authUser) return false;
    return survey?.status !== SurveyStatusEnum.COMPLETED;
  }

  /**
   * Ritorna tutte le autorizzazioni per una domanda target
   */
  getAuthorizations(question: any): Record<string, boolean> {
    return {
      view: this.view(question),
      update: this.update(question),
      delete: this.delete(question),
    };
  }
}
