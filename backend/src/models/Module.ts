import { ModelConfig } from '../helpers/QueryBuilder.js';

/**
 * Scope definitions (Laravel-style local scopes).
 * Each key maps a frontend ModuleTypeEnum value → Prisma `where` base filter.
 *
 *   'kit-module'        → type IN (static, dynamic)
 *   'additional-module' → type IN (socio-demo, feedback)
 */
export const ModuleScopes: Record<string, Record<string, any>> = {
  'kit-module': { type: { in: ['static', 'dynamic'] } },
  'additional-module': { type: { in: ['socio-demo', 'feedback'] } },
};

/**
 * Returns the base Prisma `where` conditions for a module query.
 * Pass a scope name (ModuleTypeEnum value) to narrow results by module type group.
 */
export function getModuleBaseFilters(scope?: string): Record<string, any> {
  if (scope && ModuleScopes[scope]) {
    return ModuleScopes[scope];
  }
  return {};
}

/**
 * Dynamic scope resolvers: keyed by filter param name.
 * When frontend sends filter[scopeKey]=true, the resolver's where fragment is added as base filter.
 * The scope key itself is stripped from the filter before QueryBuilder processes remaining params.
 */
export type ModuleScopeResolver = (filter: Record<string, any>) => {
  where: Record<string, any>;
  consumedKeys: string[];
};

export const ModuleScopeResolvers: Record<string, ModuleScopeResolver> = {
  with_addition_modules: (filter) => {
    const patientGroupId = filter.patient_group_id
      ? parseInt(filter.patient_group_id, 10)
      : null;
    const orConditions: any[] = [{ type: { in: ['feedback', 'socio-demo'] } }];
    const consumedKeys = ['with_addition_modules'];
    if (patientGroupId) {
      orConditions.push({ patient_group_id: patientGroupId });
      consumedKeys.push('patient_group_id');
    }
    return { where: { OR: orConditions }, consumedKeys };
  },
};

/**
 * QueryBuilder configuration for the Module entity.
 * Declares which fields are searchable, sortable, filterable and includable.
 * All field names must match the actual Prisma `modules` columns.
 */
export const ModuleModelConfig: ModelConfig = {
  // Colonne dirette su `modules` su cui eseguire la ricerca globale (?search=)
  searchable: ['name', 'group_name'],

  // Nessun campo attributo Keycloak — tutti i campi sono colonne DB dirette
  attributeFields: [],

  // Colonne DB ordinabili via Prisma (?sort=field o ?sort=-field)
  sortable: [
    'id',
    'name',
    'type',
    'is_active',
    'group_name',
    'kit_version_id',
    'patient_group_id',
    'created_at',
    'updated_at',
  ],

  // Nessun attributo ordinabile in memoria (non si usano user_attribute)
  sortableAttributes: [],

  // Relazioni includibili via ?include=
  includable: ['kit_version', 'patient_group', 'cat_setting', 'cat_item_bank'],

  // Mappa alias frontend → nome colonna DB
  fieldMap: {
    createdAt: 'created_at',
    updatedAt: 'updated_at',
    kitVersionId: 'kit_version_id',
    patientGroupId: 'patient_group_id',
    catSettingId: 'cat_setting_id',
    catItemBankId: 'cat_item_bank_id',
    groupName: 'group_name',
    isActive: 'is_active',
  },

  // Nessun sort virtuale custom
  customSorts: {},

  // Nessuna mappa attributo (non ci sono user_attribute)
  attributeMap: {},

  // Ordinamento di default: attivi prima, poi più recenti
  defaultOrder: [{ is_active: 'desc' }, { created_at: 'desc' }],
};
