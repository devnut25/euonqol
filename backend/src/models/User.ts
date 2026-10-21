import { ModelConfig } from '@/helpers/QueryBuilder';

export const REALM_ID = process.env.KEYCLOAK_REALM_ID || 'cc2ec4d2-c6f0-4296-90e7-d0be1de23390';

/**
 * Filtri base per escludere utenti di sistema Keycloak (service account, realm errato).
 * Usare con QueryBuilder.withBaseFilters().
 */
export function getUserBaseFilters() {
  return {
    realm_id: REALM_ID,
    service_account_client_link: null,
    NOT: {
      username: {
        startsWith: 'service-account-',
      },
    },
  };
}

/**
 * QueryBuilder configuration for the User entity.
 * Declares which fields are searchable, sortable, filterable and includable.
 * All field names must match the actual Prisma user_entity columns or user_attribute names.
 */
export const UserModelConfig: ModelConfig = {
  // Colonne dirette su user_entity su cui eseguire la ricerca globale (?search=)
  searchable: ['first_name', 'last_name', 'email', 'username'],

  // Campi che vivono in user_attribute, non come colonne dirette su user_entity
  attributeFields: ['user_type', 'is_active'],

  // Colonne dirette su user_entity ordinabili via DB (?sort=field o ?sort=-field)
  sortable: [
    'id',
    'username',
    'email',
    'created_timestamp',
    'first_name',
    'last_name',
    'email_verified',
    'enabled',
  ],

  // Attributi custom (user_attribute) ordinabili in memoria dopo il fetch
  // 'last_access' è un campo calcolato post-fetch (Keycloak event_entity), non un attributo reale
  sortableAttributes: ['user_type', 'is_active', 'last_access'],

  // Relazioni di user_entity includibili via ?include=
  includable: ['user_attribute', 'user_group_membership', 'federated_identity'],

  // Mappa alias frontend → nome colonna DB su user_entity
  fieldMap: {
    created_at: 'created_timestamp',
    createdAt: 'created_timestamp',
    firstName: 'first_name',
    lastName: 'last_name',
    fullName: 'full_name',
  },

  // Sort custom: equivalente a AllowedSort::custom() di Laravel
  customSorts: {
    full_name: (direction) =>
      [{ last_name: direction }, { first_name: direction }] as Record<string, 'asc' | 'desc'>[],
  },

  // Mappa alias frontend → nome attributo in user_attribute
  // Aggiungere qui solo se il nome frontend differisce dal nome dell'attributo Keycloak
  attributeMap: {
    is_active: 'is_active',
  },

  // Filtri base da applicare a tutte le query per escludere utenti di sistema
  defaultOrder: [{ full_name: 'asc' }],
};
