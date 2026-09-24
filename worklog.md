# TenderFlow - Tender Management System Worklog

## Project Overview
Building a full-stack Tender Management System with:
- **Backend**: Python FastAPI + SQLAlchemy + SQLite (port 8000)
- **Frontend**: Next.js 16 + TypeScript + shadcn/ui (port 3000)
- **AI**: z-ai-web-dev-sdk CLI for document reading, assistant, summaries

## Architecture Decisions
- Python backend runs as a mini-service on port 8000
- All frontend API requests use `?XTransformPort=8000` to route through Caddy gateway
- JWT auth with bcrypt password hashing
- SQLite database stored at `mini-services/tender-api/tender.db`
- File uploads stored at `mini-services/tender-api/uploads/`
- AI features: Python backend shells out to `z-ai` CLI (chat + vision)

## Task IDs Plan
- Task 1: Python backend foundation (myself)
- Task 2: Python backend API endpoints (myself)
- Task 3: Frontend foundation - API client, auth context (myself)
- Task 4-a: Landing page (subagent)
- Task 4-b: Auth page (subagent)
- Task 5: Dashboard shell + all tabs (myself + subagents)

---
Task ID: 0
Agent: Main Orchestrator
Task: Initial planning and worklog setup

Work Log:
- Explored existing Next.js project structure
- Verified Python 3.12 + FastAPI + uvicorn + pdfplumber + pypdf available
- Installed sqlalchemy, python-jose, passlib, bcrypt
- Verified z-ai CLI available at /home/z/my-project/node_modules/.bin/z-ai
- Created worklog.md

Stage Summary:
- Environment ready. Starting Python backend build next.

---
Task ID: 1
Agent: Main Orchestrator
Task: Build Python FastAPI backend with SQLAlchemy, JWT auth, all tender management models, AI integration

Work Log:
- Created mini-services/tender-api/ with package.json
- database.py: SQLAlchemy models for User, Tender, TenderDocument, ChecklistItem, LibraryDocument, Briefing, PricingVersion, Submission, Communication, Addendum, ReminderSetting
- auth.py: JWT auth with bcrypt direct (passlib had bcrypt 5.x compat issue)
- ai_module.py: z-ai CLI subprocess wrappers for extraction, summary, addendum change detection, assistant
- main.py: Full FastAPI app with all routes - auth, tenders CRUD, documents, checklist, library, briefings, pricing, submissions, communications, addendums, dashboard, AI assistant
- Started uvicorn on port 8000, verified health endpoint works
- Verified user registration creates JWT token correctly

