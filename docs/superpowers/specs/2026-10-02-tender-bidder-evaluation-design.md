# Tender Bidder Evaluation & Tracking Design Spec
Date: 2026-10-02
Status: Draft (Pending Approval)

## 1. Overview

Add competitive bidding evaluation capabilities to TM Flow. Track multiple bidders per tender, manage required qualification documents, evaluate bids using AI-driven analysis, and report on tender outcomes with financial metrics.

Key features:
- Track bids received from multiple companies per tender
- AI-powered document qualification checking (compliance, certification validity, expiry)
- AI-driven best bidder determination with reasoning
- Required documents management (extract from tender, reference doc, library templates)
- Bidder submission tracking with individual file mapping to requirements
- Analytics: tender counts, applications received, net amount of successful tenders

## 2. Goals

1. Enable tracking of all bidders responding to a tender with their submissions
2. Automate qualification checking using AI to validate documents meet requirements, are certified, not expired
3. AI-driven bidder evaluation with transparent reasoning (no fixed weights - fully AI-driven per D)
4. Maintain audit trail of evaluation decisions
5. Provide executive reporting on successful tenders and total awarded amounts
6. Integrate seamlessly with existing TM Flow UI/UX (emerald theme, shadcn/ui)

## 3. Non-Goals

- e-Procurement portal for external bidders to submit (internal evaluation tool only)
- Complex weighted scoring formulas (fully AI-driven as specified)
- Bidder versioning v2 (start simple, single submission per bidder initially)
## 4. Data Model

### 4.1 TenderBidder
Track bidders who have submitted responses to a tender.

- id (PK)
- tender_id (FK -> Tender, cascade delete)
- company_name (required, indexed)
- contact_name, contact_email, contact_phone
- registration_number, vat_number, bbbbee_level
- bid_amount (decimal/float, nullable) - total bid value
- currency (default ZAR)
- submitted_at (datetime)
- is_compliant (bool, default null - pending evaluation)
- compliance_score (0-100, AI evaluated)
- technical_score (0-100, AI evaluated, nullable)
- overall_score (0-100, AI evaluated)
- evaluation_status (enum: pending, evaluating, evaluated, needs_review)
- evaluation_summary (text, AI reasoning for top bidder determination)
- evaluation_details (JSON - structured AI analysis)
- is_top_bidder (bool, default false)
- rank (int, nullable - 1 = best)
- awarded (bool, default false)
- notes (text)
- created_at, updated_at

### 4.2 TenderBidderDocument (Required docs mapping)
Maps required documents to bidder-submitted files with compliance status.

- id (PK)
- bidder_id (FK -> TenderBidder, cascade)
- requirement_name (required) - e.g., "Tax Clearance Certificate", "BBBEE Certificate"
- requirement_category (optional, matches Library categories)
- is_required (bool, default true)
- status (enum: missing, received, compliant, non_compliant, expired, under_review)
- filename, file_path, original_filename, file_size, file_type
- issue_date, expiry_date (extracted by AI)
- is_certified (bool, nullable - AI determined)
- compliance_notes (text, AI explanation)
- ai_checked (bool, default false)
- ai_check_result (JSON - detailed validation)
- created_at, updated_at

### 4.3 TenderRequiredDocument (Tender-level requirements)
Defines what documents are required for this tender's qualification.

- id (PK)
- tender_id (FK -> Tender, cascade)
- name (required)
- category (optional, Library category)
- description (optional)
- is_mandatory (bool, default true)
- reference_source (enum: extracted_from_tender, uploaded_ref_doc, library_template, manual)
- source_file_path (optional - ref doc used)
- order_index (int)
- created_at, updated_at

### 4.4 TenderEvaluation (AI evaluation run)
Track AI evaluation runs for audit trail.

- id (PK)
- tender_id (FK -> Tender)
- evaluation_type (enum: document_qualification, full_evaluation, top_bidder)
- status (running, completed, failed)
- prompt_used (text, truncated)
- result (JSON - full AI response)
- reasoning (text)
- top_bidder_id (FK -> TenderBidder, nullable)
- evaluated_by (system/user)
- created_at, completed_at
## 5. Backend API Design (FastAPI)

