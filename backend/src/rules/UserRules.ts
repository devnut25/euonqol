import { KeycloakUserModel } from "../models/KeycloakUserModel.js";

/**
 * Classe User per operazioni CRUD via API Keycloak
 */
export class UserRules {
  /**
   * Verifica se username esiste già
   */
  static async usernameExists(username: string): Promise<boolean> {
    const user = await KeycloakUserModel.findByUsername(username);
    return user !== null;
  }

  /**
   * Verifica se email esiste già
   */
  static async emailExists(email: string, excludeUserId?: string): Promise<boolean> {
    const user = await KeycloakUserModel.findByEmail(email);

    if (!user) {
      return false;
    }

    // Se devo escludere un utente specifico
    if (excludeUserId && user.id === excludeUserId) {
      return false; // È lo stesso utente
    }

    return true; // Email esiste ed è di qualcun altro
  }
}
