# Firebase SQL Connect — Full Architecture & Phased Plan

**Date:** 2026-10-09
**Status:** Approved for planning
**Firebase project:** `tender-management-flow`

## Goal

Move TM Flow off local SQLite/Next.js onto Firebase: SQL Connect (Cloud SQL
Postgres) for data, Firebase Auth for identity, Cloud Storage for uploads,
Cloud Run for the AI backend. Client data access moves to a generated GraphQL
SDK.

No existing data is carried across. The cloud database starts empty and is
populated by new signups during testing.

## Current State (verified)

| Layer | Reality |
|---|---|
| Real database | Python SQLAlchemy + SQLite, `mini-services/tender-api/database.py` |
| Schema size | 20 tables, 28 foreign keys, many `ON DELETE CASCADE` |
| Data volume | 143 rows, 385 KB (stays local; never migrated) |
| Prisma | Boilerplate `User`/`Post` only. Nothing in `src/` imports `@/lib/db`. Dead scaffolding. |
| Backend | FastAPI, 106 routes, 4834 lines (`main.py`), 2000 lines AI (`ai_module.py`) |
| Auth | Custom bcrypt + HS256 JWT (`auth.py`), hardcoded fallback secret |
| Uploads | Local disk `uploads/`, served via `?XTransformPort=8000` through Caddy |
| Isolation | `Tender.created_by == user.id`. **No organisation/tenant layer.** |

### Findings that shape the plan

**`tenancy.py` is dead code.** It imports `Organisation` and `Membership` from
`database.py`; neither model exists. Verified by import — the module raises
`ImportError`. Nothing imports it, so it is inert. It is not a working feature
to preserve; the org layer it describes must be designed fresh.

**`auth.py:16` has a hardcoded fallback secret.** If `TENDERFLOW_SECRET` is
unset in any environment, signing and verification both use a secret committed
to the repo. This is a live vulnerability and is deleted when Firebase Auth
replaces it, regardless of hosting decisions.

**`next.config.ts:9` sets `typescript.ignoreBuildErrors: true`.** The Phase 2
endpoint port will surface type errors that this flag hides. Must be disabled
for the duration of the work.

## Decisions

| Decision | Choice | Rationale |
|---|---|---|
| Database | Firebase SQL Connect (Cloud SQL Postgres) | Keeps relational model, 28 FKs and CASCADE intact. User choice. |
| Data access | Full GraphQL via generated SDK | User choice. Removes 106 hand-written REST endpoints. |
| Auth | Firebase Auth | Removes bcrypt/JWT and the hardcoded secret. |
| Backend | FastAPI reduced to AI-only, on Cloud Run | 2000 lines of `ai_module.py` is the real asset; it ports unchanged. |
| Tenancy | Add a proper `Organisation` layer | Required for `@auth` rules to filter anything. Without it, all users read all companies' data. |
| Existing data | **Not migrated.** Cloud DB starts empty. | User choice: test accounts are created by signing up through the app. |
| Hosting | Firebase App Hosting or Cloud Run for Next.js | Removes Caddy and the `XTransformPort` hack. |

### Cost and plan requirement

SQL Connect requires the **Blaze** plan; it does not run on Spark. Cloud SQL
Postgres has a no-cost trial tier, then roughly $15/month at this scale. Blaze
means real billing. Uploads to Cloud Storage are billed per GB.

## Target Architecture

```
Next.js 16 (App Hosting or Cloud Run)
    │
    ├──► Firebase Auth ──► ID token
    │
    ├──► SQL Connect GraphQL ──► Cloud SQL Postgres
    │      generated SDK, @auth(level: USER)
    │      every query filtered by the caller's orgId
    │
    └──► Cloud Run: FastAPI (AI-only)
           ├─► ai_module.py ──► Gemini gemini-flash-latest
           ├─► verifies Firebase ID token via firebase-admin
           ├─► reads AI context via the same GraphQL queries
           └─► Cloud Storage (uploads, replaces local disk)
```

## Data Model Changes

### New: organisation layer

```graphql
type Organisation @table(key: ["id"]) {
  id: UUID! @default(expr: "uuidV4()")
  name: String!
  createdAt: DateTime! @default(expr: "request.time")
  members: [Membership!]!
}

type Membership @table(key: ["organisationId", "userId"]) {
  organisationId: UUID!
  userId: String!          # Firebase Auth uid, verbatim
  role: String!            # owner | admin | member
  joinedAt: DateTime! @default(expr: "request.time")
}
```

