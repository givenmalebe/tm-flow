# Gemini Flash Migration + Trends Data Logo

**Date:** 2026-10-09
**Status:** Approved for implementation

## Goal

1. Replace the z.ai AI backend with Google Gemini (`gemini-flash-latest`).
2. Add the Trends Data circular logo as the product logo across the app.

## Context

All AI functionality lives in the Python FastAPI backend at
`mini-services/tender-api/ai_module.py` (1917 lines). It does not call z.ai
over HTTP — it shells out to the `z-ai-web-dev-sdk` Node CLI via `subprocess`
and parses a JSON file the CLI writes to a temp path.

Critically, **all 40+ AI call sites funnel through just two functions**:

- `_run_zai_chat(prompt, system=None, max_tokens=8000) -> str`
- `_run_zai_web_search(query, num=10) -> List[Dict[str, Any]]`

This is the seam. Only these two functions need rewriting; every prompt,
system prompt, JSON-fence-stripping path, and error branch stays byte-identical.

## Decisions

| Decision | Choice | Rationale |
|---|---|---|
| Transport | Direct HTTPS to `generativelanguage.googleapis.com` via `httpx` | `httpx` is already in `requirements.txt`. No new dependency. |
| Model | `gemini-flash-latest` | User request. Verified to resolve to `gemini-3.8-flash`. |
| Function naming | Rename to `_gemini_chat` / `_gemini_web_search` | No z.ai references survive the migration. |
| Prompt compat | `system` param -> `systemInstruction` field | Gemini supports native system instructions. |
| Search grounding | `tools: [{"google_search": {}}]` | Direct replacement for z.ai's `web_search` function. |
| Retry | One retry on HTTP 429 with 5s backoff | Free-tier keys are rate-limited (observed during testing). |
| Logo placement | Logo icon **beside** the "TM Flow" wordmark (user decision) | Keeps product identity; logo fills the icon slot. |
| Sidebar subtitle | Keep "AI Tender Management" (user decision) | Minimal change. |

## Known Constraint: Search Grounding Is Quota-Limited

The supplied key is on a tier where `google_search` grounding returns
`429 RESOURCE_EXHAUSTED`. Plain text generation works fine.

This is **not** a blocker: `discover_tenders()` in `ai_module.py` already runs
Python scrapers (`scraper.scrape_all`) against real SA tender portals *first*,
and only calls AI web search as a top-up when scrapers return fewer results than
requested. With grounding returning `[]`, discovery degrades to scrapers-only.
All callers already tolerate an empty search result.

`_gemini_web_search` returns `[]` on any error — same contract as before.

## Implementation

### 1. `mini-services/tender-api/ai_module.py`

- Remove `Z_AI_CLI`, the `tempfile`/`subprocess` imports.
- Add `GEMINI_API_KEY` from `os.environ`, `GEMINI_MODEL = "gemini-flash-latest"`,
  `GEMINI_ENDPOINT` base URL.
- Add `_gemini_post(payload, timeout)` — shared `httpx.post` with retry-on-429.
- `_gemini_chat`: build `{contents, systemInstruction, generationConfig}`.
  Return concatenated `candidates[0].content.parts[*].text`. Raise
  `RuntimeError` on non-200, matching the old failure contract.
- `_gemini_web_search`: add `tools:[{"google_search":{}}]`, parse
  `groundingMetadata.groundingChunks` into `[{title, url, snippet}]`. Return
  `[]` on any failure.
- Rename all 40+ call sites in this file.

### 2. `mini-services/tender-api/main.py`

- Rename the 2 external references at lines ~2168 and ~2183.

### 3. `package.json` / `.gitignore`

- Remove the `z-ai-web-dev-sdk` dependency.
- Remove the `.z-ai-config` gitignore line.

### 4. `.env`

- Add `GEMINI_API_KEY=<key>`. `.gitignore` already covers `.env*`, so the key
  is never committed.

### 5. Logo

- `public/7trendz logo.jpg` is the source asset (verified byte-identical to the
  image the user supplied).
- One-off `sharp` script trims the opaque white border and writes
  `public/logo.png` with an alpha channel. Required — an opaque white square
  renders as a visible block in dark mode.
- Wire into:
  - `src/app/layout.tsx` — favicon (`icons.icon`)
  - `src/components/dashboard/dashboard-shell.tsx` — desktop header + mobile sheet
  - `src/components/auth-page.tsx` — split-screen logo
  - `src/components/onboarding.tsx` — header
  - `src/components/issuer/issuer-portal.tsx` — headers
- Replaces the `FileStack`/`FileText` lucide placeholders. Product wordmark
  "TM Flow" stays in all cases.

### 6. Docs cleanup

- `pdf-report/generate_body.py` — 12 z.ai references in generated PDF prose.
- `src/app/api/[...path]/route.ts:147` — comment about z.ai CLI call timeouts.

## Error Handling

| Condition | Behaviour |
|---|---|
| Missing `GEMINI_API_KEY` | `RuntimeError` at call time; callers return `_error` or empty |
| HTTP 429 | One retry after 5s, then raise |
| HTTP 5xx / network | `RuntimeError` -> caller's existing error path |
| Search grounding 429 | `[]` (degrades to scraper-only discovery) |
| Empty `candidates` | `RuntimeError` |

Existing callers already wrap in `try/except` and surface `_error`, so no new
error plumbing is needed.

## Testing

1. `python -c "import ai_module"` — module imports, no stale symbols.
2. Direct call to `_gemini_chat("Say OK")` — returns text.
3. `npm run lint` and `tsc --noEmit` — no frontend regressions.
4. Dev server returns HTTP 200 on `/`.
5. Logo renders with transparency (verified via sharp alpha channel check).

## Out of Scope

- Changing any prompt or system prompt text.
- Replacing the Python tender scrapers.
- Vendor-specific text still present in historical `docs/superpowers/plans/`
  and `tool-results/` files — those are records of past work, left intact.
