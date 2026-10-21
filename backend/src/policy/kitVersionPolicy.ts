export class KitVersionPolicy {
  /**
   * L'utente che sta facendo la richiesta
   */
  constructor(private authUser: { id: string; role?: string } | null) {}

  /**
   * Può visualizzare la versione del kit?
   */
  view(targetKitVersion: any): boolean {
    if (!this.authUser) return false;
    return true; // Tutti gli utenti autenticati possono vedere le versioni del kit
  }

  /**
   * Può modificare la versione del kit?
   */
  update(targetKitVersion: any): boolean {
    // Non può modificare se stesso
    return false;
  }

  /**
   * Può eliminare la versione del kit?
   */
  delete(targetKitVersion: any): boolean {
    // Nessuno può eliminare le versioni del kit
    return false;
  }

  /**
   * Può creare nuovi utenti?
   */
  create(): boolean {
    if (!this.authUser) return false;
    return true;
  }

  /**
   * Ritorna tutte le autorizzazioni per un utente target
   */
  getAuthorizations(targetUser: any): Record<string, boolean> {
    return {
      view: this.view(targetUser),
      update: this.update(targetUser),
      delete: this.delete(targetUser),
    };
  }
}