Stage Summary:
- Backend fully operational on port 8000
- All API endpoints under /api/* prefix
- File uploads stored in uploads/ subdirectories
- AI features shell out to z-ai CLI for chat completions
- DB at mini-services/tender-api/tender.db (fresh, no mock data)
- Ready for frontend integration. Frontend must use ?XTransformPort=8000 for API calls

---
Task ID: 4
Agent: frontend-styling-expert
Task: Build landing page component

Work Log:
- Read worklog.md and explored project structure (shadcn/ui components, globals.css emerald theme, package.json deps)
- Verified framer-motion, lucide-react, and all needed shadcn primitives (Button, Card, Badge, Accordion, Sheet) are available
- Created /home/z/my-project/src/components/landing-page.tsx — a single self-contained "use client" component implementing the LandingPage({ onGetStarted, onSignIn }) API
- Built all 12 required sections: sticky nav with mobile Sheet menu, hero with CSS dot-grid background + gradient text + mock dashboard card, stats bar, 16-feature grid, 4-step "How it works" with connecting line, AI-highlight emerald-tinted section with mock extracted JSON card, deadline reminder ladder (30/14/7/3/1 days), testimonial quote card with emerald accent border, 2-tier pricing (Starter/Pro with Most popular badge), 6-Q&A FAQ accordion, emerald gradient final CTA band, multi-column footer with mt-auto
- Used framer-motion `whileInView` with `viewport={{ once: true }}` for scroll reveals, staggered children for grids
- All auth-bound buttons call onGetStarted or onSignIn (never anchor links to /auth)
- Used only emerald/teal/amber/rose accent colors — no indigo or blue anywhere
- Verified with `bun run lint` — clean, zero errors

Stage Summary:
- Artifact: /home/z/my-project/src/components/landing-page.tsx (~880 lines)
- Self-contained: no external image URLs, all visuals built from divs + lucide icons + Tailwind
- Reuses shadcn/ui Button, Card, Badge, Accordion, Sheet — no new primitives created
- Sticky-footer layout via `min-h-screen flex flex-col` + `mt-auto` footer
- Responsive mobile-first; mobile nav uses Sheet with hamburger trigger
- Ready to be wired into a route (e.g. /) with onGetStarted/onSignIn navigating to /auth

---
Task ID: 5
Agent: frontend-styling-expert
Task: Build auth page component

Work Log:
- Read worklog.md (Task 4 landing page) to inherit visual language: emerald/teal theme, FileText-in-rounded-square logo, "Tender<span class=text-primary>Flow</span>" wordmark, soft shadows + rounded-2xl cards, framer-motion staggered reveals
- Audited available shadcn primitives (Button, Card, Input, Label, Tabs, Checkbox, Alert, Tooltip) and confirmed framer-motion, sonner, lucide-react already wired (SonnerToaster mounted in app/layout.tsx)
- Confirmed useAuth() API surface from src/lib/auth-context.tsx (login, register) — no direct api.ts calls used
- Created /home/z/my-project/src/components/auth-page.tsx as a single "use client" component implementing the AuthPage({ initialMode, onBack, onSuccess }) API
- Built split-screen layout: md+ left panel (emerald→teal gradient, dot-grid + 2 blurred floating circles, logo, headline, 3 feature bullets with ScanText/ListChecks/CalendarClock icons, Quote testimonial with mt-auto); right panel centered form card on neutral bg with ghost Back button
- Sign In form: email (Mail icon) + password (Lock icon, Eye/EyeOff toggle) inside a real <form>; "Forgot password?" rendered as a no-op button wrapped in a Tooltip showing "Coming soon"; inline rose-600 errors with role="alert"
- Sign Up form: Full name (User), Company name optional (Building2), Email, Password, Confirm password, Terms checkbox (required); all validation (email regex, ≥6 chars, password match, terms required) implemented with controlled-state errors cleared on tab switch
- Auth integration: handleSignIn / handleSignUp call useAuth().login/register, then onSuccess(); on error show both sonner toast.error AND an Alert component (AnimatePresence height animate) above the form
- Sign-up success micro-animation: SubmitButton swaps to a spring-animated CheckCircle2 + "Account created" for 800ms (window.setTimeout) before onSuccess() fires — tasteful, not gimmicky
- Submit buttons carry aria-busy while loading and Loader2 spinners; Enter in any field submits via native form onSubmit
- Tabs component driven by `mode` state synced with initialMode; switchMode() clears all errors and serverError
- Trust badge "Secured by JWT · bcrypt password hashing" with ShieldCheck icon under the card
- Helper subcomponents (IconInput, PasswordInput, FieldWithError, SubmitButton, LeftPanel) keep the main component readable; total ~580 lines
- Verified with `bun run lint` (clean) and `bunx tsc --noEmit` (only pre-existing errors in gitignored examples/ and skills/ directories — auth-page.tsx is clean)

Stage Summary:
- Artifact: /home/z/my-project/src/components/auth-page.tsx (~580 lines, single "use client" component)
- Real backend integration via useAuth() — no mocks, no direct api calls
- Visual consistency with landing page maintained (same logo treatment, emerald palette, soft shadows, rounded-2xl, framer-motion reveals)
- Fully responsive (md: split-screen, mobile: form-only), accessible (Label htmlFor everywhere, role="alert" errors, aria-busy buttons, shadcn Tabs for keyboard nav), no external image URLs
- Ready to be wired into /auth route with <AuthPage initialMode="signin" onBack={() => router.push("/")} onSuccess={() => router.push("/dashboard")} />

---
Task ID: 7
Agent: frontend-styling-expert
Task: Build dashboard overview tab

Work Log:
- Read worklog.md (Tasks 0–5) to inherit the emerald/teal visual language, soft-shadow cards, and TenderFlow component conventions; audited shared context files (src/lib/api.ts dashboard() return shape, src/lib/dashboard-store.ts helpers: formatDate, formatCurrency, statusColor, deadlineColor, useDashboardStore.setTab/selectTender)
- Verified all required shadcn primitives are present: Card suite, Button, Badge, Skeleton, Alert, Progress (used Skeleton + Alert for loading/error states)
- Replaced the stub at src/components/dashboard/tabs/dashboard-tab.tsx with a single "use client" DashboardTab() component that calls api.dashboard() on mount via useEffect, with useState for data/loading/refreshing/error
- Built page header: "Dashboard" title + subtitle, ghost Refresh button (with spinning RefreshCw while refreshing) that re-fetches, and primary "New Tender" button → setTab("tenders")
- Built 4 KPI cards in a responsive grid (1/2/4 cols): Active Tenders (FileStack, emerald), Closing This Week (CalendarClock, amber), Documents Expiring (FolderClock, rose, sums docs_expiring_soon + docs_expired), Awarded This Year (Trophy, emerald). Each card has a tinted icon square, big tabular-nums number (en-ZA thousands separators), label, and subtitle. Loading shows 4 KpiSkeleton cards mirroring the layout.
- Built 3-column responsive layout: left column (lg:col-span-2) stacks Tender Status Breakdown (top 8 statuses from status_counts, horizontal div bars colored via statusBarColor with width proportional to count/maxCount, count column right-aligned), Tenders Closing This Week (max-h-80 overflow-y-auto scrollbar-thin list; each row clickable → openTender(id) which does setTab("tenders") + setTimeout 50ms selectTender(id); shows reference_number + statusColor badge + title + client · closing date + deadline badge colored red ≤1d, amber ≤3d, emerald >3d using deadlineBadgeClass + deadlineLabel; empty state with CheckCircle2 "No tenders closing this week — you're on top of things."), Awarded This Year (list with reference_number, title, client, formatCurrency(estimated_value) in emerald; empty state "No awards yet this year. Keep submitting!")
- Right column (lg:col-span-1) stacks: Next Deadline card (emerald border highlight when next_deadline exists; tinted emerald countdown box with big tabular-nums days_remaining number colored via deadlineColor, reference_number, title, closing date + deadline label; "Open tender" button → openTender(id); empty state when null), Document Alerts card (max-h-64 scroll list of docs_expiring_list with category badge + name + expiry date + days badge colored rose if expired, amber if ≤30d, emerald otherwise via docExpiryLabel; "Manage library" outline button → setTab("library"); empty state when no docs), Quick Actions card (2x2 grid of outline buttons: New Tender → tenders, Upload Document → library, Upcoming Briefings → briefings, Ask AI → assistant, each with tinted primary icon + label)
- Built bottom Recent Activity placeholder: dashed-border Card with Sparkles icon in tinted primary square, "Activity feed coming soon" headline, full message "Activity feed coming soon. Use the AI Assistant to ask about your tenders.", and an outline "Ask AI Assistant" button → setTab("assistant")
- Error state: Alert (variant="destructive") with AlertTriangle, error message, and an outline "Try again" button calling fetchData()
- Emerald theme throughout (no blue/indigo for chrome — status bar colors do use the semantic palette from statusColor which includes sky/amber/rose for non-emerald statuses, matching the existing helper). Verified with `bun run lint` — the only 2 reported errors are pre-existing in src/app/page.tsx and src/components/dashboard/dashboard-shell.tsx (react-hooks/set-state-in-effect); dashboard-tab.tsx is clean. Also ran `bunx tsc --noEmit` — no errors in the new file.

Stage Summary:
- Artifact: /home/z/my-project/src/components/dashboard/tabs/dashboard-tab.tsx (~817 lines, single "use client" component, fully self-contained)
- Real backend integration via api.dashboard() — no mocks
- Reuses shadcn/ui Card/Button/Badge/Skeleton/Alert + lucide-react icons + Zustand store helpers (formatDate, formatCurrency, statusColor, deadlineColor)
- Fully responsive (KPI: 1/2/4 cols; body: 1-col stack on mobile, 3-col grid on lg with left col-span-2; all lists use scrollbar-thin with max-heights)
- Loading state mirrors real layout with Skeletons; error state has retry; empty states for every list with tasteful CheckCircle2/Trophy/FileStack icons
- Tender navigation matches dashboard-shell pattern: useDashboardStore.getState().setTab("tenders") + setTimeout 50ms selectTender(id)
- Ready to be rendered by dashboard-shell.tsx (already wired via DashboardTabView import)

---
Task ID: 9-10
Agent: frontend-styling-expert
Task: Build library-tab + briefings-tab

Work Log:
- Read worklog.md (Tasks 0–7) to inherit the emerald/teal visual language, soft-shadow cards, KPI card pattern, EmptyState helper, and the openTender navigation pattern (setTab("tenders") + setTimeout 50ms selectTender(id)); audited shared context: src/lib/api.ts (LIBRARY_CATEGORIES export, listLibrary/uploadLibraryDocument/updateLibraryDocument/deleteLibraryDocument, listBriefings/createBriefing/updateBriefing/deleteBriefing/listTenders), src/lib/dashboard-store.ts (formatDate, daysUntil, useDashboardStore.getState), and the backend main.py endpoints to confirm exact request/response contracts (library update uses query params and ignores empty-string dates; briefing list returns tender_reference/tender_title/client + ISO date + "HH:MM" time; BriefingUpdate has no tender_id field so tender is read-only in edit mode)
- Replaced the stub at src/components/dashboard/tabs/library-tab.tsx with a single "use client" LibraryTab() component: fetches all library docs once via api.listLibrary() on mount (no server-side filter params, so stats stay accurate); computes 3 stats from the full list (Total / Expiring Soon ≤30d / Expired) shown as StatCards with Files/CalendarClock/FileWarning icons in emerald/amber/rose tinted squares; client-side category Select filter + search Input (filters name/description/category) with a Clear button; documents grouped by category preserving LIBRARY_CATEGORIES order, each group rendered as a responsive 1/2/3-col grid of DocumentCards; each card shows FileText icon + name + category badge + status badge (Active=emerald/Expiring Soon=amber/Expired=rose), description (line-clamp-2), issued/expires dates with a colored "time left" badge, file size (KB/MB formatted), and Download (anchor to /uploads/{filename}?XTransformPort=8000, new tab)/Edit/Delete actions; Upload/Edit Dialog with name (required) + category Select (required) + description Textarea + issue/expiry date inputs (helper "Leave blank if non-expiring") + notes Textarea + file input (required for new; edit mode shows current filename read-only with note "Delete & re-upload to replace" since the PUT endpoint doesn't accept files); AlertDialog delete confirmation (rose action button); loading skeletons mirror the layout; error Alert + retry; empty state with FolderCheck icon + upload CTA; no-docs-match empty state for filtered views; toast.success/error via sonner; refetch after upload/edit/delete
- Replaced the stub at src/components/dashboard/tabs/briefings-tab.tsx with a single "use client" BriefingsTab() component: fetches all briefings via api.listBriefings(false, 30) on mount; computes 3 stats from the full list (Total / Upcoming next 30d / Attendance unconfirmed) shown as StatCards with ListChecks/CalendarClock/AlertTriangle icons; Tabs filter "All" | "Upcoming (30 days)" + search Input (filters tender_reference/title/client/location); briefings sorted ascending by date and grouped by date with a heading showing formatted date + relative badge (Today/Tomorrow/In X days/Xd ago, colored rose ≤1d / amber ≤3d / emerald else) + item count; each BriefingCard shows a clickable tender button (MapPin icon + mono reference + title, opens tender via setTab("tenders")+selectTender) + type badge (Briefing=emerald/Site Inspection=amber) + client + a tinted details grid (date/time/location/contact/person attending) + attendance badges (required=emerald/optional=muted; confirmed=emerald check/unconfirmed=muted x) + expandable notes (line-clamp-2 + Show more/less) + Edit/Delete actions; if attendance_required && !attendance_confirmed && date within 7 days, an amber alert strip "Attendance confirmation required!" renders at the top of the card with an amber border; Add/Edit Dialog fetches tenders on open via api.listTenders(), with a tender Select (listed as "REF — Title", disabled save + amber notice when no tenders exist), type Select (Briefing/Site Inspection), date (required) + time inputs, location + contact person inputs, person attending input, attendance_required + attendance_confirmed Switches in a bordered grid, notes Textarea; edit mode shows the tender as read-only info (BriefingUpdate has no tender_id); AlertDialog delete confirmation; loading skeletons; error Alert + retry; empty states (MapPin icon + add CTA; no-match for filter/search); toast feedback; refetch after create/update/delete
- Both files reuse the dashboard-tab visual language verbatim: StatCard with 11×11 tinted icon square + tabular-nums value, EmptyState with 14×14 rounded-2xl icon, Card hover:shadow-md, emerald primary throughout (no blue/indigo chrome — only semantic amber/rose for warnings/expired states), scrollbar-thin on scrollable/dialog content, AlertDialogAction in rose for destructive confirms, ghost Refresh button with spinning RefreshCw, header with title + subtitle + action buttons
- Verified with `bun run lint` — the only 2 reported errors are pre-existing in src/app/page.tsx and src/components/dashboard/dashboard-shell.tsx (react-hooks/set-state-in-effect, same as noted in Task 7); library-tab.tsx and briefings-tab.tsx are clean. Also ran `bunx tsc --noEmit` — no errors in either new file.

Stage Summary:
- Artifacts: /home/z/my-project/src/components/dashboard/tabs/library-tab.tsx (~950 lines) and /home/z/my-project/src/components/dashboard/tabs/briefings-tab.tsx (~1180 lines), both single "use client" components, fully self-contained, already wired into dashboard-shell.tsx via LibraryTab/BriefingsTab imports
- Real backend integration via the shared api client — no mocks; client-side filtering for instant UX with stats computed from the full unfiltered list
- Emerald theme throughout (semantic amber/rose only for expiry/warning states); fully responsive (1/2/3-col grids, mobile-first header stacks); accessible (Label htmlFor on every field, sr-only action labels, AlertDialog for destructive ops, Switch with id+Label)
- Both tabs are ready to use end-to-end: upload/edit/delete compliance docs with file download, and schedule/edit/delete briefings with attendance tracking + tender cross-navigation

---
Task ID: 11-12
Agent: frontend-styling-expert
Task: Build pricing-tab + submissions-tab

Work Log:
- Read worklog.md (Tasks 0–10) to inherit the emerald/teal visual language, soft-shadow cards, KPI/StatCard pattern, EmptyState helper, and the openTender navigation pattern (setTab("tenders") + setTimeout 50ms selectTender(id)); audited shared context: src/lib/api.ts (listTenders, listPricing, createPricing, deletePricing, saveSubmission, updateTender, TENDER_OUTCOMES export), src/lib/dashboard-store.ts (formatDate, formatDateTime, formatCurrency, statusColor, useDashboardStore.getState), src/components/dashboard/tabs/dashboard-tab.tsx for visual consistency reference, and backend main.py to confirm exact request/response contracts (PricingVersionCreate accepts tender_id + optional version_label + line_items [{category, description, quantity, rate, total}] + optional notes; backend auto-calculates subtotal/VAT(15%)/total and auto-increments version_number; SubmissionCreate accepts all-optional fields with tender_id required and POSTs create-or-update; list_tenders returns tender.submission as null or full submission object — submission_date is ISO date string, submission_time is "HH:MM"; TenderUpdate accepts outcome + unsuccessful_reason as optional fields)
- Replaced the stub at src/components/dashboard/tabs/pricing-tab.tsx with a single "use client" PricingTab() component: fetches all tenders on mount via api.listTenders({sort:"updated_at", order:"desc"}) and populates a tender Select dropdown ("Select a tender…"); when no tender is selected, shows a dashed-border EmptyState card with Calculator icon + hint "Select a tender to view or create pricing versions"; when a tender is selected, shows an emerald-tinted tender info banner (reference_number, status badge via statusColor, title, client + "New Pricing Version" primary button that opens a Dialog), a 3-card stats row (Pricing Versions count with Hash icon, Latest Version Total with Receipt icon, Sum of All Versions with Calculator icon — all emerald/amber themed with tabular-nums values), and a list of version cards sorted by version_number descending; each VersionCard is collapsible (default first card expanded) with header showing emerald "v{n}" badge + version_label + created datetime (formatDateTime), an expanded body containing a line-items Table (category badge, description, qty, rate via formatCurrency, total via formatCurrency) with subtotal/VAT(15%)/Total in a 3-col grid where the Total is in a bordered emerald box with text-2xl emerald-700, optional notes section, and AlertDialog delete confirmation (rose action button); New Pricing Version Dialog contains version_label optional input, a line items editor Table with Select per row (Labour/Equipment/Consumables/Transport/Other), Description Input, Qty + Rate number inputs that auto-calc total = qty × rate (lineTotal helper with 2-decimal rounding), a remove X button per row (disabled when only 1 row), an "Add line item" outline button, a live Subtotal/VAT(15%)/Total preview in the same emerald-bordered style, optional Notes textarea, and a Save button with Loader2 spinner + hasAnyItem validation (filters out empty rows on save); after create/delete refetches versions via fetchVersions(selectedTenderId); toast.success/error feedback; loading skeletons (header + tender Select + 3 stats + 2 version card skeletons); error Alert + retry; tender-empty Alert if no tenders exist
- Replaced the stub at src/components/dashboard/tabs/submissions-tab.tsx with a single "use client" SubmissionsTab() component: fetches all tenders via api.listTenders on mount, then filters client-side via isSubmissionTracked helper (tender.submission !== null OR status in Submitted/Awarded/Unsuccessful/Withdrawn OR outcome not Pending); 4-card stats row (Total Submitted/FileStack-emerald, Pending Outcome/Hourglass-amber, Awarded/Trophy-emerald, Unsuccessful/XCircle-rose — all tabular-nums with sublabels); filter bar with search Input (filters reference_number/title/client_company/submission.submitted_by/submission.confirmation_reference) + outcome Select (All + TENDER_OUTCOMES from api.ts); submissions list shows count "Showing X of Y submissions" then SubmissionCard per tender; each SubmissionCard has a header row with clickable mono reference_number (opens tender via setTab("tenders")+selectTender) + status badge (statusColor) + clickable title + client + an outcome Badge (Awarded=emerald-600/solid, Unsuccessful=rose, Withdrawn=muted, Pending=amber, each with an OutcomeIconRender icon) and right-aligned final_pricing in emerald via formatCurrency with "final pricing" sublabel; a 2×4 details grid (Submitted date+time, Method, Submitted by, Days since with amber color when >60d) inside a muted/20 bordered box; a confirmation_reference row with a CopyButton (clipboard + toast + Check icon feedback); an optional notes row with TooltipProvider/Tooltip for overflow; an expandable unsuccessful_reason panel (rose-tinted border, line-clamp-2 with "Show more/less" when >100 chars); and an actions row with "Set Outcome" (Settings2 icon) + "Edit Submission" (Pencil icon) outline buttons; Edit Submission Dialog pre-fills from tender.submission (or tender.person_responsible for submitted_by fallback) with date/time inputs, method Select (Email/Online Portal/Physical Delivery/Courier/E-procurement portal/Other), submitted_by Input, confirmation_reference Input, final_pricing number Input, notes Textarea, Save button with Loader2 spinner — calls api.saveSubmission(tenderId, payload) with undefined for empty fields; Set Outcome Dialog shows current outcome Badge, outcome Select (Pending/Awarded/Unsuccessful/Withdrawn), Unsuccessful requires reason textarea (rose border + error toast if empty), Awarded has optional award value notes field (clearly noted "not stored on the tender" since TenderUpdate has no dedicated award_value field) — calls api.updateTender(id, {outcome, unsuccessful_reason}); both dialogs refetch via fetchTenders(true) on success; loading skeletons (header + 4 stats + 3 submission card skeletons); error Alert + retry; empty states for no-tenders-at-all (Send icon) vs no-filter-match (Search icon)
- Both files reuse the dashboard-tab visual language verbatim: StatCard with 11×11 tinted icon square + tabular-nums value, EmptyState with 14×14 rounded-2xl icon, Card hover:shadow-md, emerald primary throughout (no blue/indigo chrome — only semantic amber/rose for warning/unsuccessful states), scrollbar-thin on dialog content, AlertDialogAction in rose for destructive confirms, ghost Refresh button with spinning RefreshCw, header with title + subtitle + Refresh action button. Refactored the outcome-icon lookup from a `const OutcomeIcon = outcomeIcon(outcome)` function-call pattern to a dedicated `<OutcomeIconRender outcome={outcome} className=... />` subcomponent declared outside the main component to satisfy the react-hooks/static-components rule (avoids "Cannot create components during render"). Also made outcomeBadgeClass/normalizeOutcome/OutcomeIconRender accept `string | null | undefined` to handle the nullable `tender.outcome` field cleanly
- Verified with `bun run lint` — the only 2 reported errors are pre-existing in src/app/page.tsx and src/components/dashboard/dashboard-shell.tsx (react-hooks/set-state-in-effect, same as noted in Tasks 7 and 9-10); pricing-tab.tsx and submissions-tab.tsx are clean. Also ran `bunx tsc --noEmit` — no errors in either new file.

Stage Summary:
- Artifacts: /home/z/my-project/src/components/dashboard/tabs/pricing-tab.tsx (~720 lines) and /home/z/my-project/src/components/dashboard/tabs/submissions-tab.tsx (~780 lines), both single "use client" components, fully self-contained, already wired into dashboard-shell.tsx via PricingTab/SubmissionsTab imports
- Real backend integration via the shared api client — no mocks; client-side filtering for submissions (include tender if has submission record OR status is Submitted/Awarded/Unsuccessful/Withdrawn OR outcome is not Pending)
- Emerald theme throughout (semantic amber for Pending, rose for Unsuccessful, emerald for Awarded, muted for Withdrawn); fully responsive (stats: 1/2/4 cols on submissions, 1/3 cols on pricing; dialogs max-w-2xl/4xl with overflow-y-auto + scrollbar-thin); accessible (Label htmlFor on every field, sr-only-style icon-only buttons with aria-label, AlertDialog for destructive deletes, Tooltip for long notes)
- Both tabs are ready to use end-to-end: build multi-version pricing sheets with live VAT totals per tender, and record/edit submissions + set outcomes (Awarded/Unsuccessful/Withdrawn with required reason) with copy-to-clipboard confirmation references and days-since tracking

---
Task ID: 13-14
Agent: frontend-styling-expert
Task: Build clarifications-tab + addendums-tab

Work Log:
- Read worklog.md (Tasks 0–12) to inherit the emerald/teal visual language, soft-shadow cards, StatCard/EmptyState patterns, and the openTender navigation pattern (setTab("tenders") + setTimeout 50ms selectTender(id)); audited shared context: src/lib/api.ts (listTenders, createCommunication, deleteCommunication, createAddendum, analyzeAddendum, deleteAddendum), src/lib/dashboard-store.ts (formatDate, formatDateTime, useDashboardStore.getState), src/components/dashboard/tabs/dashboard-tab.tsx + pricing-tab.tsx + submissions-tab.tsx for visual consistency reference, and backend main.py + ai_module.py to confirm exact request/response contracts (tender_to_dict serializes communications without tender_id and addendums without tender_id/file_path — so both must be enriched during flattening on the client; CommunicationCreate accepts tender_id + optional subject/body/comm_date/from_party/to_party/notes + required comm_type; create_addendum uses Form fields addendum_number?, title (req), description?, issued_date?, file (req); ai_analyze_addendum returns the raw changes dict from detect_addendum_changes which may include _error on failure; ADDENDUM_SYSTEM JSON schema matches the task spec)
- Replaced the stub at src/components/dashboard/tabs/clarifications-tab.tsx with a single "use client" ClarificationsTab() component: fetches all tenders via api.listTenders({sort:"updated_at", order:"desc"}) on mount, flattens each tender's communications[] array into a single list while attaching tender_id + tender_reference + tender_title; sorts newest-first by comm_date then id; 4-card stats row (Total Communications/MessageSquare-emerald, Clarification Requests/HelpCircle-amber, Meetings/Users-cyan, Extensions/Clock-orange) all tabular-nums; filter bar with type Select (All + the 10 COMM_TYPES) + search Input (filters subject/body/tender reference+title/from+to parties); vertical timeline list where each entry has an absolute-positioned 9×9 tinted circular icon node (color varies by type via commTypeIconClass) connected by a 1px vertical line (skipped on the last entry), a Card with header row showing the comm type badge (commTypeBadgeClass) + subject, a clickable tender reference button (Building2 icon + mono reference + truncated title → openTender), date+parties row, expandable body (line-clamp ~240 chars with Show more/less toggle), optional dashed notes box, and an AlertDialog delete confirmation (rose action button); Log Communication Dialog with tender Select (required, renders "REF — Title" items), type Select (required, all 10 COMM_TYPES), datetime-local date input defaulting to now, subject Input, from/to Inputs, body Textarea (5 rows), notes Textarea (3 rows), Save button with Loader2 spinner + tender-required validation; after create/delete refetches via fetchTenders(true); toast.success/error feedback; loading skeletons (header + 4 stats + filter bar + 4 timeline cards); error Alert + retry; empty states for no-tenders (MessageSquare icon) vs no-communications (MessageSquare icon + Log CTA) vs no-filter-match (Search icon); toDatetimeLocalValue helper for the date input
- Replaced the stub at src/components/dashboard/tabs/addendums-tab.tsx with a single "use client" AddendumsTab() component: fetches all tenders via api.listTenders on mount, flattens each tender's addendums[] array into a single list while attaching tender_id + tender_reference + tender_title + tender_status; sorts newest-first by created_at→issued_date→id; 3-card stats row (Total Addendums/FileStack-emerald, Analyzed/Sparkles-teal counting those with ai_changes and no _error, Pending Analysis/Hourglass-amber counting those without ai_changes) all tabular-nums; search Input (filters title/description/addendum_number/tender reference+title); addendums list of AddendumCard components, each with a header row showing addendum_number badge (emerald solid) + title + Analyzed/Analysis-failed status badge, a clickable tender reference button (Building2 icon + mono reference + truncated title → openTender), a meta row with issued date + uploaded datetime + Download link (only when file_path present, `/uploads/{file_path}?XTransformPort=8000`, new tab), optional description, and an AI Changes section that branches on ai_changes state: (a) if ai_changes exists with _error → destructive Alert with the error message + "Retry analysis" outline button calling api.analyzeAddendum(id); (b) if ai_changes exists without _error → emerald-tinted panel with a Sparkles header and a responsive 1/2-col grid of ChangeList sections: new_requirements (emerald checkmarks), removed_requirements (rose x marks), changed_pricing (amber neutral bullets), changed_scope (fuchsia neutral bullets), changed_submission (cyan neutral bullets), other_changes (muted bullets); a Changed dates Table with Field/From/ArrowRight/To columns where the To cell is emerald; and a summary box in an emerald-tinted rounded panel; (c) if no ai_changes → a dashed bordered box with Wand2 icon + "Not analyzed yet" message + a Tooltip-wrapped "Analyze with AI" primary button that calls api.analyzeAddendum(id) with a loading spinner and is disabled while analyzing (TooltipContent: "This may take 30–60 seconds"); AlertDialog delete confirmation (rose action button); Upload Addendum Dialog with tender Select (required, "REF — Title" items), addendum_number Input (optional), title Input (required), description Textarea (optional), issued_date date input (optional), and a custom file upload dropzone label (rounded dashed border, emerald hover, shows FileDiff icon + filename + size when selected or Upload icon + "Click to upload / PDF, DOC, DOCX, TXT" when empty) with a hidden Input type=file accept=".pdf,.doc,.docx,.txt"; Save button with Loader2 spinner + tender/title/file validation; build FormData with the typed fields + file and POST via api.createAddendum; after create/delete/analyze refetches via fetchTenders(true); toast feedback including a loading toast ("Running AI change detection…" with "This may take 30–60 seconds" description) that resolves to success/error based on the analyzeAddendum result; loading skeletons; error Alert + retry; empty states for no-tenders (FileDiff icon) vs no-addendums (FileDiff icon + Upload CTA) vs no-filter-match (Search icon)
- Refactored the communication type icon lookup from a `const Icon = commTypeIcon(...)` then `<Icon />` pattern (which tripped react-hooks/static-components — "Cannot create components during render") to a dedicated `<CommTypeIconRender type={...} className={...} />` subcomponent declared outside the main component, mirroring the OutcomeIconRender pattern used in submissions-tab.tsx (Task 11-12). The addendums-tab file did not have this issue (its icons are static lucide imports used directly)
- Both files reuse the dashboard-tab/pricing-tab/submissions-tab visual language verbatim: StatCard with 11×11 tinted icon square + tabular-nums value, EmptyState with 14×14 rounded-2xl icon, Card hover:shadow-md, emerald primary throughout (no blue/indigo chrome — semantic amber/rose/orange/cyan only for type-coded badges and warning states), scrollbar-thin on dialog content, AlertDialogAction in rose for destructive confirms, ghost Refresh button with spinning RefreshCw, header with title + subtitle + Refresh + primary action button. Verified with `bun run lint` — the only 2 reported errors are pre-existing in src/app/page.tsx and src/components/dashboard/dashboard-shell.tsx (react-hooks/set-state-in-effect, same as noted in Tasks 7, 9-10, 11-12); clarifications-tab.tsx and addendums-tab.tsx are clean. Also ran `bunx tsc --noEmit` — no errors in either new file (remaining errors are in gitignored examples/, skills/, and unrelated dashboard-shell.tsx TendersTab/AssistantTab imports).

Stage Summary:
- Artifacts: /home/z/my-project/src/components/dashboard/tabs/clarifications-tab.tsx (~720 lines) and /home/z/my-project/src/components/dashboard/tabs/addendums-tab.tsx (~750 lines), both single "use client" components, fully self-contained, already wired into dashboard-shell.tsx via ClarificationsTab/AddendumsTab imports
- Real backend integration via the shared api client — no mocks; flatten-on-client strategy (fetch all tenders, concat their communications/addendums arrays) since there is no dedicated list endpoint for either resource
- Emerald theme throughout (semantic amber/rose for warnings, cyan/teal/violet/fuchsia/orange only for type-coded badges); fully responsive (stats: 1/2/4 cols on clarifications, 1/3 cols on addendums; dialogs max-w-2xl with overflow-y-auto + scrollbar-thin; timeline cards and addendum cards stack gracefully on mobile); accessible (Label htmlFor on every field, sr-only-style icon-only buttons with aria-label, AlertDialog for destructive deletes, Tooltip on the AI Analyze button explaining the 30-60s wait)
- Both tabs are ready to use end-to-end: log emails/clarifications/meetings/extensions against any tender with full audit trail + delete; upload addendum PDFs/DOCs with structured metadata, run AI change detection that surfaces new/removed requirements, changed dates (with from→to table), changed pricing/scope/submission and a plain-English summary, with retry on failure

---
Task ID: 15
Agent: frontend-styling-expert
Task: Build AI assistant tab

Work Log:
- Read worklog.md (Tasks 0–14), api.ts, dashboard-store.ts, dashboard-tab.tsx and globals.css to align with the emerald theme, scrollbar-thin utility, animate-fade-in pattern, and existing visual language (Card, Badge, Skeleton, KPI styling).
- Verified available shadcn primitives (select, sheet, textarea, avatar, alert, skeleton, card, badge, button) and deps (framer-motion, sonner, lucide-react) in package.json.
- Overwrote the stub at src/components/dashboard/tabs/assistant-tab.tsx with a full ChatGPT-lite style AI chat interface (~908 lines, single "use client" component, no props):
  - Two-section layout: 1/3 left rail (context + suggested questions) + 2/3 main chat area; left rail collapses to a Sheet on mobile via a PanelLeft toggle in the chat header.
  - Left rail: Bot-icon header, optional tender focus Select (loaded via api.listTenders, "All tenders" + every tender option, emerald "Focused" badge with Clear (X) button), Suggested questions card (all 9 prescribed questions as clickable chips with ArrowRight hover micro-interaction), and a Stats footer card showing total tenders + "The AI has access to your full tender database."
  - Main chat: header bar with emerald-gradient Bot avatar (pulses while loading), "TenderFlow AI" title, Ready/Thinking status badge, "Powered by your tender data" subtitle, "Clear chat" ghost button (rose hover) on the right.
  - Messages area: dotted radial-gradient background (very light emerald) with top/bottom card-colored fade for depth, flex-col with newest at bottom, auto-smooth-scroll on new messages via ref + useEffect. User bubbles right-aligned with primary/10 tint + user initials avatar; AI bubbles left-aligned white/card with border + Bot avatar. AI text uses whitespace-pre-wrap + overflow-wrap:anywhere to preserve bullets/numbered lists. AI footer shows "Based on N tenders in your workspace" when context_tenders is returned.
  - Loading bubble: emerald pulse ring on Bot avatar + animated 3-dot typing indicator (custom tf-typing keyframes) + "Analyzing your tender data…". Send button swaps to Loader2 spinner.
  - Error bubble: rose-tinted card with error message + "Try again" button that drops the last error message and re-asks the last user question.
  - Empty state: centered hero with large emerald-gradient Bot avatar (Sparkles badge), "How can I help with your tenders today?" headline, descriptive subtitle, and 6 large clickable question chips (grid, emerald hover, ArrowRight).
  - Empty tender banner: amber Alert shown when context_tenders === 0 with a "Go to Tenders" button that calls setTab("tenders").
  - Input bar: auto-growing Textarea (max ~5 rows / 160px) with Enter-to-send / Shift+Enter-newline, focused-tender "Focused" pill overlay when a tender is selected, 2000-char counter, disclaimer line, emerald Send button (disabled when empty or loading).
  - Mobile: also shows a compact suggested-questions chips strip above the input when chat is empty.
  - Animations: framer-motion message entrance (opacity + y, 0.2s easeOut), AnimatePresence for empty-state, layout animations on bubbles; Bot avatar ping animation while loading.
  - Toasts: sonner toast on focus change ("AI now focused on {ref} — title") and on focus clear / chat clear.
- Used only emerald-themed colors (no blue/indigo) — primary emerald 500/600/700, emerald 50/100/950 tints, plus rose for errors, amber for the empty-tenders banner, matching the rest of the app.
- Ran `bun run lint`: 2 pre-existing errors in src/app/page.tsx and src/components/dashboard/dashboard-shell.tsx (unrelated, set-state-in-effect rule). Linting assistant-tab.tsx in isolation (`npx eslint src/components/dashboard/tabs/assistant-tab.tsx`) → EXIT 0, no errors.

Stage Summary:
- Artifact: /home/z/my-project/src/components/dashboard/tabs/assistant-tab.tsx (908 lines, replaces PLACEHOLDER stub).
- Exports: `AssistantTab()` — matches the contract used by dashboard-shell.tsx.
- Features delivered: full chat UI with left context rail, focus tender selector, 9 suggested questions, empty-state hero, loading/error/empty-tenders states, auto-scroll, auto-grow input, framer-motion animations, sonner toasts, mobile Sheet for the rail, emerald-only theme.
- Lint: clean for this file. Ready for integration with the existing dashboard nav.

---
Task ID: 8 + 16
Agent: Main Orchestrator
Task: Build Tenders tab + Tender Detail; start services and verify with Agent Browser

Work Log:
- Built tenders-tab.tsx: list view with search/filter/sort, create tender dialog, archive/delete actions, completion progress bars
- Built tender-detail.tsx (large component, ~1200 lines): 9 sub-tabs (Overview, Documents, Checklist, Briefings, Pricing, Submission, Communications, Addendums, AI) each with full CRUD
- Documents section: upload + AI extract button that runs z-ai CLI to read PDF/DOCX and auto-fill tender fields + rebuild checklist
- Checklist section: editable items with status (Complete/Outstanding/Expired/N/A), link to library docs
- Pricing section: versioned pricing sheets with line items (Labour/Equipment/Consumables/Transport), auto VAT 15% calculation
- AI section: shows extracted info (PSIRA grades, guards, mandatory requirements, disqualification risks) + generates tender summary
- Fixed lint errors (set-state-in-effect in page.tsx and dashboard-shell.tsx)
- Created Next.js catch-all API proxy at src/app/api/[...path]/route.ts that auto-starts the Python backend on demand (sandbox kills background processes after ~60s)
- Started Python backend on port 8000, Next.js on port 3000
- Verified with Agent Browser:
  * Landing page renders with all 16 features, hero, pricing, FAQ, sticky footer
  * Sign-up flow works end-to-end (register → JWT → dashboard)
  * Dashboard shows KPI cards, status breakdown, quick actions
  * Created tender E137 "Provision of Security Guards for City Facilities" successfully
  * Tender detail page with all 9 sub-tabs renders
  * AI Assistant answered "What tenders do we currently have open?" correctly using real data
  * All 9 sidebar tabs render (Dashboard, Tenders, Library, Briefings, Pricing, Submissions, Clarifications, Addendums, AI Assistant)
  * Mobile responsive with hamburger menu
  * All API calls return 200

Stage Summary:
- Full-stack TenderFlow application complete and verified
- Python FastAPI backend (port 8000) with SQLAlchemy, JWT auth, all 16 tender management features
- Next.js 16 frontend (port 3000) with landing page, auth page, and dashboard with 9 tabs
- AI integration via z-ai CLI for document reading, summaries, addendum change detection, and assistant
- Auto-restarting proxy keeps backend alive in sandbox environment
- No mock data — everything persisted to SQLite via real API calls
- All 16 requirements from the spec implemented

---
Task ID: 17
Agent: Main Orchestrator
Task: Resume after sandbox reset — fix backend auto-start and verify all features

Work Log:
- Detected sandbox environment was reset (Python packages uninstalled, backend killed)
- Reinstalled Python packages: sqlalchemy, python-jose, passlib, bcrypt
- Verified database file (tender.db) and all code files were preserved
- Fixed critical bug in Next.js API proxy: was using /usr/bin/python3 (system) which lacks packages; updated to /home/z/.venv/bin/python3 (venv) which has all packages
- Improved proxy start logic: uses setsid + nohup for full process detachment, 25-second startup wait
- Started backend, verified existing data intact (E137 tender with AI extraction)
- Verified with Agent Browser:
  * Landing page renders correctly
  * Sign-in with existing account (sarah.new@mthembusec.co.za) works
  * Dashboard loads with KPI cards and sidebar navigation
  * Tenders tab shows E137 tender
  * Tender detail page opens with all 9 sub-tabs (Overview, Documents, Checklist, Briefings, Pricing, Submission, Comms, Addendums, AI)
  * AI tab shows extracted data: PSIRA grades (C/B/A), 45 guards, mandatory requirements, disqualification risks
  * AI summary with full spec format is intact
  * Checklist tab shows 27 items with Outstanding status
  * AI Assistant answered "What tenders do we currently have open?" correctly with E137 details
- Lint passes clean, all API calls return 200, no browser errors

Stage Summary:
- All services running: Next.js (3000) + Python FastAPI (8000, auto-started on demand)
- Critical fix: proxy now uses venv Python path (/home/z/.venv/bin/python3)
- All data preserved across sandbox reset
- All 16 tender management features verified working
- AI document extraction, AI summary, and AI assistant all functional

---
Task ID: 18
Agent: Main Orchestrator
Task: Make dashboard KPI cards clickable — navigate to relevant tab or show detail dialog

Work Log:
- Updated KpiCard component in dashboard-tab.tsx to accept onClick + hint props
- Cards now render as <button> when clickable (asChild pattern), with cursor-pointer, hover lift effect, border highlight, and a "Click to view" hint with chevron icon
- Wired up all 4 KPI cards:
  * Active Tenders → navigates to Tenders tab (setTab("tenders"))
  * Closing This Week → opens a Dialog showing the closing_this_week_list with tender reference, title, client, status badge, deadline countdown; clicking a tender in the dialog opens it
  * Documents Expiring → navigates to Compliance Library tab (setTab("library"))
  * Awarded This Year → opens a Dialog showing the awarded_this_year_list with reference, title, client, estimated value; clicking a tender opens it
- Added Dialog + ScrollArea imports from shadcn/ui
- Added showClosingWeek and showAwarded state to control the dialogs
- Both dialogs have empty states with appropriate messaging
- Verified with Agent Browser:
  * Active Tenders click → navigated to Tenders tab ✓
  * Closing This Week click → opened "Tenders Closing This Week" dialog ✓
  * Documents Expiring click → navigated to Compliance Library tab ✓
  * Awarded This Year click → opened "Tenders Awarded This Year" dialog ✓
  * Escape closes dialogs ✓
  * No browser errors ✓
- Lint passes clean

Stage Summary:
- All 4 KPI cards are now interactive and lead to real information
- Two cards navigate to tabs (Active Tenders → Tenders, Documents Expiring → Library)
- Two cards open detail dialogs (Closing This Week, Awarded This Year) with clickable tender rows that open the tender detail

---
Task ID: 19
Agent: Main Orchestrator
Task: Add AI tender scraper/finder that searches the web for open tenders by category

Work Log:
- Added _run_zai_web_search() to ai_module.py — uses z-ai CLI `function -n web_search` to search the web
- Added discover_tenders() to ai_module.py — constructs optimized query, runs web search, then uses AI chat to structure raw results into clean tender entries (title, client, category, location, closing_date, description, source_site, url, reference_number, estimated_value, relevance)
- Added 2 new API endpoints to main.py:
  * POST /api/tenders/discover — takes {category, keywords?, location?, num_results?} and returns structured tender list
  * POST /api/tenders/import-discovered — imports a discovered tender into the user's tender database with auto-generated reference number, source URL in notes, and default checklist
- Added discoverTenders() and importDiscoveredTender() methods to frontend api.ts
- Added "discover" to DashboardTab type in dashboard-store.ts
- Added "Discover Tenders" nav item (Radar icon) to dashboard-shell.tsx sidebar, between Tenders and Compliance Library
- Created discover-tab.tsx (~430 lines) with:
  * Search form: category dropdown (15 presets + custom), location dropdown (SA provinces + cities), keywords input, max results selector
  * Animated loading state with pulsing radar icon
  * Result cards showing: title, relevance badge, reference number, source site, client, location, closing date with countdown, estimated value, description
  * "View Tender & Get Documents" button → opens source URL in new tab
  * "Import to My Tenders" button → calls import endpoint, then navigates to the imported tender's detail page
  * Empty state with quick-select category chips
  * Bottom help card explaining how to use the results
- Verified with Agent Browser:
  * Signed in as Thabo Nkosi
  * Navigated to Discover Tenders tab
  * Selected "Security Guards" category, added "PSIRA armed response" keywords
  * Clicked "Find Tenders" — AI searched the web and found 3 real security guard tenders
  * Results included: "Provision of security guards on an as-and-when required basis for 3 years", "Appointment of service provider for guarding security services for Department of Transport in Gauteng", "RFP for provision of security guard services for 36 months"
  * Each result had "View Tender & Get Documents" link (opens source site) and "Import to My Tenders" button
  * Clicked "Import to My Tenders" on first result — tender was imported and detail page opened showing the tender with source URL in notes
  * No errors, lint passes clean

Stage Summary:
- AI Tender Finder fully operational
- Searches real South African tender portals (etenders.gov.za, tenderbulletins.co.za, PSIRA, globaltenders.com, security.co.za, etc.)
- Returns structured list of actual open tenders with direct links to source documents
- One-click import into the user's tender database
- Category presets + custom category support
- Region filtering (all SA provinces + major cities)
- Keyword refinement for precise searches
- Relevance scoring (high/medium/low)
- Closing date extraction with countdown

---
Task ID: 20
Agent: Main Orchestrator
Task: Replace AI-only search with real Python scrapers that fetch actual tender listings

Work Log:
- Installed Python packages: requests, beautifulsoup4, lxml
- Created scraper.py with 3 portal scrapers:
  * scrape_security_co_za() — fetches https://www.security.co.za/tenders/, parses 100+ real tenders with reference numbers, regions, deadlines, descriptions, and detail page URLs
  * scrape_tenderflow_co_za() — fetches tenderflow.co.za category pages, extracts tender links and metadata
  * scrape_etenders_search() — fetches etenders.gov.za (National Treasury portal) table listings
  * scrape_all() — runs all 3 scrapers, merges, deduplicates by title, sorts by relevance + closing date
- Updated discover_tenders() in ai_module.py to use a 2-step approach:
  1. Step 1: Python scrapers directly fetch real tender listings (primary source)
  2. Step 2: AI web search (z-ai web_search + chat structuring) for additional coverage if scrapers don't return enough results
- API now returns: results, sources (which portals were scraped), scraped_count, web_search_count, raw_count, errors
- Updated discover-tab.tsx frontend to display:
  * "X real tenders found" (emphasizes these are real)
  * Source badges showing which portals were scraped (e.g., "security.co.za (15 tenders)")
  * Breakdown: "Python scraper: 15 tenders · 15 total after dedup"
  * Updated loading message: "Scraping real tender portals…"
  * Updated help text to mention Python scrapers
- Verified with Agent Browser:
  * Searched "Security Guards" — Python scraper found 15 REAL tenders from security.co.za in ~10 seconds
  * Results included real reference numbers (81387, 81383, 81381, etc.), real locations (Mpumalanga, Western Cape, etc.), real closing dates (2026-10-16, etc.), and real detail page URLs
  * "View Tender & Get Documents" link opened the actual security.co.za tender detail page
  * Source badges showed "security.co.za (15 tenders)" and "Python scraper: 15 tenders"
  * No errors, lint clean

Stage Summary:
- AI Tender Finder now uses REAL Python scrapers (requests + BeautifulSoup) to directly fetch live tender listings
- Primary source: security.co.za (100+ live tenders with full metadata)
- Secondary sources: tenderflow.co.za, etenders.gov.za
- Fallback: AI web search for broader coverage
- All tenders are REAL with real reference numbers, real clients, real closing dates, and direct links to the source tender pages
- Users can click "View Tender & Get Documents" to go directly to the source portal and download documents
- Users can click "Import to My Tenders" to add any discovered tender to their database

---
Task ID: 21
Agent: Main Orchestrator
Task: Upgrade AI Assistant to know all tabs, all documents, and be a mission-driven tender-winning coach

Work Log:
- Rewrote ASSISTANT_SYSTEM prompt in ai_module.py — now defines the AI as a mission-driven tender-winning coach with:
  * Full knowledge of ALL system data (tenders, documents, library, checklists, briefings, pricing, submissions, communications, addendums, dashboard)
  * 8 answering principles: be specific, actionable, a coach, honest, structured, SA-aware (PSIRA/B-BBEE/CIPC/SARS/COIDA), deadline-focused, compliance-focused
  * 15 example question types it can answer
  * Professional, encouraging, direct tone — "you are the user's bid manager"
- Added _build_full_system_context() to main.py — builds COMPREHENSIVE context including:
  * Dashboard stats (active, closing this week, awarded, unsuccessful)
  * Full compliance library with expiry dates and status (Active/Expiring/Expired)
  * Every tender with ALL fields: reference, title, client, description, scope, category, location, closing date+time, days_until_close, estimated value, contract period, status, outcome, unsuccessful_reason, person responsible, contact info, notes, ai_extracted_info, ai_summary
  * Checklist per tender (every item with status) + checklist_summary (total/complete/outstanding/expired + outstanding_items list)
  * Documents per tender WITH EXTRACTED TEXT (capped at 3000 chars per doc) — the AI can now answer questions about document content
  * Briefings per tender (type, date, time, location, attendance required/confirmed, days_until_briefing)
  * Pricing versions per tender (line items, subtotal, VAT, total) + latest_pricing
  * Submission details (method, date, confirmation reference, final pricing)
  * Communications per tender (type, subject, body, date, from/to)
  * Addendums per tender (with AI-detected changes)
- API now returns context_tenders, context_documents, context_library_docs counts
- Updated assistant-tab.tsx frontend:
  * Added 8 new suggested questions: PSIRA grades, Guards required, Tender document, Evaluation criteria, Pricing, Addendum changes, Expiring docs, Help me win
  * Updated empty hero subtitle: "How can I help you win your tenders today?" + "I know everything in your system — every tender, every uploaded document's content, your compliance library, checklists, pricing, briefings, submissions and communications. My mission is to help you win."
  * Updated left rail stats footer to show 3 stats: Tenders / Documents / Library (AI Knowledge Base)
  * Updated AI message footer: "Based on X tenders, all uploaded documents & your compliance library"
  * Added totalDocuments and totalLibraryDocs state, populated from API response
- Verified with Agent Browser:
  * Asked "What's in the tender document I uploaded?" → AI read the uploaded document and returned full details: tender number E137/2025, 45 guards, PSIRA grades C/B/A, compulsory briefing on Nov 20, evaluation criteria (functionality 60/price 40), disqualification risks, and recommended immediate action
  * Asked "What should I do next to win my most urgent tender?" → AI gave a full prioritized action plan: immediate actions (attend briefing, complete 25 missing documents, prepare pricing), high-priority actions (gather guard IDs, compile references, prepare technical proposal), critical deadlines, risk mitigation, and next steps
  * AI referenced the tender by reference number (E137), knew the checklist status (1/26 complete), knew the pricing status (no versions), and gave actionable coaching
  * No errors, lint clean

Stage Summary:
- AI Assistant now has full system knowledge — every tab, every document's content, every checklist, every briefing, every pricing version, every communication, every addendum
- Mission-driven: every answer moves the user toward winning the tender
- Can answer questions about document content (reads uploaded PDFs/DOCX/TXT)
- Can give prioritized action plans to win specific tenders
- Knows SA procurement specifics (PSIRA grades, B-BBEE, CIPC, SARS, COIDA, 80/20 evaluation)
- Flags deadlines, missing documents, expired compliance docs, and disqualification risks
- Left rail shows AI Knowledge Base stats: Tenders / Documents / Library counts

---
Task ID: 22
Agent: Main Orchestrator
Task: Build dedicated AI Tender Document Reader feature — upload any document, AI extracts all 23 fields + summary

Work Log:
- Added 2 new backend endpoints in main.py:
  * POST /api/ai/read-document — standalone reader: upload any PDF/DOCX/TXT, AI extracts all fields + generates summary, returns result without creating a tender
  * POST /api/ai/read-document-and-create — same as above but also creates a new tender in the database with all extracted fields auto-filled, attaches the document, builds checklist from compulsory documents, generates AI summary
- The extraction schema (already in ai_module.py EXTRACTION_SYSTEM) covers ALL 23 fields the user requested:
  tender_number, client, tender_title, closing_date, closing_time, scope_of_work, contract_period, site_locations, number_of_personnel_guards, required_qualifications, required_psira_grades, required_equipment, mandatory_requirements, functionality_requirements, evaluation_criteria, pricing_requirements, compulsory_documents, compulsory_briefing_site_inspection, briefing_date, briefing_time, submission_requirements, submission_method, important_conditions, important_deadlines, disqualification_requirements
- Added readDocument() and readDocumentAndCreate() methods to frontend api.ts
- Added "reader" to DashboardTab type in dashboard-store.ts
- Added "AI Document Reader" nav item (ScanText icon) to dashboard-shell.tsx sidebar, between Discover Tenders and Compliance Library
- Created reader-tab.tsx (~450 lines) with:
  * Header explaining the feature
  * "What the AI extracts" card showing all 23 field badges
  * Drag-and-drop upload zone (accepts PDF/DOCX/TXT/CSV/MD, max 20MB)
  * Animated loading state with pulsing ScanText icon
  * Success banner with file info + "Create Tender from This" + "Read Another" buttons
  * AI Tender Summary card (with copy-to-clipboard button)
  * Extracted Information card with:
    - Key fields grid (12 fields in 3-col responsive grid with icons)
    - Scope of work section
    - Compulsory briefing section (amber highlighted)
    - 9 list sections: mandatory requirements, functionality, evaluation criteria, pricing, compulsory documents (emerald), submission requirements, important conditions, important deadlines (amber), disqualification requirements (rose)
  * Document text preview (first 2000 chars)
  * Bottom CTA to create tender
- Verified with Agent Browser:
  * Navigated to AI Document Reader tab
  * Uploaded sample-tender.txt
  * Clicked "Read Document with AI"
  * AI extracted ALL fields: E137/2025, City of Cape Town, 45 guards, PSIRA grades C/B/A, 8 compulsory documents, 4 disqualification requirements, briefing on 2025-11-20, evaluation criteria (60/40), etc.
  * AI summary showed full tender summary in the specified format
  * Clicked "Create Tender from This" — tender was created with all fields auto-filled, document attached, checklist built
  * Navigated to the new tender's detail page → AI tab showed all extracted info
  * No errors, lint clean, all API calls 200

Stage Summary:
- AI Tender Document Reader is a dedicated feature in the sidebar
- Upload ANY tender document (PDF/DOCX/TXT) → AI reads it and extracts all 23 important fields automatically
- AI generates a plain-English summary so you don't have to read the entire document
- One click to create a tender record with all info auto-filled + checklist built from compulsory documents
- Also works standalone (read without creating) for quick document evaluation
- All 23 fields from the spec are covered
