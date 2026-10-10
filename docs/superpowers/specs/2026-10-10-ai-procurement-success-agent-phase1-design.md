# AI Procurement Success Agent — Phase 1 (Per-Org AI Foundation + Briefing) — Design

Date: 2026-10-10
Status: Approved design, pending implementation plan

## 1. Vision

Turn the AI Tender Assistant into each organisation's dedicated "procurement success agent":

- It knows everything about the company (data snapshot + persisted chat history + success profile).
- When the user opens the AI Assistant tab, it greets them with an engaging briefing: tenders and funding closing soon, and which opportunities the company can realistically pursue.
- It researches tenders and funding online (on demand in Phase 1; autonomously in Phase 2).
- Every organisation's AI is isolated: its data, memory, research and briefings are never shared with another organisation.

## 2. Decisions (from brainstorming)

| Question | Decision |
|---|---|
| Sequencing | Foundation first (this phase), autonomous researcher second (Phase 2) |
| "Unique AI per org" | Same Gemini model for all; per-org isolated context + memory. Shared platform API key. Per-org keys possible later, out of scope |
| Briefing location | In the existing AI Assistant tab, as a greeting card above the chat |
| "Funding" meaning | Both: general business funding programmes (SEFA, SEDA, IDC, NYDA, NEF, dtic, industry grants) AND tender-specific finance (bridging finance, PO funding), shown separately |
| AI memory | Full chat history persistence (team-visible) + structured company success profile |
| Architecture | Approach A: company-scoped AI brain with stored opportunities, cached narrative, on-demand "Research now" |

## 3. Current state & the isolation hole

- Backend tenancy root: `BidderCompany` + `BidderMember` (approval workflow). `/api/tenders` and `/api/library` scope by `created_by IN (approved member ids)` (main.py:726-735, 1498-1506).
- **`_build_full_system_context` (main.py:3231) is unscoped**: `db.query(Tender).all()` and `db.query(LibraryDocument).all()` feed EVERY company's tenders, documents, pricing, briefings, communications and compliance library into the AI prompt for any logged-in user. This is the data-sharing hole this phase closes.
- The AI context also lacks the caller's `CompanyProfile` — the AI doesn't know the company's own identity today.
- `tenancy.py` (`Organisation`/`Membership`) is dead code — imports models that don't exist in `database.py` and is never imported by `main.py`. Not used; left alone (cleanup out of scope).
- Frontend chat is ephemeral (React state, lost on tab switch).
- Gemini plumbing: `ai_module.discover_tenders` already does scraper + Google Search grounding; `_gemini_web_search` exists. Free-tier quota (~20 req/day/model) constrains design; current live model is `gemini-3.5-flash` via env var on Cloud Run.
- Deployment constraint: Firebase Hosting rewrite proxy cuts off at ~60s; Cloud Run service `tmflow-api`, SQLite on mounted volume.

## 4. Scope resolution (the backbone)

New helper in `main.py`:

```
_resolve_scope(db, user) -> Scope
Scope = {company_id: int|None, company_name: str|None, member_ids: [int]}
```

1. Look up the user's approved `BidderMember` row → company scope (`member_ids` = approved members of that company).
2. No company → solo scope: `member_ids = [user.id]`. Data is filtered as `created_by == user.id` — never "all rows".

**Company bootstrap (get every real user into a company):**
- On `/api/auth/complete-onboarding` and lazily in `_resolve_scope`: if the user has no approved membership, is not an issuer, and has a `company_name` → create a `BidderCompany` with that name and an approved admin `BidderMember`.
- If a `BidderCompany` with the same name already exists (case-insensitive), do NOT auto-merge — the user stays solo-scoped and can use the existing join-with-approval flow. Two strangers typing the same company name must never share data.

## 5. Data model (new tables, all in `database.py`)

All rows are created with the caller's scope (`company_id` set for company scope, `company_id NULL` + `user_id` for solo). All reads filter by scope.

### ai_chat_messages
Persisted chat per scope, visible to the whole team.
`id, company_id (FK bidder_companies.id, nullable, index), user_id (FK users.id, nullable — assistant rows have none), role ("user"|"assistant"), content (Text), error (bool), context_tenders (int, nullable), created_at`

### ai_company_memory
One row per scope (get-or-create; app-level uniqueness by scope).
`id, company_id (nullable, index), user_id (nullable), mission (Text), goals (JSON list of strings), preferences (Text), last_briefing_text (Text), last_briefing_at (DateTime), updated_at`

### ai_research_runs
Audit trail of research runs; Phase 2's scheduler reuses this.
`id, company_id, user_id, query (Text), status ("running"|"complete"|"failed"), tenders_found (int), funding_found (int), finance_found (int), error (Text), created_at, finished_at (DateTime, nullable)`

