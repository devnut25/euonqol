import { ModelConfig } from '../helpers/QueryBuilder.js';

/**
 * QueryBuilder configuration for the Questionnaire entity.
 * Declares which fields are searchable, sortable, filterable and includable.
 * All field names must match the actual Prisma `questionnaires` columns.
 */
export const QuestionnaireModelConfig: ModelConfig = {
  // Colonne dirette su `questionnaires` su cui eseguire la ricerca globale (?search=)
  searchable: ['title'],

  // Nessun campo attributo Keycloak — tutti i campi sono colonne DB dirette
  attributeFields: [],

  // Colonne DB ordinabili via Prisma (?sort=field o ?sort=-field)
  sortable: ['id', 'title', 'type', 'status', 'created_at', 'updated_at'],

  // Nessun attributo ordinabile in memoria (non si usano user_attribute)
  sortableAttributes: [],

  // Relazioni includibili via ?include=
  // `creator` non c'e' piu': l'utente Keycloak non e' una relazione Prisma (vedi
  // services/keycloakUserRefs.ts), quindi passarlo a Prisma darebbe errore a runtime.
  includable: ['patient_group', 'ctt_norms_version', 'questionnaires_modules'],

  // Mappa alias frontend → nome colonna DB
  fieldMap: {
    createdAt: 'created_at',
    updatedAt: 'updated_at',
    patientGroupId: 'patient_group_id',
    cttNormsVersionId: 'ctt_norms_version_id',
    maxCompletions: 'max_completions',
  },

  // Nessun sort virtuale custom
  customSorts: {},

  // Nessuna mappa attributo (non ci sono user_attribute)
  attributeMap: {},

  // Ordinamento di default: più vecchi prima (ordine di creazione)
  defaultOrder: [{ created_at: 'asc' }],
};
