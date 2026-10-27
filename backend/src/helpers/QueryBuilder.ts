import { parseQueryParams } from './queryParser.js';

export interface ModelConfig {
  searchable: string[];
  attributeFields: string[];
  sortable: string[];
  sortableAttributes: string[];
  includable: string[];
  fieldMap: Record<string, string>;
  attributeMap: Record<string, string>;
  /** Sort custom: funzione che riceve la direzione e restituisce i criteri DB reali. */
  customSorts?: Record<string, (direction: 'asc' | 'desc') => Record<string, 'asc' | 'desc'>[]>;
  /** Ordinamento di default applicato quando nessun ?sort= viene passato. */
  defaultOrder?: Record<string, 'asc' | 'desc'>[];
}

export interface BuiltQuery {
  where: Record<string, any>;
  orderBy?: Record<string, 'asc' | 'desc'>[];
  include?: Record<string, boolean>;
  take: number;
  skip: number;
  attributeOrderBy: Record<string, 'asc' | 'desc'>[];
}

/**
 * Generic query builder inspired by spatie/laravel-query-builder.
 * Consolidates filter/sort/include/search/pagination logic for Prisma queries.
 *
 * Usage:
 *   const query = QueryBuilder.for(UserModelConfig, req.query)
 *     .withBaseFilters({ realm_id: REALM_ID })
 *     .build();
 */
export class QueryBuilder {
  private readonly config: ModelConfig;
  private readonly queryParams: Record<string, any>;
  private baseConditions: Record<string, any>[] = [];

  private constructor(config: ModelConfig, queryParams: Record<string, any>) {
    this.config = config;
    this.queryParams = queryParams;
  }

  static for(config: ModelConfig, queryParams: Record<string, any>): QueryBuilder {
    return new QueryBuilder(config, queryParams);
  }

  withBaseFilters(filters: Record<string, any> | Record<string, any>[]): this {
    this.baseConditions = Array.isArray(filters) ? filters : [filters];
    return this;
  }

  build(): BuiltQuery {
    const parsed = parseQueryParams(this.queryParams);

    const searchWhere = this.buildSearchFilter(this.queryParams.search);
    const attributeWhere = this.buildAttributeFilters(this.queryParams.filter || {});
    const standardFilters = this.removeAttributeFields(parsed.where || {});

    const conditions: Record<string, any>[] = [
      ...this.baseConditions,
      ...(Object.keys(standardFilters).length ? [standardFilters] : []),
      ...(Object.keys(searchWhere).length ? [searchWhere] : []),
      ...(Object.keys(attributeWhere).length ? [attributeWhere] : []),
    ];

    const where =
      conditions.length === 0 ? {} : conditions.length === 1 ? conditions[0] : { AND: conditions };

    const { dbOrderBy, attributeOrderBy } = this.processOrderBy(parsed.orderBy);
    const include = this.sanitizeInclude(parsed.include);
    const take = parsed.take ?? 50;
    const skip = parsed.skip ?? 0;

    const defaultOrderBy = this.config.defaultOrder
      ? this.processOrderBy(this.config.defaultOrder).dbOrderBy
      : undefined;
    const orderBy = dbOrderBy ?? defaultOrderBy;

    return { where, orderBy, include, take, skip, attributeOrderBy };
  }

  /**
   * Sorts an array of records in-memory by Keycloak user_attribute values.
   * Used when sorting by custom attributes that are not DB columns.
   */
  sortByAttributes(users: any[], attributeOrderBy: Record<string, 'asc' | 'desc'>[]): any[] {
    if (attributeOrderBy.length === 0) return users;

    return [...users].sort((a, b) => {
      for (const order of attributeOrderBy) {
        const field = Object.keys(order)[0];
        const direction = order[field];
        const attributeName = this.config.attributeMap[field] || field;

        const aValue =
          a.user_attribute?.find((attr: any) => attr.name === attributeName)?.value ?? '';
        const bValue =
          b.user_attribute?.find((attr: any) => attr.name === attributeName)?.value ?? '';

        const comparison = String(aValue).toLowerCase().localeCompare(String(bValue).toLowerCase());
        if (comparison !== 0) return direction === 'desc' ? -comparison : comparison;
      }
      return 0;
    });
  }

