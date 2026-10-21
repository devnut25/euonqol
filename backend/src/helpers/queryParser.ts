interface ParsedQuery {
  where?: Record<string, any>;
  orderBy?: Record<string, "asc" | "desc"> | Record<string, "asc" | "desc">[];
  take?: number;
  skip?: number;
  include?: Record<string, boolean>;
  select?: Record<string, boolean>;
}

/**
 * Converte query params URL in oggetto Prisma-compatibile
 *
 * Esempi di query supportate:
 * - ?filter[email]=test@example.com
 * - ?filter[name][contains]=Mario
 * - ?filter[age][gte]=18
 * - ?sort=-createdAt,username
 * - ?page=2&limit=20
 * - ?include=posts,comments
 */
export function parseQueryParams(query: Record<string, any>): ParsedQuery {
  const result: ParsedQuery = {};

  // 1) FILTRI (where)
  if (query.filter) {
    result.where = parseFilters(query.filter);
  }

  // 2) ORDINAMENTO (orderBy)
  if (query.sort) {
    result.orderBy = parseSort(query.sort);
  }

  // 3) PAGINAZIONE
  const page = parseInt(query.page) || 1;
  const limit = parseInt(query.limit) || parseInt(query.per_page) || 50;
  result.take = limit;
  result.skip = (page - 1) * limit;

  // Supporto offset diretto
  if (query.offset !== undefined) {
    result.skip = parseInt(query.offset) || 0;
  }

  // 4) INCLUDE (relazioni)
  if (query.include) {
    result.include = parseInclude(query.include);
  }

  // 5) SELECT (campi specifici)
  if (query.select) {
    result.select = parseSelect(query.select);
  }

  return result;
}

function parseFilters(filter: Record<string, any>): Record<string, any> {
  const where: Record<string, any> = {};

  for (const [field, value] of Object.entries(filter)) {
    if (Array.isArray(value)) {
      // Filtro multiplo: ?filter[status][]=a&filter[status][]=b → { in: [...] }
      where[field] = { in: value.map((v) => parseValue(v as string)) };
    } else if (typeof value === "object" && value !== null) {
      // Operatori: { contains: 'x' }, { gte: 10 }, etc.
      where[field] = {};
      for (const [op, val] of Object.entries(value)) {
        where[field][op] = parseValue(val as string);
        // Aggiungi mode insensitive per stringhe
        if (op === "contains" || op === "startsWith" || op === "endsWith") {
          where[field].mode = "insensitive";
        }
      }
    } else {
      // Uguaglianza diretta
      where[field] = parseValue(value);
    }
  }

  return where;
}

function parseSort(sort: string | string[]): Record<string, "asc" | "desc">[] {
  let fields: string[];
  
  if (Array.isArray(sort)) {
    fields = sort.flatMap(s => s.split(','));
  } else {
    fields = sort.split(',');
  }
  return fields.map((field) => {
    const trimmed = field.trim();
    if (trimmed.startsWith("-")) {
      return { [trimmed.slice(1)]: "desc" as const };
    }
    return { [trimmed]: "asc" as const };
  });
}

function parseInclude(include: string): Record<string, boolean> {
  const relations = include.split(",");
  const result: Record<string, boolean> = {};
  for (const rel of relations) {
    result[rel.trim()] = true;
  }
  return result;
}

function parseSelect(select: string): Record<string, boolean> {
  const fields = select.split(",");
  const result: Record<string, boolean> = {};
  for (const field of fields) {
    result[field.trim()] = true;
  }
  return result;
}

function parseValue(value: string): any {
  if (value === "true") return true;
  if (value === "false") return false;
  if (value === "null") return null;
  if (!isNaN(Number(value)) && value !== "") return Number(value);
  return value;
}
