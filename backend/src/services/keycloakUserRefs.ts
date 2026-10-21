/**
 * Attaches Keycloak user details (creator, sender, uploader…) to application rows.
 *
 * The application schema stores only the Keycloak user id — `created_by`,
 * `sent_by`, `uploaded_by`, `user_id` — and deliberately has no Prisma relation
 * to `user_entity`: mirroring Keycloak's tables into the app client would pin
 * Keycloak's schema name into `schema.prisma`, where Prisma allows no `env()`.
 * The join is therefore done here, in one batched query per request against the
 * Keycloak client, and produces exactly the shape the old `include` produced.
 */

import { keycloakPrisma } from '../config/database.js';

export interface KeycloakUserRef {
  id: string;
  username: string;
  email: string | null;
  first_name: string | null;
  last_name: string | null;
}

export type KeycloakUserField = keyof KeycloakUserRef;

/**
 * Looks up the given user ids, returning only the requested fields.
 *
 * The field list is explicit rather than "always everything" so that each call
 * site keeps returning the same columns it selected through the relation.
 */
export async function getUserRefs<F extends KeycloakUserField>(
  ids: readonly (string | null | undefined)[],
  fields: readonly F[]
): Promise<Map<string, Pick<KeycloakUserRef, F>>> {
  const unique = [...new Set(ids.filter((id): id is string => !!id))];
  if (unique.length === 0) return new Map();

  // `id` always comes back: it is what the rows are keyed by.
  const select = Object.fromEntries([...fields, 'id'].map((f) => [f, true]));

  const users = await keycloakPrisma.user_entity.findMany({
    where: { id: { in: unique } },
    select,
  });

  return new Map(users.map((u: any) => [u.id as string, u as Pick<KeycloakUserRef, F>]));
}

/**
 * Returns a copy of `rows` with the resolved user attached under `key`.
 *
 * A row whose id is null — or whose user no longer exists in Keycloak — gets
 * `null`, matching what the `ON DELETE SET NULL` foreign key used to produce.
 */
export async function attachUserRef<T, K extends string, F extends KeycloakUserField>(
  rows: readonly T[],
  idOf: (row: T) => string | null | undefined,
  key: K,
  fields: readonly F[]
): Promise<(T & { [P in K]: Pick<KeycloakUserRef, F> | null })[]> {
  const refs = await getUserRefs(rows.map(idOf), fields);

  return rows.map((row) => {
    const id = idOf(row);
    return { ...row, [key]: (id && refs.get(id)) || null } as T & {
      [P in K]: Pick<KeycloakUserRef, F> | null;
    };
  });
}

/** Single-row convenience wrapper around {@link attachUserRef}. */
export async function attachUserRefOne<T, K extends string, F extends KeycloakUserField>(
  row: T,
  idOf: (row: T) => string | null | undefined,
  key: K,
  fields: readonly F[]
): Promise<T & { [P in K]: Pick<KeycloakUserRef, F> | null }> {
  const [hydrated] = await attachUserRef([row], idOf, key, fields);
  return hydrated;
}
