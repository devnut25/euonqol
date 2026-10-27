# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# Development (hot-reload with .env)
npm run dev

# Production build
npm run build

# Run compiled app
npm start

# Database seeding
npm run seed                     # Run all seeders in correct order
npm run seed countries           # Seed EU countries
npm run seed groups              # Seed patient groups
npm run seed users               # Seed default users
npm run seed answers             # Import answer catalog from Excel
npm run seed static              # Import static questions
npm run seed cat                 # Import CAT questions
npm run seed mappings            # Map questions to patient groups
npm run seed:foundation          # countries + groups + users only

# Prisma
npx prisma generate --schema=prisma/app/schema.prisma
npx prisma generate --schema=prisma/keycloak/schema.prisma
npx prisma db pull --schema=prisma/app/schema.prisma
npx prisma studio --schema=prisma/app/schema.prisma

# Docker Compose, from the repo root (recommended)
# The postgres container is an opt-in add-on behind the `localdb` profile,
# switched by DB_MODE in the env file. The Makefile handles the profile.
make up
make up-build
make migrate          # migrations must run inside the container
```

Path aliases: `@/*` maps to `src/*` (configured in tsconfig.json via `tsconfig-paths`).

## Architecture

### Dual Prisma Client Setup
The project uses **two separate Prisma clients** against two PostgreSQL schemas in the same database:

- **`src/generated/app`** — Application schema (`euonqol`), configured via `APP_DATABASE_URL`. Contains domain models: `kit_versions`, `modules`, `patients`, `questionnaires`, `static_questions`, `cat_questions`, `responses`, etc.
- **`src/generated/keycloak`** — Keycloak schema, configured via `KEYCLOAK_DATABASE_URL`. Used for direct DB queries against Keycloak's `user_entity`, `user_attribute`, `user_role_mapping` tables.

The Keycloak schema name is **not hardcoded anywhere**. It defaults to `public` and is set through `KEYCLOAK_DB_SCHEMA`, which the compose files feed into three places: the `?schema=` parameter of `KEYCLOAK_DATABASE_URL`, `KC_DB_SCHEMA` on the Keycloak container, and a psql variable for `setup/db/init.sql`. `src/config/schemas.ts` resolves and validates it at boot.

That is only possible because **the app schema contains no Keycloak models**: `prisma/app/schema.prisma` is `schemas = ["euonqol"]` alone. Prisma allows no `env()` in `schemas` or `@@schema(...)`, so mirroring Keycloak's tables there would pin the schema name into a file Prisma owns. The `created_by` / `sent_by` / `uploaded_by` columns are therefore plain strings with no Prisma relation, and user details are attached through `services/keycloakUserRefs.ts`. **Do not reintroduce a relation to `user_entity` in the app schema** — `prisma db pull` will try to, and it must be stripped back out.

The cross-schema foreign keys still exist in the database. PostgreSQL binds them by OID, so they follow the Keycloak tables automatically if those are ever moved to another schema.

Import pattern:
```typescript
import { PrismaClient as AppClient } from '@/generated/app';
import { PrismaClient as KeycloakClient } from '@/generated/keycloak';
```

Both schemas live in one PostgreSQL database; the schema is selected via the URL parameter.

### Keycloak as Identity Provider
User management operates through two channels simultaneously:
1. **Keycloak Admin REST API** (via `src/helpers/keycloak.ts`) — used for create/update/delete user operations. The `User` model class in `src/models/User.ts` wraps these API calls.
2. **Keycloak Prisma client** (direct DB) — used for read operations with rich filtering, pagination, and sorting.

Authentication flow: The `authenticate` middleware (`src/middleware/auth.ts`) calls `introspectToken()` against Keycloak's token introspection endpoint. The validated `req.user` is typed as `AuthUser` (id, email, username, roles, firstName, lastName).

### Request Lifecycle
```
Route → authenticate middleware → validate middleware (Zod) → Controller → Model/Helper → Resource transformation → Response
```

- **Routes** (`src/routes/`) — wire HTTP methods to controllers, apply middleware
- **Controllers** (`src/controllers/`) — handle HTTP, call helpers/models, return responses
- **Models** (`src/models/`) — domain logic and Keycloak API wrappers (e.g., `User` class)
- **Helpers** (`src/helpers/`) — `keycloak.ts` (admin token, introspect, user CRUD API), `queryParser.ts` (URL → Prisma query), `session.ts`, `utils.ts`
- **Resources** (`src/resources/`) — transform DB/Keycloak data into API response shape. Extend abstract `Resource<T>` from `baseResource.ts`. Support `.make()` for single items, `.collection()` for arrays, and optional policy-based `authorizations` appended to responses.
- **Validators** (`src/validators/schemas/`) — Zod schemas. The `zu` utility (`src/validators/utils.ts`) provides helpers like `zu.fieldText.required()` and `zu.uniqueEmail()` (which runs async DB check).
- **Policy** (`src/policy/`) — authorization checks tied to `req.user`, result appended to resource responses

### API Response Format

All controllers MUST use `Resource` from `src/resources/baseResource.ts` — never hand-roll response objects.

| Use case | Method |
|----------|--------|
| Single item | `Resource.respond(data, message)` → `{ success, message, data }` |
| Paginated list | `Resource.paginate(data, total, take, skip, message)` → `{ success, message, data, meta }` |
| Error | `res.status(4xx/5xx).json({ success: false, message: '...' })` |
| Delete (no data) | `Resource.respond(null, 'Deleted successfully')` |

Items must be transformed through a `Resource` subclass before passing to `respond`/`paginate`:
- Single: `SomeResource.make(item)`
- Array: `SomeResource.collection(items)`

See `src/controllers/userController.ts` for reference implementation.

### Query Parser
`src/helpers/queryParser.ts` translates URL query params to Prisma-compatible query objects:
- `?filter[field]=value` or `?filter[field][contains]=value` → `where`
- `?sort=-createdAt,username` (prefix `-` for desc) → `orderBy`
- `?page=2&limit=20` or `?offset=0` → `take`/`skip`
- `?include=relation1,relation2` → `include`

In `userController.ts`, attribute-based filters (fields stored in Keycloak's `user_attribute` table) are handled separately and sorted in-memory after DB fetch.

### List Endpoints Backing Frontend Tables
Every list endpoint consumed by a frontend `CrudDataTable` / `CardListData` receives the table state as query params: `page`, `per_page`, `search`, `sort`, `filter[...]`. The backend **must honour them** — a controller that ignores `req.query` silently breaks the search box, sorting and filters in the UI (the table still renders, so the bug goes unnoticed).

Rules:
- **Controller** always forwards `req.query as Record<string, any>` to the service. Never call the list service with only path params.
- **Service** builds `where` (and `orderBy`/`take`/`skip` when paginated) with `QueryBuilder.for(<Model>Config, query)`. Path-scoped conditions (`survey_id`, `is_current`, …) go in `.withBaseFilters(...)`, never by overwriting `where`.
- **Model config** (`src/models/<Entity>.ts`, `ModelConfig`) declares the columns: every column marked `meta: { searchable: true }` in the frontend table must be in `searchable`; every column with sorting enabled must be in `sortable`; every `filterable` column must be a filterable DB field (or extracted before QueryBuilder, see below). Reference: `models/EmailTemplate.ts`, `models/Questionnaire.ts`.
- **Relation-rooted listings** (root table is a pivot, e.g. `surveys_questionnaires`, `survey_privacy_policies`): build `where` with the related entity's config and nest it under the relation — `{ survey_id, privacy_policy: where }`. Reference: `QuestionnaireService.getSurveyQuestionnaires`, `SurveyPrivacyPolicyService.getPrivacyPolicies`.
- **Search on relation fields** (e.g. patient `mail`): keep `searchable: []` in the config and add a custom condition via `.withBaseFilters([...])`. `QueryBuilder` skips `search` when `searchable` is empty (an `OR: []` would match nothing in Prisma). Reference: `AssignmentService.getList`.
- **Relation-nested filters** (`filter[questionnaireId]`, …): extract them from `query.filter` before calling QueryBuilder and push them as base filters. Reference: `AssignmentService.getList`.

When adding or changing a frontend table column's `searchable` / sorting / `filterable` meta, check the matching backend config in the same change. Verify with `GET <endpoint>?search=<text>` that `meta.total` shrinks.

### API Routes
| Prefix | File |
|--------|------|
| `/euonqol-api/auth` | authRoutes.ts |
| `/euonqol-api/otp` | otpRoutes.ts |
| `/euonqol-api/users` | userRoutes.ts (auth required) |
| `/euonqol-api/kit-versions` | kitRoutes.ts |
| `/euonqol-api/modules` | moduleRoutes.ts |
| `/euonqol-api/patient-groups` | patientGroupRoutes.ts |
| `/euonqol-api/answer-profiles` | answerRoutes.ts |

### Environment Variables
All variables come from the root env file (`.env.dev`, `.env.staging`, `.env.prod`; template: root `.env.example`), injected by the compose files. There is no `backend/.env`: the npm scripts do not load one. Secrets (`ENCRYPTION_KEY`, `KEYCLOAK_CLIENT_SECRET`, `DB_PASSWORD`) and `KEYCLOAK_REALM_ID` are required (`${VAR:?}` in compose, boot-time check in code). Key variables:
- `APP_DATABASE_URL` — PostgreSQL URL with `?schema=euonqol`
- `KEYCLOAK_DATABASE_URL` — PostgreSQL URL with `?schema=<KEYCLOAK_DB_SCHEMA>`
- `KEYCLOAK_DB_SCHEMA` — schema holding Keycloak's tables (default `public`)
- `KEYCLOAK_URL`, `KEYCLOAK_REALM`, `KEYCLOAK_CLIENT_ID`, `KEYCLOAK_CLIENT_SECRET`
- `KEYCLOAK_REALM_ID` — the internal UUID of the Keycloak realm, used to scope user queries (`models/User.ts`)
- `ENCRYPTION_KEY` — 32-byte hex string for encryption

### Seeding
Seeders in `src/services/seed/` import data from Excel files in the `data/` directory. Foundation data must be seeded in order (countries → groups → users) due to FK constraints.

### Postman
Every endpoint has a request file in `postman/collections/<Collection>/` (see `postman/README.md`). When adding, changing or removing a route in `src/routes/`, update those files with the project skill `postman-request` (`.claude/skills/postman-request/SKILL.md`).
