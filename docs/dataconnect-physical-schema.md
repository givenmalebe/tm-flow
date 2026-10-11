# Data Connect physical schema (Cloud SQL Postgres)

Reference for the FastAPI service, which reads and writes the tables that
Firebase Data Connect owns. Generated from `information_schema` on the live
`tmflow` database (instance `tender-management-flow:europe-west1:tmflow-db`).

Regenerate with:

    cd mini-services/tender-api
    python tools/inspect_dc_schema.py

## Naming conventions

- Every table is **`public.<singular snake_case>`** — the type name lowercased:
  `user`, `organisation`, `membership`, `tender`, `tender_document`,
  `library_document`, `briefing`, `pricing_version`, `submission`,
  `communication`, `addendum`, `generated_document`, `company_profile`,
  `issuer_company`, `company_member`, `issued_tender`, `bid`, `bid_document`,
  `bidder_company`, `bidder_member`, `checklist_item`, `reminder_setting`.
- Columns are **`snake_case`** versions of the schema field names.
- Primary keys are `uuid` columns with `default uuid_generate_v4()`, **except**
  `user.id` which is `text` and holds the Firebase Auth UID verbatim.
- `membership` has a composite key: `(organisation_id, user_id)`.
- Foreign keys follow **`{parent_singular}_id`**: `tender_id`, `organisation_id`,
  `company_id`, `bid_id`, `user_id`, `linked_library_doc_id`.
- Timestamps are `timestamp with time zone`. `created_at` has no default in the
  DB itself — Data Connect sets it from `request.time`, so direct SQL inserts
  must supply it (use `now()`).
- No metadata table lives in `public`.

## `user`

| column                 | type          | notes                          |
| ---------------------- | ------------- | ------------------------------ |
| `id`                   | `text` PK     | Firebase Auth UID              |
| `email`                | `text` NN     | unique (declared in schema)    |
| `full_name`            | `text` NN     |                                |
| `company_name`         | `text`        |                                |
| `role`                 | `text` NN     | default `'admin'`              |
| `account_type`         | `text` NN     | default `'applicant'`          |
| `onboarding_completed` | `boolean` NN  | default `false`                |
| `created_at`           | `timestamptz` NN |                             |

## Full table set

```
public.addendum            public.membership
public.bid                 public.organisation
public.bid_document        public.pricing_version
public.bidder_company      public.reminder_setting
public.bidder_member       public.submission
public.briefing            public.tender
public.checklist_item      public.tender_document
public.communication       public.user
public.company_member      public.company_profile
public.generated_document  public.issued_tender
public.issuer_company      public.library_document
```

## Foreign keys

```
addendum.tender_id                 -> tender.id
bid.tender_id                      -> issued_tender.id
bid_document.bid_id                -> bid.id
bidder_company.organisation_id     -> organisation.id
bidder_member.company_id           -> bidder_company.id
briefing.tender_id                 -> tender.id
checklist_item.tender_id           -> tender.id
checklist_item.linked_library_doc_id -> library_document.id
communication.tender_id            -> tender.id
company_member.company_id          -> issuer_company.id
company_profile.user_id            -> user.id
company_profile.organisation_id    -> organisation.id
generated_document.tender_id       -> tender.id
issued_tender.company_id           -> issuer_company.id
issuer_company.organisation_id     -> organisation.id
library_document.organisation_id   -> organisation.id
membership.organisation_id         -> organisation.id
membership.user_id                 -> user.id
pricing_version.tender_id         -> tender.id
submission.tender_id               -> tender.id
tender.organisation_id             -> organisation.id
tender_document.tender_id          -> tender.id
```

## Access

Data Connect enforces `@auth` in its GraphQL layer, not with Postgres RLS, so
direct SQL access is unrestricted at the database level. Both callers must
enforce tenancy themselves:

- Frontend: the `@auth` directives and membership traversals in the connector.
- FastAPI: its existing scope checks (`ai_agent.resolve_scope`, `_scope_filter`).

Database logins use Cloud SQL IAM auth (no passwords):

- `youthdevelopers4ir@gmail.com` — local dev / tooling.
- `tmflow-api@tender-management-flow.iam` — the Cloud Run service account.

Both hold `USAGE` on schema `public` and `SELECT/INSERT/UPDATE/DELETE` on all
tables (see `tools/grants.sql`). Data Connect's own service account owns the
objects. Re-run the grants if a Data Connect deploy recreates tables.