### 5.1 Models (database.py)
Add models: TenderBidder, TenderBidderDocument, TenderRequiredDocument, TenderEvaluation
- Use proper relationships: Tender has many bidders, bidders have many documents, tender has many required docs
- Cascade deletes
- JSON fields for AI results
- Enums via strings or Python Enum

### 5.2 API Endpoints (main.py)
Base under /api/tenders/{tender_id}

**Required Documents:**
- GET /tenders/{tender_id}/required-documents - list requirements
- POST /tenders/{tender_id}/required-documents - add manual requirement
- PUT /required-documents/{req_id} - update requirement
- DELETE /required-documents/{req_id} - delete
- POST /tenders/{tender_id}/required-documents/extract-from-tender - AI extract from tender docs
- POST /tenders/{tender_id}/required-documents/from-reference - upload ref doc, AI parse
- POST /tenders/{tender_id}/required-documents/from-library - generate from Library categories

**Bidders:**
- GET /tenders/{tender_id}/bidders - list all bidders with docs
- POST /tenders/{tender_id}/bidders - add bidder manually
- GET /bidders/{bidder_id} - get bidder details
- PUT /bidders/{bidder_id} - update bidder info (amount, etc.)
- DELETE /bidders/{bidder_id} - delete bidder

**Bidder Documents:**
- POST /bidders/{bidder_id}/documents - upload bidder submission docs (bulk or individual)
- DELETE /bidder-documents/{doc_id} - delete
- PUT /bidder-documents/{doc_id}/match-requirement - manually match to requirement

**AI Evaluation:**
- POST /tenders/{tender_id}/bidders/evaluate-documents - AI check all bidder docs for compliance
- POST /tenders/{tender_id}/bidders/evaluate - full AI evaluation to determine top bidder(s)
- POST /tenders/{tender_id}/bidders/{bidder_id}/evaluate - evaluate single bidder
- POST /tenders/{tender_id}/bidders/set-top-bidder - manually set/override top bidder
- POST /tenders/{tender_id}/bidders/{bidder_id}/mark-awarded - mark as awarded

**Analytics:**
- GET /analytics/tenders-summary - returns: total_tenders, active_tenders, successful_tenders (awarded), total_applications_received (sum of bidders across tenders), total_awarded_amount (sum of bid_amount for awarded bidders), tenders_by_status, recent_awards
## 6. AI Integration (ai_module.py)

Extend ai_module.py with new functions:

### 6.1 extract_required_documents(tender_id, reference_doc_path=None)
AI extracts required qualification documents from:
1. Tender documents (primary tender file, scope of work, evaluation criteria)
2. Optional reference document uploaded
Returns structured list with names, categories, mandatory flags, descriptions

### 6.2 evaluate_bidder_documents(bidder_id)
For each bidder document, check:
- Matches requirement (name/category)
- Document completeness and validity
- Is certified? (looks for cert numbers, signatures, stamps, issuer)
- Not expired? (extracts expiry dates, compares to today)
- Meets requirements? (content analysis)
Returns compliance status per doc + overall compliance, scores, notes

### 6.3 evaluate_top_bidder(tender_id)
AI-driven evaluation considering:
- Bid amounts, compliance, technical merit from documents
- Any evaluation criteria in tender
- Provides overall ranking with reasoning, identifies top bidder(s)
- Returns structured: ranked_bidders[], top_bidder_id, reasoning, confidence

Use existing z-ai CLI pattern (subprocess with JSON instructions).

## 7. Frontend Design (matching existing UI)

Add new tab "Bidders" or extend Submissions? Better add "Bidders" tab for clarity - separate from our own submissions.

### 7.1 Navigation
Add to dashboard-shell NAV_ITEMS: { id: "bidders", label: "Bidders", icon: Users, description: "Bidder responses & evaluation" }