Every company-scoped table gains `organisationId: UUID!`:
`Tender`, `CompanyProfile`, `LibraryDocument`, `IssuerCompany`,
`BidderCompany`, `ReminderSetting`, `IssuedTender`.

### Identifier types

`users.id` is typed `String`, holding the Firebase Auth UID
verbatim rather than a surrogate key. Firebase UIDs are 28-character strings,
not UUIDs, so `auth.uid` comparisons are exact and need no translation.

All FK columns currently typed `Integer` referencing `users.id`
(`created_by`, `reviewed_by`, `user_id`) become `String`. Internal entity FKs
that do not reference `users` (e.g. `ChecklistItem.tender_id`) become `UUID` to
match their parent's new key type.

### Cascade behaviour

SQL Connect generates the Postgres DDL from the GraphQL schema, so
`ON DELETE CASCADE` is expressed through relationship cardinality and
`onDelete: CASCADE` on the relationship field, not raw SQL. Deletes cascade at
the database level exactly as they do in SQLite today.

### Existing tables

All 20 existing tables are declared as `@table` types, restructured onto UUID
primary keys and the org layer. Two columns are dropped rather than carried
over: `users.hashed_password`, because Firebase Auth owns credentials, and
`users.email`'s SQLite unique-index behaviour, replaced by a Postgres unique
constraint on the same column.

No table is populated from the local database. Every row in the cloud database
is created by the application or by a throwaway seed script.

## Authorization Model

Every query and mutation carries `@auth(level: USER)`.

SQL Connect exposes only `auth.uid`
directly; org membership is a join through `Membership`. Two options:

1. A custom resolver computes `auth.orgId` from `Membership` for the caller.
   Cleanest read expression, but adds a Cloud Functions dependency.
2. Queries filter on `organisationId` via a relationship traversal from
   `auth.uid`:

```graphql
query ListTenders @auth(level: USER) {
  user(id_expr: "auth.uid") {
    memberships {
      organisation {
        tenders { id referenceNumber title status closingDate }
      }
    }
  }
}
```

Option 2 is chosen: no custom resolvers, no extra service, and the filtering
is expressed structurally rather than by string expression. The trade-off is
that every query and mutation needs an equivalent membership traversal, and
mutations must resolve `organisationId` server-side rather than accept it as an
argument.

**The core security property of this work**: no query or mutation may
accept an `organisationId` from client input. If a query omits the membership
traversal entirely, it returns every organisation's data. Phase 1 exit
criteria therefore include an explicit cross-org read test.

Two-tier access:
- **Authenticated company users** — see all tenders in their organisation.
- **Public tender portal** (`/api/public/tenders`, `IssuedTender`) — reads via
  an unauthenticated query with `@auth(level: PUBLIC)`, exposing only
  published fields.

## Phased Plan

### Phase 1 — Cloud foundation

Goal: a working cloud Postgres with the schema, Firebase Auth, and registration
writing the org layer. Nothing depends on Python yet.

1. Enable Blaze plan; install and authenticate Firebase CLI.
2. `firebase init dataconnect` in project `tender-management-flow`.
3. Write `dataconnect/schema/schema.gql` — 20 existing tables plus
   `Organisation` and `Membership`, with UUID keys and the org layer.
4. Write `dataconnect/connector.yaml` — connector id, default auth level.
5. Write `.gql` queries and mutations covering reads needed by the AI context
   builder (`tender_with_context`, `company_profile`, `checklist_for_tender`,
   `generated_documents_for_tender`).
6. Deploy schema; provision Cloud SQL Postgres (same region as the SQL Connect
   instance).
7. Enable Firebase Auth: Email/Password provider only. No other providers.
8. Configure `dataconnect.yaml` with the service, instance and database names.
9. Seed script `scripts/seed-test-orgs.py` — creates two throwaway
   organisations (`Acme Test Co`, `Beta Test Co`), each with one member and one
   tender, using the Firebase Admin SDK. Its only purpose is proving cross-org
   isolation; it is not part of the app and is deleted after verification.

No data from the local SQLite database is migrated. Test accounts are created
by signing up through the app, which writes the `User`, `Organisation` and
`Membership` rows on registration.

