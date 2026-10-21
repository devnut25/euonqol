// policies/UserPolicy.ts

export class UserPolicy {
  /**
   * L'utente che sta facendo la richiesta
   */
  constructor(private authUser: { id: string; role?: string } | null) {}

  /**
   * Può visualizzare l'utente?
   */
  view(targetUser: any): boolean {
    if (!this.authUser) return false;
    return true; // Tutti gli utenti autenticati possono vedere altri utenti
  }

  /**
   * Può modificare l'utente?
   */
  update(targetUser: any): boolean {
    if (!this.authUser) return false;
    
    // Non può modificare se stesso
    if (this.authUser.id === targetUser.id) {
      return false;
    }

    // Solo admin può modificare altri
    // return this.authUser.role === 'admin';
    return true;
  }

  /**
   * Può eliminare l'utente?
   */
  delete(targetUser: any): boolean {
    if (!this.authUser) return false;

    // Nessuno può eliminare gli utenti
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
   * Può resettare la password?
   */
  resetPassword(targetUser: any): boolean {
    if (!this.authUser) return false;

    // Può resettare la propria password
    if (this.authUser.id === targetUser.id) {
      return true;
    }

    // Admin può resettare password di altri
    // return this.authUser.role === 'admin';
    return true;
  }

  /**
   * Può abilitare/disabilitare l'utente?
   */
  toggleStatus(targetUser: any): boolean {
    if (!this.authUser) return false;

    // Non può disabilitare se stesso
    if (this.authUser.id === targetUser.id) {
      return false;
    }

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
      reset_password: this.resetPassword(targetUser),
      toggle_status: this.toggleStatus(targetUser),
    };
  }
}