/**
 * The PostgreSQL schema Keycloak's own tables live in.
 *
 * Keycloak defaults to `public`, but it can be moved to a dedicated schema. The
 * name reaches the application through three independent channels — the
 * `?schema=` parameter Prisma uses to route the Keycloak client, `KC_DB_SCHEMA`
 * on the Keycloak container, and a psql variable in the bootstrap DDL — so it is
 * resolved once here and validated, rather than being read ad hoc.
 *
 * The failure mode this guards against is silent: Prisma connects happily to a
 * schema that does not exist, and the mistake only surfaces later as
 * `relation "user_entity" does not exist` on an unrelated request.
 */

/** Lowercase only, deliberately: it removes every quoting question across
 *  Prisma, psql, JDBC and raw SQL. */
const VALID_SCHEMA = /^[a-z_][a-z0-9_]{0,62}$/;

/** The application's own schema. Sharing it with Keycloak would collapse the two. */
const APP_SCHEMA = 'euonqol';

/** Reads the `schema` query parameter out of a Postgres connection URL. */
function schemaFromUrl(url: string | undefined): string | undefined {
  if (!url) return undefined;
  try {
    return new URL(url).searchParams.get('schema') ?? undefined;
  } catch {
    // A malformed URL is Prisma's problem to report, not ours.
    return undefined;
  }
}

function resolveKeycloakSchema(): string {
  // `KEYCLOAK_DB_SCHEMA` is the explicit knob, but falling back to the URL keeps
  // the two in step when only one of them has been set — which is the common
  // case, since the URL is what the Keycloak Prisma client actually uses.
  const raw = process.env.KEYCLOAK_DB_SCHEMA?.trim() || schemaFromUrl(process.env.KEYCLOAK_DATABASE_URL) || 'public';

  if (!VALID_SCHEMA.test(raw)) {
    throw new Error(
      `Invalid KEYCLOAK_DB_SCHEMA "${raw}": expected a lowercase PostgreSQL identifier ` +
        `matching ${VALID_SCHEMA}.`
    );
  }
  if (raw === APP_SCHEMA) {
    throw new Error(
      `KEYCLOAK_DB_SCHEMA cannot be "${APP_SCHEMA}": that is the application's own schema, ` +
        'and sharing it would let Keycloak and the application overwrite each other.'
    );
  }

  return raw;
}

export const KEYCLOAK_SCHEMA = resolveKeycloakSchema();