### 7.2 New Tab Component: bidders-tab.tsx
Follow existing tab patterns (tenders-tab, submissions-tab). Emerald theme, cards, skeletons, dialogs.

Sections:
1. Header with title, subtitle, Refresh
2. Stats cards: Total Bidders, Compliant, Non-Compliant, Pending Evaluation, Top Bidders (Awarded)
3. Tender selector (if viewing all) or context-aware when tender selected
4. For selected tender: Required Documents panel (collapsible), AI actions
5. Bidders list (cards/tables) with ranking, compliance badges, top bidder badge (gold/emerald)
6. Evaluation panel with AI buttons, reasoning display

### 7.3 Key UI Elements
- Required Documents section: "Extract from Tender", "Upload Reference Doc", "Generate from Library", "Add Manual"
- AI Evaluate Documents (per bidder/all) - loading state with spinner
- "Find Top Bidder (AI)" button - runs full evaluation, shows reasoning in modal
- Bidder card: company name, rank badge (#1), Top Bidder emerald badge, compliance score (progress), bid amount, status
- Document compliance chips: Compliant (emerald), Expired (rose), Missing (amber), Non-compliant (rose)
- Analytics tab additions: Dashboard can show "Total Applications Received", "Awarded Amount", "Success Rate"

### 7.4 UI Consistency
Match existing patterns: StatCard with tinted icons, EmptyState, Card hover effects, emerald primary, amber/rose for warnings, skeleton loading, toast feedback.
## 8. Implementation Plan (High-Level)

### Phase 1: Backend Models & DB
1. Add models to database.py (TenderBidder, TenderBidderDocument, TenderRequiredDocument, TenderEvaluation)
2. Add Pydantic schemas to main.py
3. Create tables (auto-created on startup)

### Phase 2: Backend API Endpoints
1. Required documents CRUD + extraction endpoints
2. Bidders CRUD
3. Bidder documents upload/matching
4. AI evaluation endpoints
5. Analytics endpoint

### Phase 3: AI Module Extensions
1. extract_required_documents
2. evaluate_bidder_documents
3. evaluate_top_bidder
4. Handle errors, timeouts, structured JSON responses

### Phase 4: Frontend
1. Add "bidders" tab to NAV_ITEMS in dashboard-shell.tsx
2. Create bidders-tab.tsx component (~800-1000 lines)
3. Add API methods to api.ts for bidders/required docs/evaluation
4. Update Dashboard tab if needed to show analytics

### Phase 5: Integration & Testing
1. Test AI extraction with sample tender
2. Test document evaluation flow
3. Test top bidder determination
4. UI polish, responsive design

## 9. Technical Considerations

- File storage: bidder documents go to uploads/bidders/{bidder_id}/
- JSON for AI results - preserve full reasoning for audit
- Large file uploads (multiple docs per bidder) - use FormData
- AI timeouts: evaluation may take 30-90s, show loading with progress messages
- Permissions: follows existing auth (JWT)
- Backward compatible - no breaking changes to existing models

## 10. Success Criteria

1. Can add bidders manually or as they submit
2. AI extracts required docs from tender with reasonable accuracy
3. AI evaluates bidder docs for compliance (certified, not expired, meets reqs)
4. AI determines top bidder with clear reasoning
5. UI follows existing design language
6. Analytics show applications received and awarded amounts correctly

## 11. Open Questions / Decisions

- Do we need to track multiple bids per bidder (revisions)? Currently specified V1 - single submission. Keep simple.
- Should "top bidder" allow ties? AI should indicate if tied with reasoning.
- Awarded amount - use bidder.bid_amount when marking awarded? Yes.
- Currency - ZAR default, but allow flexibility.

## 12. Approval Required

This design needs user approval before proceeding to implementation (writing-plans). Key additions: 4 new DB models, ~20 new API endpoints, 3 AI functions, 1 new tab component. Matches requested scope.

Status: Ready for review and approval.