  /**
   * Builds a Prisma `where` condition for full-text-style search across all `searchable` fields.
   *
   * Multi-word support: the search string is split on whitespace into tokens.
   * Each token must match at least one searchable field (OR across fields).
   * All tokens must match (AND across tokens).
   *
   * This allows cross-field searches like "test user" or "user test" to find a record
   * with first_name="Test" and last_name="User", regardless of word order.
   */
  private buildSearchFilter(search: string | undefined): Record<string, any> {
    // No searchable columns: an empty `OR: []` would match nothing in Prisma
    if (!search?.trim() || this.config.searchable.length === 0) return {};

    const tokens = search.trim().split(/\s+/).filter(Boolean);
    const tokenConditions = tokens.map((token) => ({
      OR: this.config.searchable.map((field) => ({
        [field]: { contains: token, mode: 'insensitive' },
      })),
    }));

    return tokenConditions.length === 1 ? tokenConditions[0] : { AND: tokenConditions };
  }

  private buildAttributeFilters(filters: Record<string, any>): Record<string, any> {
    const conditions: { name: string; value: string }[] = [];

    for (const [key, value] of Object.entries(filters)) {
      if (this.config.attributeFields.includes(key)) {
        const attributeName = this.config.attributeMap[key] || key;

        let attributeValue: string;
        if (typeof value === 'boolean') {
          attributeValue = value ? 'true' : 'false';
        } else if (value === 'true' || value === 'false') {
          attributeValue = value;
        } else {
          attributeValue = String(value);
        }

        conditions.push({ name: attributeName, value: attributeValue });
      }
    }

    if (conditions.length === 0) return {};

    return {
      AND: conditions.map((condition) => ({
        user_attribute: { some: condition },
      })),
    };
  }

  private removeAttributeFields(filters: Record<string, any>): Record<string, any> {
    return Object.fromEntries(
      Object.entries(filters).filter(([key]) => !this.config.attributeFields.includes(key))
    );
  }

  /**
   * Suddivide i criteri di ordinamento in due bucket distinti:
   *   - `dbOrderBy`       → passato direttamente a Prisma (colonne reali del DB)
   *   - `attributeOrderBy`→ applicato in memoria dopo il fetch (campi in user_attribute)
   *
   * Per ogni campo nell'array di ordinamento vengono applicati, nell'ordine, i seguenti controlli:
   *
   * 1. `sortableAttributes` — il campo vive in user_attribute, non è una colonna DB.
   *    Viene accodato ad `attributeOrderBy` così può essere ordinato in memoria.
   *
   * 2. `customSorts` — il campo è virtuale (es. `full_name`) e ha una funzione custom
   *    associata (equivalente a AllowedSort::custom() di Laravel).
   *    La funzione riceve la direzione e restituisce uno o più criteri DB reali da espandere.
   *
   * 3. `sortable` — colonna diretta su user_entity, dopo aver applicato eventuali alias
   *    definiti in `fieldMap` (es. `fullName` → `full_name`, `createdAt` → `created_timestamp`).
   *    Viene accodato a `dbOrderBy`.
   *
   * I campi non riconosciuti in nessuno dei tre casi vengono silenziosamente ignorati.
   */
  private processOrderBy(orderBy: any): {
    dbOrderBy: Record<string, 'asc' | 'desc'>[] | undefined;
    attributeOrderBy: Record<string, 'asc' | 'desc'>[];
  } {
    if (!orderBy) return { dbOrderBy: undefined, attributeOrderBy: [] };

    const arr = Array.isArray(orderBy) ? orderBy : [orderBy];
    const dbOrders: Record<string, 'asc' | 'desc'>[] = [];
    const attrOrders: Record<string, 'asc' | 'desc'>[] = [];

    for (const o of arr) {
      const field = Object.keys(o)[0];
      const direction = o[field];
      // Risolve eventuali alias frontend (es. fullName → full_name)
      const mappedField = this.config.fieldMap[field] || field;

      if (this.config.sortableAttributes.includes(field)) {
        // Caso 1: attributo custom → ordinamento in memoria
        attrOrders.push({ [field]: direction });
      } else if (this.config.customSorts?.[mappedField]) {
        // Caso 2: sort virtuale con logica custom → espande in colonne DB reali
        dbOrders.push(...this.config.customSorts[mappedField](direction));
      } else if (this.config.sortable.includes(mappedField)) {
        // Caso 3: colonna DB diretta → passata a Prisma
        dbOrders.push({ [mappedField]: direction });
      }
    }

    return {
      dbOrderBy: dbOrders.length ? dbOrders : undefined,
      attributeOrderBy: attrOrders,
    };
  }

  private sanitizeInclude(includeObj: any): Record<string, boolean> | undefined {
    if (!includeObj) return undefined;
    const out: Record<string, boolean> = {};
    for (const k of Object.keys(includeObj)) {
      if (this.config.includable.includes(k)) out[k] = true;
    }
    return Object.keys(out).length ? out : undefined;
  }
}