Exit criteria: a newly signed-up user can run a GraphQL query returning their
newly created organisation. A member of `Acme Test Co` querying tenders
receives only Acme's tender and never `Beta Test Co`'s.

### Phase 2 — GraphQL data layer

Goal: all client data access goes through GraphQL. Largest phase.

1. Turn off `typescript.ignoreBuildErrors` in `next.config.ts`.
2. Complete the `.gql` query and mutation set for all 20 tables. Each of the
   106 FastAPI endpoints maps to one or more operations.
3. Generate the TypeScript SDK; commit generated output.
4. Rewrite `src/lib/api.ts` as a thin wrapper over the generated SDK,
   preserving its existing exported function names so components need no
   changes.
5. Replace token handling: drop `tenderflow_token` from `localStorage`, attach
   the Firebase ID token to SDK calls.
6. Replace `auth-context.tsx` and `auth-page.tsx` login/register flows with
   Firebase Auth SDK calls. Keep the same component interfaces.
7. Port `main.py` endpoints to `.gql` operations, entity by entity.
8. Delete ported endpoints from `main.py` as each is ported, so the codebase
   shrinks continuously rather than being cut over at the end.

Exit criteria: every dashboard tab functions against GraphQL. No component
still calls the FastAPI data endpoints.

### Phase 3 — AI backend, storage, deploy

Goal: FastAPI is AI-only and deployed; local disk is gone.

1. Slim `main.py` to AI endpoints only (~300 lines). Move all data access to
   the GraphQL context queries written in Phase 1. Python reads data through
   the SQL Connect GraphQL endpoint with a service account, not through
   SQLAlchemy — SQLAlchemy and `database.py` are deleted once no endpoint
   imports them.
2. `ai_module.py` unchanged except its data-source calls.
3. Replace `get_current_user` with Firebase ID token verification via
   `firebase-admin`. Delete `auth.py`'s JWT and bcrypt code entirely.
4. Move `uploads/` to Cloud Storage. Replace the
   `?XTransformPort=8000` URL hack with signed URLs.
5. Containerize FastAPI; deploy to Cloud Run.
6. Deploy Next.js to App Hosting or Cloud Run; configure the Firebase web config
   from `tender-management-flow` in client env vars. The web `apiKey` is
   public by design and safe to ship; access control lives in `@auth`
   directives and Cloud Storage rules.
7. Delete `Caddyfile`, `mini-services/tender-api/*.sh` supervisor scripts,
   `.zscripts/` deployment helpers, the Prisma scaffolding
   (`prisma/schema.prisma`, `src/lib/db.ts`), `database.py`, `tenancy.py`
   (superseded by the GraphQL org layer), the local `tender.db`, and the
   `db:*` npm scripts.
8. Update `.env` — remove `TENDERFLOW_SECRET`, add Firebase service-account
   credentials and Cloud Storage bucket reference.

Exit criteria: the app is reachable at a public URL, all data in Cloud SQL,
all uploads in Cloud Storage, AI features functional.

## Error Handling

| Condition | Behaviour |
|---|---|
| Unauthenticated GraphQL call | `@auth` rejects; SDK throws, client redirects to login |
| Caller not a member of the target org | Membership traversal yields no rows, not an error |
| Cloud Run → Cloud SQL connection limit | Pool sized per instance; max instances set in deploy config |
| Gemini 429 / 503 | Existing retry in `_gemini_post` (2 retries, backoff) |
| Missing Firebase ID token on Cloud Run | 401 from `firebase-admin` verification |
| Signed URL expiry | Regenerate on request rather than persisting |

## Testing

1. **Phase 1**: signup through Firebase Auth creates a matching `User`,
   `Organisation` and `Membership` row. A member of one seeded org querying
   tenders receives only that org's rows, verified against the second seeded
   org.
2. **Phase 2**: `tsc --noEmit` clean with `ignoreBuildErrors` off. Each ported
   entity exercised through the dashboard UI.
3. **Phase 3**: deployed URL, real upload round-trip, one live AI call per
   generation type.

## Out of Scope

- Firebase Analytics (the `measurementId` in the provided config is unused).
- Realtime query subscriptions (available in SQL Connect, not needed yet).
- Any change to AI prompt text or the Gemini integration completed earlier.
- Migrating any local SQLite data. The cloud database starts empty.
- Historical `docs/superpowers/plans/` and `tool-results/` records.
