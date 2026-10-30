// policies/QuestionnairePolicy.ts

export class QuestionnairePolicy {
  /**
   * L'utente che sta facendo la richiesta
   */
  constructor(private authUser: { id: string; role?: string } | null) {}

  /**
   * Può visualizzare il questionario?
   */
  view(questionnaire: any): boolean {
    if (!this.authUser) return false;
    return true;
  }

  /**
   * Può modificare il questionario? Non se già completato o se la survey associata è completata.
   */
  update(questionnaire: any): boolean {
    if (!this.authUser) return false;
    if (questionnaire.status === 'completed') return false;
    if (questionnaire.survey && questionnaire.survey.status === 'completed') return false;
    return true;
  }

  /**
   * Può eliminare il questionario? Solo se non completato, survey ancora in draft e nessuna assegnazione.
   */
  delete(questionnaire: any): boolean {
    if (!this.authUser) return false;
    if (questionnaire.status === 'completed') return false;
    if (questionnaire.survey && questionnaire.survey.status !== 'draft') return false;
    // totalAssignments counts every status; the list's assignmentCount only the completed ones
    if ((questionnaire.totalAssignments ?? questionnaire.assignmentCount ?? 0) > 0) return false;
    return true;
  }

  /**
   * Può modificare i moduli del questionario? Solo mentre è in draft.
   */
  updateModules(questionnaire: any): boolean {
    if (!this.authUser) return false;
    return questionnaire.status === 'draft';
  }

  /**
   * Può creare un nuovo questionario per questa survey? Non se la survey è completata.
   * Flag collection-level, non copre le regole complete di /prerequisites (presentazione,
   * domande eligibilità, privacy policy).
   */
  create(survey: any): boolean {
    if (!this.authUser) return false;
    const result = survey?.status !== 'completed';

    return result;
  }

  /**
   * Ritorna tutte le autorizzazioni per un questionario target
   */
  getAuthorizations(questionnaire: any): Record<string, boolean> {
    return {
      view: this.view(questionnaire),
      update: this.update(questionnaire),
      delete: this.delete(questionnaire),
      updateModules: this.updateModules(questionnaire),
    };
  }
}