### ai_opportunities
Research findings per scope.
`id, company_id (nullable, index), user_id (nullable, index), run_id (FK ai_research_runs.id, nullable), type ("tender"|"funding"|"finance"), title (String 500), provider (String 500 — client or funder), category (String 255), location (String 255), closing_date (Date, nullable), description (Text), url (String 1000), source_site (String 255), reference_number (String 255), estimated_value (String 255), match_score (int 0-100, nullable), match_reason (Text), status ("new"|"seen"|"imported"|"dismissed", default "new"), imported_tender_id (FK tenders.id, nullable), created_at, updated_at`

Dedup within scope: by `url` when present, else by lowercased `title` (first 200 chars). A re-research updates existing rows' `match_score`/`closing_date` instead of duplicating; rows already `imported`/`dismissed` keep their status.

## 6. Isolation fix

`_build_full_system_context(db, user, tender_id)` becomes scope-aware:
- `Tender.created_by IN (scope.member_ids)`; `LibraryDocument.created_by IN (scope.member_ids)` — mirroring the established pattern.
- Adds `company_profile` (the caller's `CompanyProfile`) and `ai_memory` (success profile) and a compact list of stored `ai_opportunities` to the context — so the AI knows its company and its found opportunities.
- Focus-tender check (`tender_id`) verifies the tender belongs to the scope; otherwise ignored.

## 7. Endpoints (all in `main.py`, all `Depends(get_current_user)`, all scope-filtered)

| Endpoint | Purpose |
|---|---|
| `GET /api/ai/briefing` | The greeting payload (below). No Gemini on the hot path when cached |
| `POST /api/ai/research` | On-demand hunt (§9). Soft 50s deadline; persists whatever is found |
| `GET /api/ai/chat-history?limit=50` | Scope's messages, oldest-first |
| `DELETE /api/ai/chat-history` | Clears the scope's stored chat (team-wide; UI copy says so) |
| `GET /api/ai/memory` | Success profile (mission, goals, preferences) |
| `PUT /api/ai/memory` | Update success profile; regenerates cached narrative |
| `POST /api/ai/opportunities/{id}/import` | Creates a `Tender` (status "Interested", source URL in notes) via the existing import-discovered logic; sets `status="imported"`, `imported_tender_id` |
| `POST /api/ai/opportunities/{id}/dismiss` | Sets `status="dismissed"` |

`POST /api/ai/assistant` (existing) additionally: saves user message + answer to `ai_chat_messages`; injects the last ~20 scope messages into the prompt for continuity.

### Briefing response shape

```json
{
  "scope": {"company_id": 3, "company_name": "Example Security"},
  "narrative": "...",                // cached AI greeting or template fallback
  "narrative_generated_at": "2026-10-10T08:00:00Z",
  "closing_soon": [
    {"id": 1, "reference_number": "E137", "title": "...", "closing_date": "2026-10-14",
     "days_left": 4, "status": "Preparing", "readiness_pct": 60,
     "expiring_docs": ["B-BBEE certificate"]}
  ],
  "opportunities": {
    "tenders":  [ {"id": 9, "title": "...", "provider": "...", "closing_date": null,
                   "days_left": null, "match_score": 82, "match_reason": "...",
                   "url": "...", "source_site": "security.co.za", "status": "new"} ],
    "funding":  [ {"id": 12, "type": "funding", "title": "...", "provider": "SEFA",
                   "match_score": 74, "match_reason": "...", "status": "new"} ]
  },
  "last_research_at": "2026-10-10T06:30:00Z",
  "memory": {"mission": "...", "goals": ["..."], "preferences": "..."}
}
```

- `closing_soon`: the scope's own tenders with a future `closing_date`, sorted by days-left; `readiness_pct` = checklist items `Complete / total`, or `null` when the tender has no checklist; `expiring_docs` = library documents expiring before that tender closes.
- `opportunities`: stored `ai_opportunities` with `status` in (`new`, `seen`) and (future closing date or none), tenders and funding shown separately, sorted by `match_score` desc then days-left asc.
- `narrative`: generated by one Gemini call when stale (>12h) or missing — also regenerated when research completes or memory is updated. On Gemini failure → deterministic template built from the facts (company name, counts, top urgent item). The briefing endpoint never fails because of Gemini.

## 8. Briefing narrative generation (`ai_module.generate_briefing`)

One `_gemini_chat` call: input = scope facts (closing soon list, opportunity counts, top matches, readiness), company profile, success profile. Output: 3-6 sentence engaging first-person coach greeting — greets by company name, states its mission ("my job is to make {company} win"), highlights the 3 most important actions (most urgent tender, best funding match, readiness risk). Plain text. Prompt mirrors the existing ASSISTANT_SYSTEM tone. Fallback template covers quota/outage.

## 9. Research engine (`POST /api/ai/research`)

1. Create `AIResearchRun` (status "running") with query built from the company profile (industry/services keywords, location).
2. **Tender hunt**: `ai_module.discover_tenders(category, keywords, location)` — existing scrapers, run in a thread pool (parallel) to fit the 60s proxy budget.
3. **Funding hunt** (new `ai_module.discover_funding(company_profile)`): `_gemini_web_search` with two query families, each structured by a `FUNDING_DISCOVER_SYSTEM` prompt into the opportunity schema:
   - Business funding programmes: "business funding grants loans incentives SMME South Africa open for applications {industry} {current year}"
   - Tender finance: "tender bridging finance purchase order funding South Africa"
   - Fields: funder, funding type, amount range, eligibility, closing date (if any), URL.
4. **Match scoring — one batched Gemini call** (`ai_module.score_opportunities`): all findings + company profile (industry, services, B-BBEE, PSIRA, size, location) → JSON array of `{index, score 0-100, reason}` keyed by input index (no hallucinated keys). Failures → score left NULL, opportunity still stored.
5. Dedup + upsert into `ai_opportunities` (§5 rules). Mark run complete with counts + regenerate the briefing narrative.
6. Soft deadline ~50s: return whatever is collected; partial results persist.

## 10. Assistant persona v2 (`ASSISTANT_SYSTEM` upgrade)

- Identity: "You are {Company}'s dedicated procurement success AI. Your mission is to make this company win tenders and secure the funding it needs."
- Context additions: company profile, success profile (mission/goals/preferences), recent chat history, stored opportunity summary ("You recently found 4 tenders and 2 funding programmes for this company…").
- Funding domain knowledge: SEFA, SEDA, IDC, NYDA, NEF, dtic incentives, municipal programmes; bridging & purchase-order finance; typical eligibility (B-BBEE, registration, turnover).
- Same coaching tone, deadline-focus, honesty rules as today.

## 11. Frontend (`AssistantTab`)

On mount: parallel `getBriefing()` + `getChatHistory()`.

**BriefingCard** above the chat (dismissible per session):
- Greeting narrative; "Closing soon" rows (days-left badge color-coded red/amber/green, readiness %, `Open` → existing `setTab("tenders")` + `selectTender(id)` navigation); "Funding for you" and "Tenders found for you" cards (title, provider, closing, match-score chip, match reason, actions: `Import` / `Dismiss` / `Ask AI`); footer "Last researched {x}h ago" + **Research now** button (spinner, then refetch briefing).
- `Ask AI` pre-fills the chat input: "Tell me about {title} and how we can win/qualify for it."

Chat: renders persisted history on mount ("Earlier messages" divider), Clear button now clears team history (with confirmation copy), everything else unchanged.

`api.ts` additions: `getBriefing`, `runResearch`, `getChatHistory`, `clearChatHistory`, `getMemory`, `updateMemory`, `importOpportunity`, `dismissOpportunity`.

## 12. Error handling

| Failure | Behaviour |
|---|---|
| Gemini down / quota exhausted | Briefing: template narrative. Chat: existing error bubble + retry. Research: run marked failed, UI retry. Scoring: score NULL, opportunity still stored, shown unranked |
| Research exceeds 50s soft deadline | Finalize with collected results; persisted for later briefings |
| Import fails | Toast with backend message (existing pattern) |
| No opportunities yet | BriefingCard shows "I haven't researched for you yet" + prominent Research now CTA |
| Cross-scope access attempt (import/dismiss another scope's row) | 404 |

## 13. Testing

- **pytest (existing `tests/` infra, SQLite in-memory)**:
  - Isolation: two companies + one solo user; `_build_full_system_context` contains only each caller's tenders/library; chat history, opportunities, memory invisible cross-scope; import/dismiss of another scope's row → 404.
  - Bootstrap: auto-create company on first scope resolution; exact-name collision → no auto-merge.
  - Briefing facts: closing_soon ordering, readiness %, expiring docs, template fallback.
  - Opportunities: dedup by url/title, re-research updates not duplicates, imported/dismissed statuses preserved.
- **ai_module unit tests (mocked `_gemini_post`)**: funding result structuring/validation, batch scoring validation (index-keyed), briefing narrative + fallback text.
- **Live verification**: deploy Cloud Run + Hosting; on the live site — briefing renders, Research now returns real tenders + funding, import works, chat persists across reload; a second test company confirms the AI sees nothing of the first.

## 14. Out of scope (Phase 2 and later)

- Autonomous scheduled research (Cloud Scheduler → secured endpoint; warm instance), email/push digests, per-org API keys, proactive in-app notifications, and richer auto-maintained memory (AI proposing profile updates). All build directly on `ai_research_runs`/`ai_opportunities`/`ai_company_memory`.
- Deleting or rewiring the dead `tenancy.py`.

## 15. Risks & mitigations

- **Free-tier quota (~20 req/day)**: research ≈ 2-4 calls/run, narrative 1 call/12h — a handful of users per day is fine; the template fallback keeps the product functional when dry. Durable fix (billing on the key) remains the user's call.
- **60s Firebase Hosting proxy**: parallel scrapers + soft 50s deadline; Phase 2 background research removes the limit from the user path entirely.
- **SQLite single-writer**: research threads only read web + write once at the end; no concurrency risk beyond existing patterns.
- **Scraper rot**: funding discovery leans on Gemini search grounding (not brittle per-site parsers); scrapers stay best-effort as today.
