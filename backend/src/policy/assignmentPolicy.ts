// policies/AssignmentPolicy.ts

export class AssignmentPolicy {
  /**
   * L'utente che sta facendo la richiesta
   */
  constructor(private authUser: { id: string; role?: string } | null) {}

  /**
   * Può visualizzare l'assegnazione?
   */
  view(assignment: any): boolean {
    if (!this.authUser) return false;
    return true;
  }

  /**
   * Può eliminare l'assegnazione? Solo se non completata.
   */
  delete(assignment: any): boolean {
    if (!this.authUser) return false;
    return assignment.completion_status !== 'completed';
  }

  /**
   * Ritorna tutte le autorizzazioni per un'assegnazione target
   */
  getAuthorizations(assignment: any): Record<string, boolean> {
    return {
      view: this.view(assignment),
      delete: this.delete(assignment),
    };
  }
}
