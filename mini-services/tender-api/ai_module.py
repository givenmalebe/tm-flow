"""
TM Flow - AI module
Uses the Google Gemini API (gemini-flash-latest) via httpx for:
- Tender document reading & extraction (chat)
- AI assistant chat
- AI tender summaries
- Addendum change detection
"""
import os
import json
import re
import time
from typing import Optional, Dict, Any, List

import httpx


def _load_env_file() -> None:
    """
    Populate os.environ from the repo-root .env for vars not already set.

    The backend runs as a standalone service and does not inherit the .env that
    Next.js loads, so GEMINI_API_KEY has to be read here. On Cloud Run the key
    arrives as a real environment variable and this is a no-op.
    """
    env_path = os.path.join(os.path.dirname(__file__), "..", "..", ".env")
    if not os.path.isfile(env_path):
        return
    try:
        with open(env_path, "r") as fp:
            for line in fp:
                line = line.strip()
                if not line or line.startswith("#") or "=" not in line:
                    continue
                key, _, value = line.partition("=")
                key = key.strip()
                value = value.strip().strip('"').strip("'")
                if key and key not in os.environ:
                    os.environ[key] = value
    except OSError:
        pass


_load_env_file()

GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY", "")
GEMINI_MODEL = os.environ.get("GEMINI_MODEL", "gemini-flash-latest")
GEMINI_BASE_URL = "https://generativelanguage.googleapis.com/v1beta"

# The free tier caps each model separately, so when one model's daily quota is
# spent we can often still be served by another. GEMINI_MODELS is an ordered
# fallback chain: the first model that can answer wins, and the whole chain is
# only considered exhausted once every model has refused.
def _model_chain() -> list:
    raw = os.environ.get("GEMINI_MODELS", "").strip()
    models = [m.strip() for m in raw.split(",") if m.strip()]
    if not models:
        models = [GEMINI_MODEL]
    elif GEMINI_MODEL and GEMINI_MODEL not in models:
        models.insert(0, GEMINI_MODEL)
    seen, ordered = set(), []
    for m in models:
        if m not in seen:
            seen.add(m)
            ordered.append(m)
    return ordered


GEMINI_MODELS = _model_chain()

# 120s per call so two sequential AI calls (extraction + summary)
# fit within the 300s Next.js proxy timeout.
GEMINI_TIMEOUT = 120.0

# Free-tier keys get rate-limited and the model sheds load under demand
# spikes; retrying transient statuses clears most of those failures.
GEMINI_RETRIES = 2
GEMINI_RETRY_DELAY = 5.0
GEMINI_RETRY_STATUS = {500, 502, 503, 504}

# The Gemini free tier allows only a small number of requests per model per day.
# Once we are throttled, every further call fails, so we stop calling entirely
# until the quota resets instead of making each feature fail slowly. The scrapers
# keep working meanwhile, so research still returns real tenders.
_QUOTA_COOLDOWN_UNTIL = 0.0
_DEFAULT_QUOTA_COOLDOWN_S = 3600.0


def _parse_retry_seconds(text: str) -> Optional[float]:
    """Pull 'retry in 10h34m2.9s' out of a quota error message."""
    m = re.search(r"retry in\s*([0-9hms.]+)", text or "", re.I)
    if not m:
        return None
    total = 0.0
    for num, unit in re.findall(r"([0-9.]+)([hms])", m.group(1), re.I):
        total += float(num) * {"h": 3600.0, "m": 60.0, "s": 1.0}[unit.lower()]
    return total or None


def gemini_available() -> bool:
    """False while the daily quota is known to be exhausted."""
    return time.monotonic() >= _QUOTA_COOLDOWN_UNTIL


def _trip_quota_cooldown(body: str) -> None:
    global _QUOTA_COOLDOWN_UNTIL
    wait = _parse_retry_seconds(body) or _DEFAULT_QUOTA_COOLDOWN_S
    _QUOTA_COOLDOWN_UNTIL = time.monotonic() + max(60.0, wait)


def _gemini_post(payload: Dict[str, Any], timeout: float, allow_model_fallback: bool = True,
                 trip_breaker: bool = True) -> Dict[str, Any]:
    """POST to Gemini, walking the model chain until one can answer.

    Each model's free-tier quota is separate, so a 429 on one model is treated
    as "try the next model" rather than "stop everything". Only when every model
    in the chain refuses do we pause the whole service.
    """
    if not GEMINI_API_KEY:
        raise RuntimeError("GEMINI_API_KEY is not set")
    if not gemini_available():
        raise RuntimeError(
            "Gemini daily quota reached — AI features are paused until the quota resets."
        )

    headers = {"x-goog-api-key": GEMINI_API_KEY, "Content-Type": "application/json"}
    models = GEMINI_MODELS if allow_model_fallback else GEMINI_MODELS[:1]
    last_error = ""
    quota_body = ""

    for model in models:
        url = f"{GEMINI_BASE_URL}/models/{model}:generateContent"
        for attempt in range(GEMINI_RETRIES + 1):
            response = httpx.post(url, headers=headers, json=payload, timeout=timeout)
            if response.status_code == 200:
                return response.json()
            # Out of quota for THIS model — a different model may still serve us.
            if response.status_code == 429:
                quota_body = response.text
                last_error = f"HTTP 429 ({model}): {response.text[:300]}"
                break
            last_error = f"HTTP {response.status_code} ({model}): {response.text[:300]}"
            if response.status_code in GEMINI_RETRY_STATUS and attempt < GEMINI_RETRIES:
                time.sleep(GEMINI_RETRY_DELAY * (attempt + 1))
                continue
            # A model that does not exist / cannot serve this request: move on.
            break

    if quota_body:
        # Every model in the chain is out of quota. Only a caller that cannot
        # degrade (chat, reports) pauses the whole service; research/search
        # simply gets no results.
        if trip_breaker:
            _trip_quota_cooldown(quota_body)
            raise RuntimeError(
                "Gemini daily quota reached on every configured model — AI features are "
                "paused until the quota resets."
            )
        raise RuntimeError(
            "Gemini quota reached on every configured model (search unavailable)."
        )
    raise RuntimeError(f"Gemini request failed: {last_error}")


def _gemini_text(data: Dict[str, Any]) -> str:
    """Concatenate the text parts of the first candidate."""
    candidates = data.get("candidates") or []
    if not candidates:
        raise RuntimeError(f"Gemini returned no candidates: {json.dumps(data)[:300]}")
    parts = (candidates[0].get("content") or {}).get("parts") or []
    text = "".join(p.get("text", "") for p in parts)
    if not text:
        raise RuntimeError("Gemini returned an empty response")
    return text


def _gemini_chat(
    prompt: str,
    system: Optional[str] = None,
    max_tokens: int = 8000,
    timeout: Optional[float] = None,
) -> str:
    """Call Gemini generateContent and return the assistant text content."""
    payload: Dict[str, Any] = {
        "contents": [{"parts": [{"text": prompt}]}],
        "generationConfig": {"maxOutputTokens": max_tokens},
    }
    if system:
        payload["systemInstruction"] = {"parts": [{"text": system}]}
    return _gemini_text(_gemini_post(payload, timeout or GEMINI_TIMEOUT))


# ---- Tender document extraction prompt ----

EXTRACTION_SYSTEM = """You are a professional tender analyst who reads South African tender documents (often security/guards/PSIRA related) and extracts structured information.
You MUST respond with ONLY a valid JSON object (no markdown, no code fences, no extra text).
Use the schema below. If a field is not found, use null or an empty array.
Schema:
{
  "tender_number": string|null,
  "client": string|null,
  "tender_title": string|null,
  "closing_date": string|null (ISO format YYYY-MM-DD if mentioned),
  "closing_time": string|null (HH:MM),
  "scope_of_work": string|null,
  "contract_period": string|null,
  "site_locations": [string],
  "number_of_personnel_guards": string|null,
  "required_qualifications": [string],
  "required_psira_grades": [string],
  "required_equipment": [string],
  "mandatory_requirements": [string],
  "functionality_requirements": [string],
  "evaluation_criteria": [string],
  "pricing_requirements": [string],
  "compulsory_documents": [string],
  "compulsory_briefing_site_inspection": string|null (Yes/No + details),
  "briefing_date": string|null,
  "briefing_time": string|null,
  "submission_requirements": [string],
  "submission_method": string|null,
  "important_conditions": [string],
  "important_deadlines": [string],
  "disqualification_requirements": [string],
  "checklist_suggestions": [string]  // suggested submission checklist documents
}"""


def extract_tender_info(document_text: str, filename: str = "") -> Dict[str, Any]:
    """Send document text to AI and get structured extraction."""
    if not document_text or len(document_text.strip()) < 50:
        return {}
    # Truncate very long documents
    if len(document_text) > 50000:
        document_text = document_text[:50000] + "\n...[truncated]..."
    prompt = f"""Analyze the following tender document and extract the key information.
Document filename: {filename}

DOCUMENT CONTENT:
{document_text}

Respond with ONLY the JSON object as specified."""
    try:
        result = _gemini_chat(prompt, system=EXTRACTION_SYSTEM)
        # Strip any potential markdown fences
        result = result.strip()
        if result.startswith("```"):
            result = result.split("\n", 1)[1] if "\n" in result else result[3:]
            if result.endswith("```"):
                result = result[:-3]
            result = result.strip()
        if result.startswith("json"):
            result = result[4:].strip()
        # Find first { and last }
        first = result.find("{")
        last = result.rfind("}")
        if first >= 0 and last > first:
            result = result[first:last + 1]
        return json.loads(result)
    except (json.JSONDecodeError, RuntimeError, Exception) as e:
        return {"_error": f"AI extraction failed: {str(e)}"}


# ---- AI-powered tender-specific checklist generation ----

CHECKLIST_SYSTEM = """You are a South African tender compliance analyst.
Given a tender document's extracted information, you must produce a COMPLETE submission checklist that is SPECIFIC to this tender.
You MUST respond with ONLY a valid JSON array (no markdown, no code fences, no extra text).

Each checklist item must follow this schema:
{
  "name": string (short name, e.g. "B-BBEE certificate", "PSIRA registration certificates", "Pricing schedule"),
  "category": one of ["Compliance", "Technical", "Pricing", "Forms", "Personnel", "Company", "Methodology", "References", "Other"],
  "description": string (1-2 sentences explaining WHAT this is and WHY it's required for this specific tender),
  "mandatory": boolean (true if compulsory/mandatory, false if optional/recommended),
  "library_category": string or null (the matching compliance library category if this document can be reused from the company library, else null). Must be one of: "CIPC", "SARS", "B-BBEE", "PSIRA", "COIDA", "Financial statements", "Company profile", "References", "Policies", "Certificates", "Insurance documents", "Organograms", "Standard declarations", "Standard methodologies", "Standard SOPs", "Other"
}

Rules:
- Always include the standard compliance documents (Company profile, CIPC, SARS, B-BBEE, PSIRA, COIDA, Financial statements) — mark them mandatory if the tender requires compliance documents, optional otherwise.
- Include ALL compulsory_documents mentioned in the extraction.
- Include a "Pricing schedule" item (mandatory) for every tender.
- Include a "Technical proposal" item if the tender has functionality requirements.
- Include a "Methodology" item if scope_of_work is detailed.
- Include a "Risk assessment" item for security/service tenders.
- Include "SOPs" (Standard Operating Procedures) for service tenders.
- Include "Organogram" if personnel/guards are required.
- Include "POPIA documents" and "Signed declarations" for government tenders.
- Include personnel-specific items (e.g. "Certified ID copies of all guards", "PSIRA certificates for all guards") if personnel are required.
- Include any "Forms required by the client" mentioned in submission_requirements.
- Include compulsory briefing attendance as a checklist item if a compulsory briefing is required.
- For each item, set library_category to the matching library category so the system can auto-link existing company documents.
- Be specific to THIS tender — don't add generic items that don't apply.
- Aim for 15-30 items depending on the tender complexity."""


def generate_tender_checklist(extracted: Dict[str, Any]) -> List[Dict[str, Any]]:
    """
    Generate a tender-specific checklist using AI, based on the extracted tender info.
    Returns a list of checklist items with name, category, description, mandatory, library_category.
    """
    if not extracted or extracted.get("_error"):
        return []

    prompt = f"""Based on the following tender extraction, generate a complete submission checklist specific to this tender.

TENDER EXTRACTION (JSON):
{json.dumps(extracted, indent=2, default=str)[:15000]}

Return ONLY the JSON array as specified. Include every document and requirement needed to submit this tender."""

    try:
        result = _gemini_chat(prompt, system=CHECKLIST_SYSTEM)
        result = result.strip()
        if result.startswith("```"):
            result = result.split("\n", 1)[1] if "\n" in result else result[3:]
            if result.endswith("```"):
                result = result[:-3]
            result = result.strip()
        if result.startswith("json"):
            result = result[4:].strip()
        # Find first [ and last ]
        first = result.find("[")
        last = result.rfind("]")
        if first >= 0 and last > first:
            result = result[first:last + 1]
        items = json.loads(result)
        if not isinstance(items, list):
            return []
        # Validate each item
        valid_items = []
        for item in items:
            if isinstance(item, dict) and item.get("name"):
                valid_items.append({
                    "name": str(item["name"])[:500],
                    "category": str(item.get("category", "Other")),
                    "description": str(item.get("description", ""))[:1000],
                    "mandatory": bool(item.get("mandatory", True)),
                    "library_category": item.get("library_category") if item.get("library_category") else None,
                })
        return valid_items
    except (json.JSONDecodeError, RuntimeError, Exception):
        # Fallback: return empty list — the caller will use default categories
        return []

SUMMARY_SYSTEM = """You are a professional tender analyst. Produce a concise tender summary in plain text using this exact format:

Tender: <title>
Client: <client>
Reference: <ref>
Closing Date: <date>
Contract Period: <period>
Location: <location>
Scope: <scope summary>
Personnel Required: <details>
PSIRA Requirements: <grades>
Mandatory Requirements: <bullet list>
Documents Required: <bullet list>
Briefing Required: <yes/no + details>
Evaluation Criteria: <list>
Pricing Requirements: <details>
Submission Method: <method>
Important Risks/Disqualification Points: <list>
Current Status: <status>
Outstanding Items: <list>

Keep it factual and concise. Do not add markdown headings."""


def generate_tender_summary(tender_data: Dict[str, Any], extracted: Dict[str, Any]) -> str:
    prompt = f"""Produce a tender summary using the data below.

TENDER RECORD:
{json.dumps(tender_data, indent=2, default=str)}

AI EXTRACTED INFO:
{json.dumps(extracted, indent=2, default=str)}
"""
    try:
        return _gemini_chat(prompt, system=SUMMARY_SYSTEM)
    except RuntimeError as e:
        return f"Summary generation failed: {e}"


# ---- Addendum change detection ----

ADDENDUM_SYSTEM = """You are a tender addendum analyst. Compare the original tender requirements with the addendum and identify changes.
Respond with ONLY a JSON object:
{
  "new_requirements": [string],
  "removed_requirements": [string],
  "changed_dates": [{"field": string, "from": string, "to": string}],
  "changed_pricing": [string],
  "changed_scope": [string],
  "changed_submission": [string],
  "other_changes": [string],
  "checklist_additions": [string],
  "checklist_removals": [string],
  "summary": string
}

The "checklist_additions" field should list new documents or requirements that should be added to the submission checklist based on the addendum.
The "checklist_removals" field should list items that are no longer required due to the addendum.
Be specific and actionable in all fields."""


def detect_addendum_changes(original_text: str, addendum_text: str) -> Dict[str, Any]:
    prompt = f"""Compare the original tender with the addendum and identify changes.

ORIGINAL TENDER EXCERPT:
{original_text[:20000]}

ADDENDUM CONTENT:
{addendum_text[:20000]}

Return ONLY the JSON object."""
    try:
        result = _gemini_chat(prompt, system=ADDENDUM_SYSTEM)
        result = result.strip()
        first = result.find("{")
        last = result.rfind("}")
        if first >= 0 and last > first:
            result = result[first:last + 1]
        return json.loads(result)
    except (json.JSONDecodeError, RuntimeError) as e:
        return {"_error": f"Change detection failed: {e}", "summary": addendum_text[:500]}


# ---- AI Assistant (natural language Q&A over tenders) ----

ASSISTANT_SYSTEM = """You are TM Flow AI, the dedicated procurement success AI for ONE South African company (the company in the COMPANY PROFILE / company_scope of the snapshot).

YOUR MISSION: make this company WIN tenders and SECURE the funding it needs. Every answer should move them closer to a successful, compliant, on-time submission or a funding application.

YOU KNOW EVERYTHING IN THE SYSTEM SNAPSHOT PROVIDED TO YOU, including:
- company_profile: who you work for (registration, PSIRA, B-BBEE level, address, director)
- company_scope: the company you serve; all data below belongs to THEM ONLY
- ai_memory: the company's mission, goals and preferences — OBEY these in your advice
- recent_chat: the team's recent conversation with you — use it for continuity, don't re-ask what was already discussed
- ai_opportunities: tenders and funding options you found for them (with match scores)
- Every tender in their register (reference, title, client, status, closing date, scope, estimated value, person responsible)
- AI-extracted tender information (PSIRA grades, guards required, mandatory requirements, disqualification risks, evaluation criteria, compulsory documents, briefing details)
- The submission checklist for each tender (what's Complete, Outstanding, Expired, Not Applicable)
- All uploaded tender documents and their extracted text content
- The compliance document library (CIPC, SARS, B-BBEE, PSIRA, COIDA, financials, etc. with expiry dates)
- All briefings and site inspections (dates, locations, attendance status)
- All pricing versions (line items, subtotal, VAT, total) for each tender
- Submission details (method, date, confirmation reference, final pricing)
- All communications (emails, clarifications, meetings, addendums, extensions)
- All addendums with AI-detected changes (new/removed/changed requirements)
- The dashboard stats (active tenders, closing this week, documents expiring, awarded)

YOU ALSO UNDERSTAND SOUTH AFRICAN BUSINESS FUNDING:
- Development funders: SEFA, SEDA, IDC, NYDA, NEF, dtic incentives, municipal and provincial programmes
- Tender-linked finance: bridging finance, purchase-order funding, invoice discounting
- Typical eligibility: CIPC registration, tax compliance, B-BBEE level, turnover and trading-history thresholds

HOW TO ANSWER:
1. Be specific — reference tenders by their reference number (e.g. "E137") and title.
2. Be actionable — don't just state facts; tell the user what to DO next to win the tender or secure the funding.
3. Be a coach — if a tender is at risk (deadline close, documents missing, briefing not confirmed), say so clearly and recommend immediate action.
4. Be honest — if data is missing or you don't know, say "I don't have that information" rather than inventing it.
5. Be structured — use bullet points and short paragraphs. For lists of missing items, use checklists.
6. Be South-Africa-aware — understand PSIRA grades (A/B/C/D/E), B-BBEE levels, CIPC, SARS, COIDA, POPIA, SBD forms, functionality/price evaluation, 80/20 or 90/10 preference points.
7. Be deadline-focused — always highlight closing dates, days remaining, and urgency.
8. Be compliance-focused — flag expired/expiring compliance documents that could disqualify a bid.
9. Be proactive — when you see ai_opportunities or funding relevant to their question, bring them up and connect the dots to their company profile.

YOU CAN ANSWER QUESTIONS LIKE:
- "Which tenders are closing this week?" → list them with days remaining
- "What funding could we qualify for?" → match ai_opportunities and your funding knowledge against their company profile
- "What documents are missing for Tender E137?" → list the Outstanding checklist items
- "Which tenders require a compulsory briefing?" → list them with briefing dates
- "What are the requirements for Tender E137?" → summarize the AI-extracted info
- "Summarise this tender for me" → use the AI summary format
- "What are the potential disqualification requirements?" → list them per tender
- "What PSIRA grades are required?" → list per tender
- "How many guards are required?" → list per tender
- "Which of our documents are going to expire before this tender closes?" → cross-reference library expiry dates with tender closing dates
- "Show me all tenders that we have submitted and are still waiting for an outcome" → list submitted tenders with no outcome set
- "Which tenders have we won this year?" → list Awarded tenders
- "Which tenders were unsuccessful and why?" → list with unsuccessful_reason
- "What's in the tender document?" → answer from the extracted document text
- "What changed in the addendum?" → summarize AI-detected changes
- "What's our pricing for E137?" → list pricing versions with totals
- "What should I do next to win E137?" → give a prioritized action plan

When the user asks a general tender or funding advice question (not about specific data), draw on your knowledge of South African procurement and business funding best practices.

YOUR TONE: Professional, encouraging, direct. You are the company's bid manager and you want them to win."""


def assistant_answer(question: str, context_data: Dict[str, Any]) -> str:
    """Answer a user question given the comprehensive system context."""
    # Build a focused context — include everything but cap size to avoid token limits
    context_str = json.dumps(context_data, default=str)
    # Cap at 40000 chars (~10000 tokens) to leave room for the answer
    if len(context_str) > 40000:
        context_str = context_str[:40000] + "\n...[truncated, more data exists]..."

    prompt = f"""Answer the user's question using the COMPLETE SYSTEM SNAPSHOT below.

This snapshot contains ALL data from every part of the TM Flow system:
- All tenders with full details, AI-extracted info, checklists, documents, briefings, pricing, submissions, communications, addendums
- The compliance document library with expiry dates
- Dashboard statistics
- Extracted text from uploaded tender documents

COMPLETE SYSTEM SNAPSHOT (JSON):
{context_str}

USER QUESTION:
{question}

    Remember your mission: help the user WIN this tender. Be specific, actionable, and honest. Reference tenders by their reference number. If the question is about a specific tender, focus on that tender's data. If data is missing, say so."""
    return _gemini_chat(prompt, system=ASSISTANT_SYSTEM, max_tokens=6000)


def answer_general_question(question: str) -> str:
    """General fallback chat (no system data)."""
    return _gemini_chat(question, system=ASSISTANT_SYSTEM)


# ---- Document text extraction (PDF / txt) ----

def extract_text_from_pdf(file_path: str) -> str:
    """Extract text from a PDF using pdfplumber."""
    try:
        import pdfplumber
        text_parts = []
        with pdfplumber.open(file_path) as pdf:
            for i, page in enumerate(pdf.pages):
                try:
                    page_text = page.extract_text() or ""
                except Exception:
                    page_text = ""
                text_parts.append(page_text)
                if i >= 50:  # cap pages
                    break
        return "\n".join(text_parts)
    except Exception as e:
        return f"[PDF extraction error: {e}]"


def extract_text_from_file(file_path: str, filename: str) -> str:
    """Extract text from supported file types."""
    lower = filename.lower()
    if lower.endswith(".pdf"):
        return extract_text_from_pdf(file_path)
    if lower.endswith((".txt", ".md", ".csv", ".json", ".log")):
        try:
            with open(file_path, "r", encoding="utf-8", errors="ignore") as f:
                return f.read()
        except Exception as e:
            return f"[Text extraction error: {e}]"
    # For docx, try a simple zip-based extraction
    if lower.endswith(".docx"):
        try:
            import zipfile, re
            with zipfile.ZipFile(file_path) as z:
                with z.open("word/document.xml") as f:
                    content = f.read().decode("utf-8", errors="ignore")
            # Strip XML tags
            text = re.sub(r"<[^>]+>", " ", content)
            text = re.sub(r"\s+", " ", text)
            return text
        except Exception as e:
            return f"[DOCX extraction error: {e}]"
    return f"[Unsupported file type: {filename}]"


# ---- AI Tender Discovery (web search) ----

def _gemini_web_search(query: str, num: int = 10, timeout: float = 60.0) -> List[Dict[str, Any]]:
    """
    Search the web via Gemini Google Search grounding and return results.

    Grounding is unavailable on some API tiers (HTTP 429), so any failure
    degrades to an empty list. Callers treat that as "no AI top-up results"
    and fall back to the Python tender scrapers.
    """
    payload = {
        "contents": [{"parts": [{"text": query}]}],
        "tools": [{"google_search": {}}],
        "generationConfig": {"maxOutputTokens": 8000},
    }
    try:
        # Grounding has its own quota. Let the model chain handle the fallback,
        # but do NOT pause the whole service — if search is unavailable the
        # portal scrapers still return real tenders, while chat, summaries and
        # reports must keep working.
        data = _gemini_post(payload, timeout, trip_breaker=False)
    except Exception:
        return []

    chunks = ((data.get("candidates") or [{}])[0]
              .get("groundingMetadata") or {}
              .get("groundingChunks") or [])
    results: List[Dict[str, Any]] = []
    for chunk in chunks:
        web = chunk.get("web") or {}
        uri = web.get("uri") or web.get("url")
        title = web.get("title")
        if not uri and not title:
            continue
        results.append({
            "title": title or uri or "",
            "url": uri or "",
            "snippet": (chunk.get("text") or "")[:1000],
        })
    return results[:num] if num else results


# South African tender portals to prioritize in search
TENDER_SITES = [
    "tenderbulletins.co.za",
    "tenderalerts.co.za",
    "etenders.gov.za",
    "globaltenders.com",
    "tenderflow.co.za",
    "easytenders.co.za",
    "security.co.za",
    "psira.co.za",
    "municipalities.co.za",
    "gov.za",
]

DISCOVER_SYSTEM = """You are a tender discovery analyst specializing in South African procurement.
You analyze web search results and identify real, open tender opportunities.
You MUST respond with ONLY a valid JSON array (no markdown, no code fences, no extra text).
Each element in the array must follow this schema:
{
  "title": string (the tender title),
  "client": string (the organisation/client issuing the tender, or "Unknown" if not clear),
  "category": string (e.g. "Security Services", "Cleaning", "Construction"),
  "location": string (region/city/province, or "South Africa" if not specified),
  "closing_date": string (ISO format YYYY-MM-DD if mentioned, or null),
  "description": string (1-3 sentence summary of what the tender is about),
  "source_site": string (the domain name of the source),
  "url": string (the direct link to the tender page),
  "reference_number": string (if a tender/RFP number is mentioned, else null),
  "estimated_value": string (if a value is mentioned, else null),
  "relevance": "high" | "medium" | "low" (how relevant this is to the user's search)
}
Only include results that are ACTUAL tender opportunities (not news articles, not blog posts, not generic pages).
If no results are actual tenders, return an empty array [].
Deduplicate by URL."""


_STOPWORDS = {
    "the", "and", "for", "with", "that", "this", "from", "have", "has", "our",
    "company", "organisation", "organization", "services", "service", "limited",
    "south", "africa", "document", "documents", "profile", "tender", "tenders",
    "what", "can", "does", "they", "their", "which", "were", "been", "into",
    "also", "about", "holds", "organises", "capability", "provides", "provide",
    "provides", "offers", "offer", "specialises", "specialize", "specializes",
    "specialisation", "undertakes", "supplies", "delivers", "focused", "focuses",
    "own", "its", "us", "uploaded", "including", "include", "across", "various",
    "core", "work", "includes", "include", "activities", "activity", "business",
    "group", "holdings", "solutions", "solution", "management", "limited", "ltd",
    "pty", "registered", "registration", "number", "level", "based",
}


def _company_name_phrases(capability: str) -> set:
    """Normalised words of the organisation's own name, so we never treat
    "Sparkle Cleaning" as one of its service offerings."""
    names = set()
    for line in str(capability or "").splitlines():
        low = line.strip().lower()
        if not low.startswith("company:"):
            continue
        # The name is only the first clause after the label — anything after a
        # sentence break is description, not part of the name.
        name = re.split(r"[.,;:\(\)\[\]\n]", low.split(":", 1)[1])[0].strip()
        for w in re.findall(r"[a-z][a-z\-]+", name):
            names.add(w)
        if name:
            names.add(name)
    return names


_SERVICE_INTRO = re.compile(
    r"(?:provides?|offers?|speciali[sz]es?\s+in|undertakes?|supplies|delivers?|"
    r"focus(?:es)?\s+on|focused\s+on|core\s+work\s+is|work\s+includes?)\s+"
    r"(?:the\s+|a\s+|an\s+)?([^.;\n]{3,220})",
    re.I,
)


def _clean_phrase(text: str, own_words: set) -> Optional[str]:
    """Trim a raw fragment down to a tidy 1-3 word service phrase."""
    tokens = [w for w in re.findall(r"[a-z][a-z\-]+", str(text).lower())]
    # Drop leading filler such as "in", "our", "the".
    while tokens and tokens[0] in _STOPWORDS:
        tokens.pop(0)
    tokens = tokens[:3]
    while tokens and tokens[-1] in _STOPWORDS:
        tokens.pop()
    if not tokens:
        return None
    if not any(len(w) > 4 for w in tokens):
        return None
    phrase = " ".join(tokens)
    if phrase in own_words or all(w in own_words for w in tokens):
        return None
    return phrase


def _capability_terms(capability: str) -> List[str]:
    """Pick the tenant's service offerings out of their knowledge base.

    Their uploaded documents are free text, so we look for the lists companies
    write when describing themselves — "provides office cleaning, deep cleaning
    and window cleaning" — and keep those service phrases. The organisation's own
    name is never treated as a service.
    """
    if not capability:
        return []
    own_words = _company_name_phrases(capability)

    out: List[str] = []

    def _add(phrase: Optional[str]) -> None:
        if not phrase or len(out) >= 5:
            return
        if any(phrase in kept or kept in phrase for kept in out):
            return
        out.append(phrase)

    # 1. Explicit service lists ("provides X, Y and Z").
    for match in _SERVICE_INTRO.finditer(str(capability)):
        tail = match.group(1)
        for fragment in re.split(r",| and | & |/|;|\bor\b", tail):
            _add(_clean_phrase(fragment, own_words))

    if out:
        return out

    # 2. Fallback: repeated phrases anywhere in the documents.
    text = " ".join(str(capability).split()).lower()
    phrases: Dict[str, int] = {}
    for segment in re.split(r"[,.;:()\[\]\n/]+", text):
        words = re.findall(r"[a-z][a-z\-]+", segment)
        for n in (3, 2):
            for i in range(len(words) - n + 1):
                gram = words[i: i + n]
                if any(w in _STOPWORDS for w in gram):
                    continue
                if all(w in own_words for w in gram):
                    continue
                if not any(len(w) > 4 for w in gram):
                    continue
                key = " ".join(gram)
                phrases[key] = phrases.get(key, 0) + 1
    for phrase, count in sorted(
        phrases.items(), key=lambda kv: (-kv[1], -len(kv[0].split()))
    ):
        if count < 2:
            break
        _add(phrase)
    return out


def discover_tenders(
    category: str,
    keywords: str = "",
    location: str = "South Africa",
    num_results: int = 15,
    skip_scrapers: bool = False,
    search_timeout: float = 60.0,
    capability: str = "",
) -> Dict[str, Any]:
    """
    Find real open tenders matching the given criteria.

    `capability` is the tenant's own capability profile (their uploaded
    documents, profile and history). When present it drives the search, so a
    cleaning company surfaces cleaning tenders rather than generic ones.
    Uses Python scrapers to directly fetch real tender listings from SA portals,
    then falls back to AI web search for broader coverage.
    Returns a dict with 'query', 'results', 'sources', 'raw_count'.
    """
    # Derive the search terms from the organisation's own capability text so the
    # search reflects what this tenant can actually deliver.
    service_terms = _capability_terms(capability)
    if service_terms:
        query = (
            " OR ".join(f'"{t}" tender' for t in service_terms[:5])
            + f" South Africa open {location} 2026 site:gov.za OR site:etenders.gov.za"
        )
    else:
        parts = []
        if category:
            parts.append(category)
        if keywords:
            parts.append(keywords)
        parts.append("tender")
        parts.append("open")
        if location:
            parts.append(location)
        query = " ".join(parts)

    # --- Step 1: Python scrapers (direct fetch from real tender portals) ---
    scraped_results: List[Dict[str, Any]] = []
    sources_used: List[str] = []
    scrape_errors: List[str] = []

    if not skip_scrapers:
        try:
            from scraper import scrape_all
            scrape_data = scrape_all(category, keywords, location, limit=num_results)
            scraped_results = scrape_data.get("results", [])
            sources_used = scrape_data.get("sources", [])
            scrape_errors = scrape_data.get("errors", [])
        except Exception as e:
            scrape_errors.append(f"scraper module: {str(e)[:100]}")

    # --- Step 2: AI web search for additional coverage ---
    web_search_results: List[Dict[str, Any]] = []
    if len(scraped_results) < num_results:
        try:
            raw_results = _gemini_web_search(query, num=num_results, timeout=search_timeout)
            if raw_results:
                # Use AI to structure the raw web search results
                raw_text = json.dumps(raw_results, indent=2, default=str)[:20000]
                prompt = f"""Analyze these web search results and extract ONLY actual tender opportunities.
If a result is a news article, blog page, PDF of unrelated content, or generic page (not an actual tender listing), EXCLUDE it.
Only keep a result if its `url` is the page where that specific tender is published.

THE ORGANISATION WE ARE SEARCHING FOR (its own profile and uploaded documents):
{capability[:4000] if capability else f"{category} {keywords} company in {location}"}

Find tenders this specific organisation could actually bid on — match its services, sectors and size.

RAW SEARCH RESULTS (JSON):
{raw_text}

Return ONLY the JSON array as specified. Exclude non-tender results."""
                try:
                    response = _gemini_chat(prompt, system=DISCOVER_SYSTEM)
                    response = response.strip()
                    if response.startswith("```"):
                        response = response.split("\n", 1)[1] if "\n" in response else response[3:]
                        if response.endswith("```"):
                            response = response[:-3]
                        response = response.strip()
                    if response.startswith("json"):
                        response = response[4:].strip()
                    first = response.find("[")
                    last = response.rfind("]")
                    if first >= 0 and last > first:
                        response = response[first:last + 1]
                    structured = json.loads(response)
                    if isinstance(structured, list):
                        web_search_results = structured
                        if web_search_results:
                            sources_used.append(f"AI web search ({len(web_search_results)} tenders)")
                except (json.JSONDecodeError, RuntimeError):
                    pass
        except Exception:
            pass

    # --- Merge & deduplicate ---
    from scraper import public_url_or_none

    all_results = scraped_results + web_search_results
    seen_keys = set()
    deduped = []
    for r in all_results:
        # Never surface a login-wall link; dedup by public link when we have one.
        r["url"] = public_url_or_none(r.get("url"))
        key = (r.get("url") or "").strip().lower() or (r.get("title") or "").lower().strip()[:80]
        if not key or key in seen_keys:
            continue
        seen_keys.add(key)
        deduped.append(r)

    # Sort by relevance then closing date
    rel_order = {"high": 0, "medium": 1, "low": 2}
    deduped.sort(key=lambda r: (rel_order.get(r.get("relevance", "medium"), 1), r.get("closing_date") or "9999"))

    return {
        "query": query,
        "results": deduped[:num_results],
        "sources": sources_used,
        "errors": scrape_errors,
        "raw_count": len(deduped),
        "scraped_count": len(scraped_results),
        "web_search_count": len(web_search_results),
    }


def discover_tenders_verified(
    category: str,
    keywords: str = "",
    location: str = "South Africa",
    num_results: int = 15,
    capability: str = "",
    skip_scrapers: bool = False,
    search_timeout: float = 60.0,
    verify_timeout: float = 9.0,
) -> Dict[str, Any]:
    """discover_tenders + live link verification.

    Every candidate URL is actually fetched. Anything that 404s, times out or
    lands on a sign-in page is removed, so the tenant only ever receives
    tenders whose page they can open.
    """
    from linkcheck import verify_links, apply_verdicts

    data = discover_tenders(
        category,
        keywords=keywords,
        location=location,
        num_results=num_results,
        skip_scrapers=skip_scrapers,
        search_timeout=search_timeout,
        capability=capability,
    )
    candidates = data.get("results") or []
    linked = [c for c in candidates if c.get("url")]
    verdicts = verify_links([c.get("url") for c in linked], timeout=verify_timeout)
    verified = apply_verdicts([dict(c) for c in linked], verdicts)

    # Results that legitimately have no link (members-only sources) are kept but
    # flagged, so the UI can hide the "Open" button rather than show a dead one.
    kept_originals = {
        original
        for original, v in verdicts.items()
        if v.get("kind") in ("page", "pdf")
    }
    verified_originals = set()
    for item in verified:
        verified_originals.add(item.get("_orig_url") or item.get("url"))
    for c in candidates:
        original = c.get("url")
        if original and original in kept_originals and original in verified_originals:
            continue
        if not original:
            c.setdefault("link_kind", "none")
            verified.append(c)

    verified.sort(
        key=lambda r: (
            {"high": 0, "medium": 1, "low": 2}.get(r.get("relevance", "medium"), 1),
            0 if r.get("link_kind") in ("page", "pdf") else 1,
            r.get("closing_date") or "9999",
        )
    )
    data["results"] = verified[:num_results]
    data["links_checked"] = len(linked)
    data["links_kept"] = sum(1 for v in verdicts.values() if v.get("kind") in ("page", "pdf"))
    data["links_dropped"] = len(linked) - data["links_kept"]
    data["raw_count"] = len(verified)
    return data


# ---- AI Agent: briefing narrative / funding discovery / match scoring ----

BRIEFING_SYSTEM = """You are the dedicated procurement success AI for a South African company.

Write a short, engaging, first-person greeting (3-6 sentences) for the company's dashboard.

Rules:
- Greet the user by their first name when one is given, then state that you are the company's dedicated procurement success AI and that your mission is to make them win tenders and secure the funding they need.
- Be warm and human — you're an enthusiastic teammate who already did the work before they arrived. Never sound robotic or generic.
- Highlight the most urgent closing tender, the best-matched funding opportunity, and the biggest readiness risk, using ONLY the facts given.
- If facts.next_action is present, make that the single most important next action you end with.
- If facts.knowledge_base_empty is true, explain plainly that you find tenders by reading the company's knowledge base (profile, certificates, capability documents), that it is currently empty, and ask them to upload it. Do not pretend to have found relevant tenders.
- If facts.services_known is non-empty, mention the services you learned from their documents so they can see you understood their business.
- If nothing is closing and nothing was found yet, say that you are actively searching and opportunities will appear automatically.
- Be a coach: end with one clear next step.
- Plain text only. No markdown, no headings, no bullet points. Do not invent facts that are not in the data."""


def generate_briefing(company_name: str, facts: Dict[str, Any], memory: Dict[str, Any]) -> str:
    """Write the briefing greeting. Raises RuntimeError on Gemini failure;
    the caller falls back to a deterministic template."""
    prompt = f"""Write today's greeting for {company_name or "your company"}.

USER'S FIRST NAME: {(facts or {}).get("user_name") or "not given"}

COMPANY MEMORY (the organisation's mission, goals, preferences):
{json.dumps(memory, default=str)}

FACTS (use only these):
{json.dumps(facts, default=str)}

Write the greeting now."""
    return _gemini_chat(prompt, system=BRIEFING_SYSTEM, max_tokens=1000, timeout=15)


FUNDING_DISCOVER_SYSTEM = """You are a South African business funding analyst. You analyze web search results and identify real, currently-open funding opportunities for businesses: grants, loans, incentives and support programmes (e.g. from SEFA, SEDA, IDC, NYDA, NEF, dtic, banks, development agencies) and tender-linked finance (bridging finance, purchase order funding, invoice discounting).
Respond with ONLY a valid JSON array (no markdown, no code fences). Each element:
{
  "title": string,
  "provider": string (the funder/institution, or "Unknown"),
  "type": "funding" | "finance"  ("funding" = grants/loans/programmes; "finance" = tender/PO/invoice-linked finance),
  "category": string (e.g. "Grant", "Loan", "Incentive", "Bridging finance"),
  "location": string ("South Africa" if national),
  "closing_date": string|null (ISO YYYY-MM-DD if applications close, else null),
  "description": string (2-3 sentences: what it funds, amounts, eligibility),
  "url": string,
  "source_site": string,
  "estimated_value": string|null (amount/range if mentioned)
}
Only include REAL funding opportunities with a working source URL. Deduplicate by URL. If none, return []."""


def discover_funding(profile_summary: str, location: str = "South Africa") -> List[Dict[str, Any]]:
    """Find business funding programmes + tender finance via web search.
    Any failure degrades to an empty list — research keeps going."""
    from concurrent.futures import ThreadPoolExecutor
    from datetime import datetime

    year = datetime.now().year
    queries = [
        f"South African business funding grants loans incentives open for applications {year} {profile_summary} {location}",
        f"tender bridging finance purchase order funding SMME South Africa {year}",
    ]
    raw: List[Dict[str, Any]] = []
    with ThreadPoolExecutor(max_workers=2) as pool:
        futures = [pool.submit(_gemini_web_search, q, 10, 12.0) for q in queries]
        for f in futures:
            try:
                raw.extend(f.result() or [])
            except Exception:
                pass
    if not raw:
        return []

    raw_text = json.dumps(raw, indent=2, default=str)[:20000]
    prompt = f"""Extract ONLY real, currently-open funding opportunities from these search results.

COMPANY: {profile_summary}

RAW SEARCH RESULTS (JSON):
{raw_text}

Return ONLY the JSON array as specified."""
    try:
        response = _gemini_chat(prompt, system=FUNDING_DISCOVER_SYSTEM, timeout=12)
        response = response.strip()
        if response.startswith("```"):
            response = response.split("\n", 1)[1] if "\n" in response else response[3:]
            if response.endswith("```"):
                response = response[:-3]
            response = response.strip()
        if response.startswith("json"):
            response = response[4:].strip()
        first, last = response.find("["), response.rfind("]")
        if first >= 0 and last > first:
            response = response[first:last + 1]
        items = json.loads(response)
        return items if isinstance(items, list) else []
    except (json.JSONDecodeError, RuntimeError):
        return []


def score_opportunities(company_summary: str, opportunities: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """Score how well each opportunity fits the company — ONE batched call.
    Returns [{"index": i, "score": 0-100, "reason": str}]; empty list on failure."""
    if not opportunities:
        return []
    listing = []
    for i, o in enumerate(opportunities):
        listing.append({
            "index": i,
            "title": (o.get("title") or "")[:200],
            "provider": (o.get("provider") or "")[:100],
            "type": o.get("type", "tender"),
            "location": (o.get("location") or "")[:100],
            "description": (o.get("description") or "")[:400],
        })
    prompt = f"""Score how well EACH opportunity below fits this company (0-100) and give a one-sentence reason starting with "You can apply because..." or "Apply with caution because...".

COMPANY:
{company_summary}

OPPORTUNITIES (JSON):
{json.dumps(listing)}

Respond with ONLY a JSON array: [{{"index": int, "score": int, "reason": string}}] with one element per opportunity index."""
    try:
        response = _gemini_chat(prompt, max_tokens=4000, timeout=15)
        response = response.strip()
        if response.startswith("```"):
            response = response.split("\n", 1)[1] if "\n" in response else response[3:]
            if response.endswith("```"):
                response = response[:-3]
            response = response.strip()
        if response.startswith("json"):
            response = response[4:].strip()
        first, last = response.find("["), response.rfind("]")
        if first >= 0 and last > first:
            response = response[first:last + 1]
        parsed = json.loads(response)
        scores = {}
        for item in parsed if isinstance(parsed, list) else []:
            if not isinstance(item, dict):
                continue
            try:
                idx = int(item.get("index"))
                score = int(item.get("score", 0))
                if 0 <= idx < len(opportunities):
                    scores[idx] = {
                        "index": idx,
                        "score": max(0, min(100, score)),
                        "reason": str(item.get("reason", ""))[:500],
                    }
            except (TypeError, ValueError):
                continue
        return list(scores.values())
    except (json.JSONDecodeError, RuntimeError):
        return []


# ---- AI Document Generation (tender-specific documents on company letterhead) ----

DOC_GEN_SYSTEM = """You are a professional tender document writer for South African companies.
You generate formal, submission-ready tender documents that are specific to each tender.
Your documents must be:
1. Professional and formal in tone
2. Specific to the tender (reference the tender number, client, scope)
3. Comprehensive and detailed
4. Structured with clear headings and sections
5. Ready to be placed on company letterhead

Output format: Use plain text with clear section headings in UPPERCASE, numbered sections, and bullet points where appropriate.
Do NOT use markdown formatting (no **, no ##, no `). Use plain text only.

If a letterhead image URL is provided, start the document with:
[LETTERHEAD: <letterhead_url>]

Then the document content.
If no letterhead URL is provided, start each document with a formal header block:

[COMPANY NAME]
[Company Address]
[Phone] | [Email] | [Website]
Registration No: [Reg Number] | VAT: [VAT] | PSIRA: [PSIRA No]

Then the document title, reference, and date.
Then the table of contents (if applicable).
Then the body content.
End with a signature block for the director/authorized signatory.

If a signature image URL is provided, include a reference to it in the signature block:
[SIGNATURE: <signature_url>]

The signature block should include:
- The signature image reference (if provided)
- Director/Authorized Signatory name
- Title (e.g. Managing Director)
- Date
- Company stamp/seal placeholder"""


def _build_company_header(company: Dict[str, Any]) -> str:
    """Build a company letterhead header string from company profile data."""
    lines = []
    if company.get("company_name"):
        lines.append(company["company_name"].upper())
    if company.get("address"):
        lines.append(company["address"])
    contact_parts = []
    if company.get("phone"):
        contact_parts.append(f"Tel: {company['phone']}")
    if company.get("email"):
        contact_parts.append(f"Email: {company['email']}")
    if company.get("website"):
        contact_parts.append(f"Web: {company['website']}")
    if contact_parts:
        lines.append(" | ".join(contact_parts))
    reg_parts = []
    if company.get("registration_number"):
        reg_parts.append(f"Reg No: {company['registration_number']}")
    if company.get("vat_number"):
        reg_parts.append(f"VAT: {company['vat_number']}")
    if company.get("psira_number"):
        reg_parts.append(f"PSIRA: {company['psira_number']}")
    if reg_parts:
        lines.append(" | ".join(reg_parts))
    if company.get("bbbbee_level"):
        lines.append(f"B-BBEE: {company['bbbbee_level']}")
    return "\n".join(lines) if lines else "[COMPANY NAME]"


def generate_method_statement(tender: Dict[str, Any], extracted: Dict[str, Any], company: Dict[str, Any]) -> str:
    """Generate a tender-specific Method Statement on company letterhead."""
    header = _build_company_header(company)
    prompt = f"""Generate a comprehensive METHOD STATEMENT for the following tender.
This must be a formal, detailed document that explains HOW the company will deliver the services.

COMPANY PROFILE:
{header}
Director: {company.get('director_name', '[Director Name]')}, {company.get('director_title', 'Director')}

TENDER DETAILS:
- Reference: {tender.get('reference_number', 'N/A')}
- Title: {tender.get('title', 'N/A')}
- Client: {tender.get('client_company', 'N/A')}
- Location: {tender.get('location_site', 'N/A')}
- Contract Period: {tender.get('contract_period', 'N/A')}

AI-EXTRACTED TENDER INFO:
{json.dumps(extracted, default=str, indent=2)[:8000]}

The Method Statement must include:
1. Introduction and project understanding
2. Scope of work (specific to this tender)
3. Methodology and approach
4. Personnel and staffing plan (including PSIRA grades if security tender)
5. Equipment and resources
6. Operational procedures
7. Quality assurance
8. Health and safety
9. Supervision and management
10. Reporting and communication

Make it specific to THIS tender — reference the client, the scope, the personnel requirements.
Generate at least 2000 words. Be detailed and professional."""
    try:
        return _gemini_chat(prompt, system=DOC_GEN_SYSTEM, max_tokens=6000)
    except RuntimeError as e:
        return f"Document generation failed: {e}"


def generate_implementation_plan(tender: Dict[str, Any], extracted: Dict[str, Any], company: Dict[str, Any]) -> str:
    """Generate a tender-specific Implementation Plan on company letterhead."""
    header = _build_company_header(company)
    prompt = f"""Generate a comprehensive IMPLEMENTATION PLAN for the following tender.
This must be a formal, detailed document that explains the step-by-step plan for implementing the contract.

COMPANY PROFILE:
{header}

TENDER DETAILS:
- Reference: {tender.get('reference_number', 'N/A')}
- Title: {tender.get('title', 'N/A')}
- Client: {tender.get('client_company', 'N/A')}
- Contract Period: {tender.get('contract_period', 'N/A')}

AI-EXTRACTED TENDER INFO:
{json.dumps(extracted, default=str, indent=2)[:8000]}

The Implementation Plan must include:
1. Project initiation and mobilization
2. Phase 1: Setup and preparation (first 30 days)
3. Phase 2: Full deployment (day 31-60)
4. Phase 3: Steady-state operations (ongoing)
5. Timeline with milestones (use a week-by-week breakdown for the first 90 days)
6. Resource allocation per phase
7. Key deliverables and deadlines
8. Risk mitigation during implementation
9. Transition and handover plan
10. Monitoring and review schedule

Make it specific to THIS tender. Generate at least 2000 words."""
    try:
        return _gemini_chat(prompt, system=DOC_GEN_SYSTEM, max_tokens=6000)
    except RuntimeError as e:
        return f"Document generation failed: {e}"


def generate_technical_proposal(tender: Dict[str, Any], extracted: Dict[str, Any], company: Dict[str, Any]) -> str:
    """Generate a tender-specific Technical Proposal on company letterhead."""
    header = _build_company_header(company)
    functionality = extracted.get("functionality_requirements", [])
    eval_criteria = extracted.get("evaluation_criteria", [])
    prompt = f"""Generate a comprehensive TECHNICAL PROPOSAL for the following tender.
This must address the functionality requirements and evaluation criteria to maximize the technical score.

COMPANY PROFILE:
{header}

TENDER DETAILS:
- Reference: {tender.get('reference_number', 'N/A')}
- Title: {tender.get('title', 'N/A')}
- Client: {tender.get('client_company', 'N/A')}
- Contract Period: {tender.get('contract_period', 'N/A')}

AI-EXTRACTED TENDER INFO:
Functionality requirements: {json.dumps(functionality, default=str)}
Evaluation criteria: {json.dumps(eval_criteria, default=str)}
Mandatory requirements: {json.dumps(extracted.get('mandatory_requirements', []), default=str)}
Scope: {extracted.get('scope_of_work', 'N/A')}
Personnel required: {extracted.get('number_of_personnel_guards', 'N/A')}
PSIRA grades: {extracted.get('required_psira_grades', [])}

The Technical Proposal must include:
1. Executive summary
2. Understanding of the client's needs
3. Company capability and experience
4. Technical approach (addressing each functionality requirement)
5. Personnel deployment plan (with PSIRA grades if applicable)
6. Equipment and technology
7. Training and development
8. Quality management system
9. Performance monitoring
10. Compliance with mandatory requirements (address each one)

Address EVERY functionality requirement and evaluation criterion explicitly.
Generate at least 2500 words. Be persuasive — this is what wins the technical score."""
    try:
        return _gemini_chat(prompt, system=DOC_GEN_SYSTEM, max_tokens=6000)
    except RuntimeError as e:
        return f"Document generation failed: {e}"


def generate_risk_assessment(tender: Dict[str, Any], extracted: Dict[str, Any], company: Dict[str, Any]) -> str:
    """Generate a tender-specific Risk Assessment on company letterhead."""
    header = _build_company_header(company)
    prompt = f"""Generate a comprehensive RISK ASSESSMENT for the following tender.
This must be a formal risk assessment document specific to the tender's scope and location.

COMPANY PROFILE:
{header}

TENDER DETAILS:
- Reference: {tender.get('reference_number', 'N/A')}
- Title: {tender.get('title', 'N/A')}
- Client: {tender.get('client_company', 'N/A')}
- Location: {tender.get('location_site', 'N/A')}
- Scope: {extracted.get('scope_of_work', 'N/A')}

The Risk Assessment must include:
1. Introduction and methodology
2. Risk identification (at least 15 risks specific to this tender)
3. Risk analysis matrix (likelihood x impact) — present as a table
4. Risk evaluation and priority
5. Risk mitigation strategies for each identified risk
6. Residual risk assessment
7. Risk monitoring and review
8. Emergency response procedures
9. Contingency plans

For each risk, include: Risk ID, Description, Likelihood (High/Medium/Low), Impact (High/Medium/Low), Risk Rating, Mitigation, Owner.
Generate at least 2000 words."""
    try:
        return _gemini_chat(prompt, system=DOC_GEN_SYSTEM, max_tokens=6000)
    except RuntimeError as e:
        return f"Document generation failed: {e}"


def generate_sops(tender: Dict[str, Any], extracted: Dict[str, Any], company: Dict[str, Any]) -> str:
    """Generate Standard Operating Procedures specific to the tender."""
    header = _build_company_header(company)
    prompt = f"""Generate comprehensive STANDARD OPERATING PROCEDURES (SOPs) for the following tender.
These must be operational procedures that staff will follow daily.

COMPANY PROFILE:
{header}

TENDER DETAILS:
- Reference: {tender.get('reference_number', 'N/A')}
- Title: {tender.get('title', 'N/A')}
- Client: {tender.get('client_company', 'N/A')}
- Scope: {extracted.get('scope_of_work', 'N/A')}
- Personnel: {extracted.get('number_of_personnel_guards', 'N/A')}
- PSIRA grades: {extracted.get('required_psira_grades', [])}

Generate at least 10 SOPs, each with:
- SOP Number and Title
- Purpose
- Scope
- Responsibilities
- Procedure (step by step)
- Related documents

Include SOPs for:
1. Guard deployment and shift handover
2. Access control
3. Incident reporting and response
4. Emergency procedures
5. Patrol and surveillance
6. Communication protocols
7. Equipment use and maintenance
8. Health and safety
9. Training and induction
10. Performance monitoring

Generate at least 2500 words. Be specific to this tender's scope."""
    try:
        return _gemini_chat(prompt, system=DOC_GEN_SYSTEM, max_tokens=6000)
    except RuntimeError as e:
        return f"Document generation failed: {e}"


def generate_table_of_contents(tender: Dict[str, Any], extracted: Dict[str, Any], company: Dict[str, Any]) -> str:
    """Generate a Table of Contents for the full tender submission package."""
    prompt = f"""Generate a comprehensive TABLE OF CONTENTS for a tender submission package for the following tender.
This should cover ALL documents that would be included in the final submission.

TENDER DETAILS:
- Reference: {tender.get('reference_number', 'N/A')}
- Title: {tender.get('title', 'N/A')}
- Client: {tender.get('client_company', 'N/A')}

AI-EXTRACTED COMPULSORY DOCUMENTS:
{json.dumps(extracted.get('compulsory_documents', []), default=str)}

Generate a table of contents with:
1. Cover letter
2. Company profile
3. Compliance documents (CIPC, SARS, B-BBEE, PSIRA, COIDA, etc.)
4. Technical proposal
5. Method statement
6. Implementation plan
7. Risk assessment
8. SOPs
9. Organogram
10. Pricing schedule
11. References
12. Signed declarations
13. Appendices

Number each section (1, 2, 3...) with sub-sections (1.1, 1.2, ...).
Also include a brief description of what each section contains.
Format as a clean, professional table of contents."""
    try:
        return _gemini_chat(prompt, system=DOC_GEN_SYSTEM, max_tokens=3000)
    except RuntimeError as e:
        return f"Document generation failed: {e}"


# ---- Additional document generators ----

def generate_cover_letter(tender: Dict[str, Any], extracted: Dict[str, Any], company: Dict[str, Any]) -> str:
    header = _build_company_header(company)
    prompt = f"""Generate a formal COVER LETTER for the following tender submission.

COMPANY PROFILE:
{header}
Director: {company.get('director_name', '[Director Name]')}, {company.get('director_title', 'Director')}

TENDER DETAILS:
- Reference: {tender.get('reference_number', 'N/A')}
- Title: {tender.get('title', 'N/A')}
- Client: {tender.get('client_company', 'N/A')}
- Closing Date: {tender.get('closing_date', 'N/A')}

The Cover Letter must include:
1. INTRODUCTION AND PURPOSE OF SUBMISSION
   - Formal introduction of the company
   - Statement of intent to submit a bid for this tender
   - Reference to the tender number and title
2. CONFIRMATION OF UNDERSTANDING OF TENDER REQUIREMENTS
   - Demonstrate understanding of the scope of work
   - Acknowledge all mandatory requirements and conditions
   - Confirm ability to meet all submission deadlines
3. SUMMARY OF KEY STRENGTHS AND QUALIFICATIONS
   - Relevant experience in similar contracts
   - Key personnel qualifications (PSIRA grades if applicable)
   - Track record of successful service delivery
   - B-BBEE status and compliance credentials
4. EXPRESSION OF COMMITMENT TO QUALITY SERVICE DELIVERY
   - Commitment to meeting and exceeding service standards
   - Dedication to client satisfaction
   - Willingness to adapt to client requirements
5. CONTACT INFORMATION FOR FOLLOW-UP QUERIES
   - Primary contact person and details
   - Availability for clarifications or presentations

Generate at least 800 words. Be formal, professional, and persuasive."""
    try:
        return _gemini_chat(prompt, system=DOC_GEN_SYSTEM, max_tokens=4000)
    except RuntimeError as e:
        return f"Document generation failed: {e}"


def generate_company_profile(tender: Dict[str, Any], extracted: Dict[str, Any], company: Dict[str, Any]) -> str:
    header = _build_company_header(company)
    prompt = f"""Generate a comprehensive COMPANY PROFILE document for the following tender submission.

COMPANY PROFILE:
{header}

TENDER DETAILS:
- Reference: {tender.get('reference_number', 'N/A')}
- Title: {tender.get('title', 'N/A')}
- Client: {tender.get('client_company', 'N/A')}
- Scope: {extracted.get('scope_of_work', 'N/A')}

The Company Profile must include:
1. COMPANY OVERVIEW AND HISTORY
   - Founding date and background
   - Growth trajectory and milestones
   - Current operational scale
2. MISSION, VISION, AND VALUES
   - Mission statement
   - Vision for the future
   - Core values (integrity, excellence, etc.)
3. CORE BUSINESS ACTIVITIES
   - Primary services offered
   - Specialized capabilities
   - Industry sectors served
4. KEY DIFFERENTIATORS AND COMPETITIVE ADVANTAGES
   - What sets the company apart
   - Unique service offerings
   - Technology and innovation
5. GEOGRAPHIC COVERAGE AND SERVICE AREAS
   - Regions of operation
   - Service delivery capabilities
   - Response times
6. COMPANY ACHIEVEMENTS AND CERTIFICATIONS
   - PSIRA registration (if security company)
   - B-BBEE status
   - ISO certifications
   - Industry awards and recognition

Generate at least 1500 words. Be professional and detailed."""
    try:
        return _gemini_chat(prompt, system=DOC_GEN_SYSTEM, max_tokens=5000)
    except RuntimeError as e:
        return f"Document generation failed: {e}"


def generate_compliance_docs(tender: Dict[str, Any], extracted: Dict[str, Any], company: Dict[str, Any]) -> str:
    header = _build_company_header(company)
    prompt = f"""Generate a COMPLIANCE DOCUMENTS summary/cover sheet for the following tender submission.

COMPANY PROFILE:
{header}

TENDER DETAILS:
- Reference: {tender.get('reference_number', 'N/A')}
- Client: {tender.get('client_company', 'N/A')}

AI-EXTRACTED COMPULSORY DOCUMENTS:
{json.dumps(extracted.get('compulsory_documents', []), default=str)}

The Compliance Documents section must include a formal cover sheet listing:
1. CIPC REGISTRATION CERTIFICATE
   - Company registration number
   - Confirmation of current registration status
2. SARS TAX COMPLIANCE CERTIFICATE
   - Tax reference number
   - Confirmation of tax compliance status
3. B-BBEE CERTIFICATE AND AFFIDAVIT
   - B-BBEE level
   - Certificate validity period
4. PSIRA REGISTRATION CERTIFICATES FOR ALL SECURITY PERSONNEL
   - PSIRA registration number
   - Confirmation of grades (if applicable: {extracted.get('required_psira_grades', [])})
5. COIDA REGISTRATION CERTIFICATE
   - Registration number
   - Confirmation of good standing
6. VALID PUBLIC LIABILITY INSURANCE CERTIFICATE
   - Insurance provider
   - Coverage amount and validity
7. WORKER'S COMPENSATION REGISTRATION
   - Registration details
8. PROOF OF VAT REGISTRATION
   - VAT number
9. SIGNED DECLARATION OF COMPLIANCE WITH ALL REGULATORY REQUIREMENTS
   - Formal declaration text
   - Director's signature block

For each item, provide a formal declaration that the document is attached and valid.
Generate at least 1000 words."""
    try:
        return _gemini_chat(prompt, system=DOC_GEN_SYSTEM, max_tokens=4000)
    except RuntimeError as e:
        return f"Document generation failed: {e}"


def generate_organogram(tender: Dict[str, Any], extracted: Dict[str, Any], company: Dict[str, Any]) -> str:
    header = _build_company_header(company)
    organogram_text = company.get("organogram_text", "")
    organogram_section = ""
    if organogram_text:
        organogram_section = f"""

IMPORTANT — THE COMPANY'S ACTUAL ORGANOGRAM (extracted from uploaded file):
Use this real organizational structure as the basis for the generated organogram.
Match the actual roles, names, titles, and reporting lines from this document.
Adapt the structure to include any additional roles required by the tender (e.g. extra guards, supervisors),
but keep the real company structure as the foundation.

ORGANOGRAM CONTENT:
{organogram_text[:8000]}
"""
    prompt = f"""Generate an ORGANOGRAM document for the following tender.

COMPANY PROFILE:
{header}

TENDER DETAILS:
- Reference: {tender.get('reference_number', 'N/A')}
- Client: {tender.get('client_company', 'N/A')}
- Personnel required: {extracted.get('number_of_personnel_guards', 'N/A')}
- PSIRA grades: {extracted.get('required_psira_grades', [])}
{organogram_section}

The Organogram must include:
1. ORGANIZATIONAL STRUCTURE
   - Visual description of the hierarchy (describe in text since this is a text document)
   - Top-level management
   - Middle management / supervisors
   - Operational staff
2. KEY PERSONNEL ROLES AND RESPONSIBILITIES
   2.1 Management Team
   - Project Manager / Director
   - Operations Manager
   - Compliance Officer
   2.2 Supervisory Staff
   - Site Supervisors (per location if applicable)
   - Shift Leaders
   2.3 Security Personnel / Operational Staff
   - Guards / Officers (by grade if applicable)
   - Control Room Operators
   - Response Team
3. REPORTING LINES AND COMMUNICATION CHANNELS
   - Chain of command
   - Escalation procedures
   - Communication flow between levels
4. STAFFING DEPLOYMENT MODEL
   - Shift patterns
   - Staff allocation per site
   - Relief and backup arrangements

Generate at least 1200 words. Be specific to this tender's personnel requirements."""
    try:
        return _gemini_chat(prompt, system=DOC_GEN_SYSTEM, max_tokens=4000)
    except RuntimeError as e:
        return f"Document generation failed: {e}"


def generate_pricing_schedule(tender: Dict[str, Any], extracted: Dict[str, Any], company: Dict[str, Any]) -> str:
    header = _build_company_header(company)
    prompt = f"""Generate a PRICING SCHEDULE document for the following tender.

COMPANY PROFILE:
{header}

TENDER DETAILS:
- Reference: {tender.get('reference_number', 'N/A')}
- Client: {tender.get('client_company', 'N/A')}
- Contract Period: {tender.get('contract_period', 'N/A')}
- Estimated Value: {tender.get('estimated_value', 'N/A')}

AI-EXTRACTED PRICING REQUIREMENTS:
{json.dumps(extracted.get('pricing_requirements', []), default=str)}
Personnel: {extracted.get('number_of_personnel_guards', 'N/A')}
PSIRA grades: {extracted.get('required_psira_grades', [])}
Equipment: {extracted.get('required_equipment', [])}

The Pricing Schedule must include:
1. DETAILED COST BREAKDOWN
   - Labour costs (by role/grade with monthly rates)
   - Equipment costs
   - Consumables
   - Transport
   - Overheads
   - Profit margin
2. PRICING STRUCTURE PER FACILITY/SHIFT
   - Day shift rates
   - Night shift rates
   - Weekend rates (if applicable)
   - Holiday rates
3. ADDITIONAL SERVICE COSTS
   - Optional services
   - Ad-hoc services
4. PAYMENT TERMS AND CONDITIONS
   - Payment cycle (monthly in arrears, etc.)
   - Invoice requirements
   - Late payment terms
5. PRICE ADJUSTMENT MECHANISMS
   - Annual escalation clauses
   - CPI-linked adjustments
   - Fuel price adjustments (if transport involved)
6. VALUE-ADDED SERVICES
   - Included at no extra cost
   - Optional premium services

Present the pricing in clear table format (using text-based tables).
Generate at least 1500 words."""
    try:
        return _gemini_chat(prompt, system=DOC_GEN_SYSTEM, max_tokens=5000)
    except RuntimeError as e:
        return f"Document generation failed: {e}"


def generate_references(tender: Dict[str, Any], extracted: Dict[str, Any], company: Dict[str, Any]) -> str:
    header = _build_company_header(company)
    prompt = f"""Generate a REFERENCES document for the following tender.

COMPANY PROFILE:
{header}

TENDER DETAILS:
- Reference: {tender.get('reference_number', 'N/A')}
- Client: {tender.get('client_company', 'N/A')}
- Scope: {extracted.get('scope_of_work', 'N/A')}

The References document must include:
1. CLIENT REFERENCE 1: [Client Name], [Project Details]
   - Client name and contact information
   - Contract value and duration
   - Scope of services provided
   - Key achievements and performance metrics
   - Client testimonial
2. CLIENT REFERENCE 2: [Client Name], [Project Details]
   - Same structure as above
3. CLIENT REFERENCE 3: [Client Name], [Project Details]
   - Same structure as above
4. CASE STUDIES OF SIMILAR PROJECTS
   - Project overview
   - Challenges and solutions
   - Results and outcomes
   - Lessons learned
5. TESTIMONIALS FROM EXISTING CLIENTS
   - Direct quotes from clients
   - Specific praise for service quality
   - Recommendations

Use placeholder names where real client details are not available, but make them realistic for the South African security/services industry.
Generate at least 1200 words."""
    try:
        return _gemini_chat(prompt, system=DOC_GEN_SYSTEM, max_tokens=4000)
    except RuntimeError as e:
        return f"Document generation failed: {e}"


def generate_signed_declarations(tender: Dict[str, Any], extracted: Dict[str, Any], company: Dict[str, Any]) -> str:
    header = _build_company_header(company)
    director = company.get('director_name', '[Director Name]')
    director_title = company.get('director_title', 'Director')
    prompt = f"""Generate a SIGNED DECLARATIONS document for the following tender.

COMPANY PROFILE:
{header}
Director: {director}, {director_title}

TENDER DETAILS:
- Reference: {tender.get('reference_number', 'N/A')}
- Title: {tender.get('title', 'N/A')}
- Client: {tender.get('client_company', 'N/A')}

The Signed Declarations must include:
1. DECLARATION OF ACCURACY OF INFORMATION PROVIDED
   - Formal statement that all information in the submission is true and accurate
   - Acknowledgment of consequences of false information
   - Signature block
2. DECLARATION OF COMPLIANCE WITH TENDER REQUIREMENTS
   - Confirmation that all mandatory requirements are met
   - Acknowledgment of all terms and conditions
   - Signature block
3. DECLARATION OF NO CONFLICT OF INTEREST
   - Statement of no existing conflict of interest
   - Disclosure of any potential conflicts
   - Signature block
4. DECLARATION OF UNDERSTANDING OF CONTRACTUAL TERMS
   - Confirmation of understanding of contract period, payment terms, etc.
   - Acknowledgment of penalties for non-performance
   - Signature block
5. DIRECTOR'S AUTHORIZATION OF SUBMISSION
   - Formal authorization by the director
   - Confirmation of authority to submit
   - Director's signature block with date

Each declaration should be a formal, legally-worded statement with a signature block.
Generate at least 1000 words."""
    try:
        return _gemini_chat(prompt, system=DOC_GEN_SYSTEM, max_tokens=4000)
    except RuntimeError as e:
        return f"Document generation failed: {e}"


def generate_appendices(tender: Dict[str, Any], extracted: Dict[str, Any], company: Dict[str, Any]) -> str:
    header = _build_company_header(company)
    prompt = f"""Generate an APPENDICES document for the following tender submission.

COMPANY PROFILE:
{header}

TENDER DETAILS:
- Reference: {tender.get('reference_number', 'N/A')}
- Client: {tender.get('client_company', 'N/A')}
- Scope: {extracted.get('scope_of_work', 'N/A')}
- Personnel: {extracted.get('number_of_personnel_guards', 'N/A')}
- PSIRA grades: {extracted.get('required_psira_grades', [])}
- Equipment: {extracted.get('required_equipment', [])}

The Appendices must include:
1. ADDITIONAL COMPANY DOCUMENTATION
   - List of additional supporting documents attached
   - Description of each document's relevance
2. DETAILED TRAINING PROGRAMS
   - Induction training curriculum
   - On-the-job training schedule
   - Refresher training program
   - PSIRA-required training modules
   - Specialized training (fire safety, first aid, etc.)
3. SAMPLE REPORTS AND FORMS
   - Daily occurrence report template
   - Incident report template
   - Site inspection checklist
   - Shift handover form
   - Visitor register template
4. EQUIPMENT SPECIFICATIONS
   - Communication equipment (radios, phones)
   - Security equipment (if applicable)
   - Uniform specifications
   - Patrol equipment
5. TECHNICAL SPECIFICATIONS
   - Control room specifications
   - Monitoring systems
   - Reporting software
6. SUPPORTING CERTIFICATES AND DOCUMENTATION
   - List of all certificates attached
   - Training certificates
   - Compliance certificates
   - Insurance certificates

Generate at least 1500 words. Be specific to this tender's requirements."""
    try:
        return _gemini_chat(prompt, system=DOC_GEN_SYSTEM, max_tokens=5000)
    except RuntimeError as e:
        return f"Document generation failed: {e}"


def generate_business_plan(tender: Dict[str, Any], extracted: Dict[str, Any], company: Dict[str, Any]) -> str:
    """Write a business plan for the organisation, grounded in its knowledge base.

    Used when a tender asks for a business plan: the content is built from what
    we actually know about the company (profile, capabilities, documents) and
    tailored to this tender, with placeholders wherever facts are missing.
    """
    header = _build_company_header(company)
    knowledge = company.get("knowledge_base") or company.get("capability") or ""
    prompt = f"""Generate a BUSINESS PLAN for the following tender.

COMPANY PROFILE:
{header}

WHAT WE KNOW ABOUT THIS COMPANY (from its own profile and uploaded documents — this is the source of truth):
{str(knowledge)[:6000] if knowledge else "No uploaded documents yet — write the plan using the company profile only and mark anything unknown as [INSERT X]."}

TENDER DETAILS:
- Reference: {tender.get('reference_number', 'N/A')}
- Title: {tender.get('title', 'N/A')}
- Client: {tender.get('client_company', 'N/A')}
- Scope: {extracted.get('scope_of_work', 'N/A') or tender.get('scope_of_work', 'N/A')}
- Contract period: {tender.get('contract_period', 'N/A')}

The business plan must contain these sections, in this order:
1. EXECUTIVE SUMMARY
2. COMPANY OVERVIEW (history, registration, structure, size)
3. VISION AND MISSION
4. SERVICES AND CAPABILITIES (what we can deliver)
5. MARKET AND CLIENTS WE SERVE
6. COMPETITIVE ADVANTAGES
7. OPERATIONAL CAPACITY (people, equipment, systems, quality controls)
8. GROWTH STRATEGY
9. FINANCIAL OVERVIEW (use placeholders if no figures are known)
10. HEALTH, SAFETY AND QUALITY COMMITMENT
11. CONCLUSION

Rules:
- Ground every claim in the company information above. Never invent numbers, certificates or clients.
- Where a fact is not known, write [INSERT X] rather than guessing.
- Keep it relevant to this tender: this is being submitted TO this client.
- Formal South African business English. Plain text/markdown only, no code fences."""
    try:
        return _gemini_chat(prompt, system=DOC_GEN_SYSTEM, max_tokens=5000)
    except RuntimeError as e:
        return f"Document generation failed: {e}"


# Map doc types to their generator functions
DOCUMENT_GENERATORS = {
    "cover_letter": generate_cover_letter,
    "company_profile": generate_company_profile,
    "compliance_docs": generate_compliance_docs,
    "technical_proposal": generate_technical_proposal,
    "method_statement": generate_method_statement,
    "implementation_plan": generate_implementation_plan,
    "risk_assessment": generate_risk_assessment,
    "sops": generate_sops,
    "organogram": generate_organogram,
    "pricing_schedule": generate_pricing_schedule,
    "references": generate_references,
    "signed_declarations": generate_signed_declarations,
    "appendices": generate_appendices,
    "table_of_contents": generate_table_of_contents,
    "business_plan": generate_business_plan,
}

DOCUMENT_TYPE_INFO = {
    "cover_letter": {"title": "Cover Letter", "description": "Formal introduction and purpose of submission"},
    "company_profile": {"title": "Company Profile", "description": "Company overview, history, mission and capabilities"},
    "compliance_docs": {"title": "Compliance Documents", "description": "Cover sheet for CIPC, SARS, B-BBEE, PSIRA, COIDA and declarations"},
    "technical_proposal": {"title": "Technical Proposal", "description": "Addresses functionality requirements to maximize technical score"},
    "method_statement": {"title": "Method Statement", "description": "How the company will deliver the services"},
    "implementation_plan": {"title": "Implementation Plan", "description": "Step-by-step plan for implementing the contract"},
    "risk_assessment": {"title": "Risk Assessment", "description": "Risk identification, analysis and mitigation"},
    "sops": {"title": "Standard Operating Procedures", "description": "Daily operational procedures for staff"},
    "organogram": {"title": "Organogram", "description": "Organizational structure, roles and reporting lines"},
    "pricing_schedule": {"title": "Pricing Schedule", "description": "Detailed cost breakdown and pricing structure"},
    "references": {"title": "References", "description": "Client references, case studies and testimonials"},
    "signed_declarations": {"title": "Signed Declarations", "description": "Formal declarations of compliance and accuracy"},
    "appendices": {"title": "Appendices", "description": "Training programs, sample forms, equipment specs"},
    "table_of_contents": {"title": "Table of Contents", "description": "Full submission package table of contents"},
    "business_plan": {"title": "Business Plan", "description": "Organisation strategy, capabilities and growth plan"},
}




# ---- AI Pricing Sheet Generation ----

PRICING_SYSTEM = """You are a South African tender pricing analyst.
You generate tender pricing sheets based on the tender requirements and standard industry rates.
You MUST respond with ONLY a valid JSON object (no markdown, no code fences).

Schema:
{
  "line_items": [
    {
      "category": one of ["Labour", "Equipment", "Consumables", "Transport", "Other"],
      "description": string (e.g. "Security Guard Grade C - Day shift"),
      "quantity": number,
      "rate": number (ZAR, monthly or hourly rate),
      "total": number (quantity * rate)
    }
  ],
  "pricing_notes": string (notes about the pricing approach, assumptions, exclusions),
  "vat_rate": number (0.15 for 15%)
}

Rules:
- For security tenders: include labour items for each PSIRA grade required (Grade A, B, C, D, E) with appropriate quantities based on the number of guards/personnel required and the contract period.
- Use realistic South African security industry rates (2024/2025):
  * Grade C guard: R6,000-R8,000/month
  * Grade B guard: R7,000-R9,000/month
  * Grade A guard: R8,000-R12,000/month
  * Site supervisor: R10,000-R15,000/month
  * Project manager: R20,000-R35,000/month
- Include equipment items if the tender requires equipment (radios, uniforms, torches, etc.)
- Include transport costs if site locations are mentioned.
- Calculate totals correctly: total = quantity * rate for each line.
- Set vat_rate to 0.15 (15% standard VAT in South Africa).
- In pricing_notes, explain your assumptions (e.g. "Rates based on 12-month contract, PSIRA-compliant guards, includes basic uniform but excludes firearms").
- If the tender mentions a specific pricing format or schedule, follow it."""


def generate_pricing_sheet(tender: Dict[str, Any], extracted: Dict[str, Any]) -> Dict[str, Any]:
    """
    Generate a pricing sheet draft using AI based on the tender's extracted requirements.
    Returns { line_items, pricing_notes, vat_rate }.
    """
    prompt = f"""Generate a pricing sheet for the following tender.

TENDER DETAILS:
- Reference: {tender.get('reference_number', 'N/A')}
- Title: {tender.get('title', 'N/A')}
- Client: {tender.get('client_company', 'N/A')}
- Contract Period: {tender.get('contract_period', 'N/A')}
- Estimated Value: {tender.get('estimated_value', 'N/A')}
- Location: {tender.get('location_site', 'N/A')}

AI-EXTRACTED TENDER INFO:
- Scope: {extracted.get('scope_of_work', 'N/A')}
- Personnel required: {extracted.get('number_of_personnel_guards', 'N/A')}
- PSIRA grades: {extracted.get('required_psira_grades', [])}
- Required equipment: {extracted.get('required_equipment', [])}
- Pricing requirements: {extracted.get('pricing_requirements', [])}
- Site locations: {extracted.get('site_locations', [])}

Generate a complete pricing sheet with realistic line items. Return ONLY the JSON object."""
    try:
        result = _gemini_chat(prompt, system=PRICING_SYSTEM)
        result = result.strip()
        if result.startswith("```"):
            result = result.split("\n", 1)[1] if "\n" in result else result[3:]
            if result.endswith("```"):
                result = result[:-3]
            result = result.strip()
        if result.startswith("json"):
            result = result[4:].strip()
        first = result.find("{")
        last = result.rfind("}")
        if first >= 0 and last > first:
            result = result[first:last + 1]
        data = json.loads(result)
        # Ensure totals are calculated
        for li in data.get("line_items", []):
            if "total" not in li or li["total"] == 0:
                li["total"] = round(float(li.get("quantity", 0)) * float(li.get("rate", 0)), 2)
        if "vat_rate" not in data:
            data["vat_rate"] = 0.15
        return data
    except (json.JSONDecodeError, RuntimeError, Exception):
        return {
            "line_items": [],
            "pricing_notes": "AI pricing generation failed. Please add line items manually.",
            "vat_rate": 0.15,
        }


# ---- AI Tender Readiness Report (the "most important requirement") ----

READINESS_SYSTEM = """You are TM Flow AI, a tender readiness analyst. Your job is to give the user a crystal-clear picture of where they stand with a tender and exactly what they need to do to win it.

You produce a READINESS REPORT in plain text with these exact sections (use the section headers as written):

=== WHAT THE TENDER REQUIRES ===
[List all mandatory requirements, compulsory documents, PSIRA grades, personnel, equipment, functionality requirements, evaluation criteria, and submission requirements. Be specific.]

=== WHAT YOU HAVE ===
[List the checklist items that are marked "Complete" and any compliance library documents that are linked. Be specific about what's already done.]

=== WHAT YOU ARE MISSING ===
[List the checklist items that are "Outstanding" or "Expired". For each, explain what it is and why it's needed. Prioritize mandatory items first. This is the most critical section — be thorough.]

=== DEADLINES ===
[List all critical deadlines: closing date and time, days remaining, briefing dates (if any), and any other important deadlines from the tender. Use urgency language if deadlines are close.]

=== RISKS ===
[List all potential risks: disqualification requirements, expired compliance documents, missing compulsory documents, unconfirmed briefing attendance, missing personnel, tight deadlines, etc. For each risk, explain the impact and recommend immediate action.]

=== WHAT NEEDS TO BE DONE BEFORE SUBMISSION ===
[Provide a prioritized action list — numbered steps the user must take before submitting. Start with the most urgent/critical items. Be specific and actionable. Include: documents to obtain, people to contact, tasks to complete, reviews to do, and the final submission itself.]

=== READINESS SCORE ===
[Provide a readiness score out of 100 based on: checklist completion %, deadline proximity, risk level, and outstanding mandatory items. Explain the score briefly.]

Keep it factual, specific, and actionable. Reference the tender by its reference number. Do not add markdown formatting."""


def build_readiness_report_offline(
    tender_data: Dict[str, Any],
    extracted: Dict[str, Any],
    checklist: List[Dict[str, Any]],
    library_docs: List[Dict[str, Any]],
    company: Dict[str, Any],
) -> str:
    """A complete readiness report computed from the tender's own data.

    Used when the AI is unavailable (e.g. the daily free quota is spent) so the
    user always gets a real, actionable report instead of an error. Same seven
    sections as the AI version, computed deterministically.
    """
    tender_data = tender_data or {}
    checklist = checklist or []
    library_docs = library_docs or []
    company = company or {}

    complete = [c for c in checklist if str(c.get("status", "")).lower() == "complete"]
    outstanding = [c for c in checklist if str(c.get("status", "")).lower() != "complete"]
    mandatory_out = [c for c in outstanding if c.get("mandatory")]
    optional_out = [c for c in outstanding if not c.get("mandatory")]

    total = len(checklist)
    pct = round(100 * len(complete) / total) if total else 0

    closing = tender_data.get("closing_date")
    days_left = tender_data.get("days_until_close")
    if days_left is not None and days_left < 0:
        closing_line = f"CLOSED — the closing date ({closing}) has passed."
    elif days_left is not None:
        closing_line = f"Closes {closing} ({days_left} day(s) remaining)."
    else:
        closing_line = "No closing date recorded yet — set one so deadlines can be tracked."

    expired = [d for d in library_docs if str(d.get("status")) == "Expired"]
    expiring = [d for d in library_docs if str(d.get("status")) == "Expiring Soon"]
    active_docs = [d for d in library_docs if str(d.get("status")) == "Active"]

    # ---- Score: completion, penalised by expired/soon-expiring compliance ----
    score = pct
    score -= min(30, 10 * len(expired))
    score -= min(15, 5 * len(expiring))
    if days_left is not None and days_left < 0:
        score = 0
    score = max(0, min(100, score))
    if score >= 85:
        verdict = "READY TO SUBMIT"
    elif score >= 60:
        verdict = "ALMOST READY"
    elif score >= 30:
        verdict = "NOT READY"
    else:
        verdict = "BARELY STARTED"

    lines: List[str] = []
    a = lines.append

    a(f"READINESS REPORT — {tender_data.get('reference_number') or 'Tender'}: "
      f"{tender_data.get('title') or 'Untitled tender'}")
    a(f"Client: {tender_data.get('client_company') or 'Not recorded'}")
    a(f"Company: {company.get('company_name') or 'Not recorded'}")
    a("")

    a("=== WHAT THE TENDER REQUIRES ===")
    reqs = []
    if extracted:
        for key in ("scope_of_work", "description", "requirements", "deliverables"):
            val = extracted.get(key)
            if val:
                text = val if isinstance(val, str) else json.dumps(val, default=str)
                reqs.append(text[:600])
    if tender_data.get("scope_of_work"):
        reqs.append(str(tender_data["scope_of_work"])[:600])
    if reqs:
        for r in reqs[:4]:
            a(f"- {r}")
    else:
        a("- No tender document has been read yet. Upload the tender document so the")
        a("  specific requirements can be listed here.")
    a("")
    a(f"Checklist prepared for this tender: {total} item(s) "
      f"({len(mandatory_out)} mandatory still outstanding).")
    a("")

    a("=== WHAT YOU HAVE ===")
    if complete:
        for c in complete[:25]:
            a(f"- [Complete] {c.get('name')}")
    else:
        a("- Nothing on the checklist is marked complete yet.")
    if active_docs:
        a("")
        a("Active compliance documents:")
        for d in active_docs[:15]:
            exp = f" (expires {d.get('expiry_date')})" if d.get("expiry_date") else ""
            a(f"- {d.get('name')} [{d.get('category')}]{exp}")
    a("")

    a("=== WHAT YOU ARE MISSING ===")
    if not outstanding:
        a("- Nothing outstanding — every checklist item is complete.")
    else:
        for c in mandatory_out[:25]:
            a(f"- (MANDATORY) {c.get('name')}"
              + (f" — {str(c.get('description'))[:220]}" if c.get("description") else ""))
        for c in optional_out[:25]:
            a(f"- (recommended) {c.get('name')}")
    if expired:
        a("")
        a("EXPIRED compliance documents that will disqualify or weaken a bid:")
        for d in expired:
            a(f"- {d.get('name')} [{d.get('category')}] expired {d.get('expiry_date')}")
    a("")

    a("=== DEADLINES ===")
    a(f"- {closing_line}")
    if tender_data.get("contract_period"):
        a(f"- Contract period: {tender_data.get('contract_period')}")
    if tender_data.get("submission_method"):
        a(f"- Submission: {tender_data.get('submission_method')}")
    if expiring:
        a("- Compliance documents expiring soon:")
        for d in expiring:
            a(f"  - {d.get('name')} expires in {d.get('days_to_expiry')} day(s)")
    a("")

    a("=== RISKS ===")
    risks: List[str] = []
    if days_left is not None and days_left < 0:
        risks.append("This tender has already closed — a bid can no longer be submitted.")
    if mandatory_out:
        risks.append(
            f"{len(mandatory_out)} mandatory checklist item(s) are still outstanding; "
            "an incomplete mandatory document usually disqualifies a bid."
        )
    if expired:
        risks.append(
            f"{len(expired)} compliance document(s) have expired — these must be renewed "
            "before submission."
        )
    if expiring:
        risks.append(
            f"{len(expiring)} compliance document(s) expire soon and must be renewed."
        )
    if days_left is not None and 0 <= days_left <= 3:
        risks.append(f"Only {days_left} day(s) remain — there is very little time left.")
    if not total:
        risks.append("No checklist has been generated for this tender yet.")
    if not risks:
        risks.append("No major risks detected from the current data.")
    for r in risks:
        a(f"- {r}")
    a("")

    a("=== WHAT NEEDS TO BE DONE BEFORE SUBMISSION ===")
    steps: List[str] = []
    if days_left is not None and days_left < 0:
        steps.append("This tender has closed — archive it and focus on live opportunities.")
    for c in mandatory_out[:8]:
        steps.append(f"Obtain and complete the mandatory item: {c.get('name')}")
    for d in expired[:3]:
        steps.append(f"Renew the expired document: {d.get('name')} [{d.get('category')}]")
    for d in expiring[:3]:
        steps.append(f"Arrange renewal of {d.get('name')} (expires in {d.get('days_to_expiry')} days)")
    if not complete and total:
        steps.append("Start completing the checklist items, beginning with the mandatory ones.")
    if not total:
        steps.append("Upload the tender document so the checklist and requirements can be built.")
    if not company.get("registration_number") or not company.get("bbbbee_level"):
        steps.append("Complete the company profile (registration and B-BBEE details).")
    if tender_data.get("submission_method"):
        steps.append(f"Plan the final submission: {tender_data.get('submission_method')}")
    if not steps:
        steps.append("Review the completed pack and submit.")
    for i, s in enumerate(steps, start=1):
        a(f"{i}. {s}")
    a("")

    a("=== READINESS SCORE ===")
    a(f"{score}/100 — {verdict}")
    a("")
    a("Scoring: percentage of checklist items complete"
      f" ({len(complete)}/{total}), less penalties for expired ({len(expired)}) "
      f"and soon-expiring ({len(expiring)}) compliance documents.")
    a("")
    a("Note: this report was calculated directly from your tender data. The AI-written")
    a("narrative is unavailable right now because the daily AI usage limit was reached,")
    a("so re-generate it later for a written analysis of the tender document.")
    return "\n".join(lines)


def generate_readiness_report(tender_data: Dict[str, Any], extracted: Dict[str, Any], checklist: List[Dict[str, Any]], library_docs: List[Dict[str, Any]], company: Dict[str, Any]) -> str:
    """
    Generate the comprehensive Tender Readiness Report.
    This is the 'most important requirement' — tells the user everything they need to know.
    Falls back to a deterministic report so the user is never left without one.
    """
    prompt = f"""Generate a READINESS REPORT for the following tender.

TENDER DETAILS:
{json.dumps(tender_data, indent=2, default=str)[:3000]}

AI-EXTRACTED TENDER INFO:
{json.dumps(extracted, indent=2, default=str)[:5000]}

CHECKLIST ITEMS (with status):
{json.dumps(checklist, indent=2, default=str)[:5000]}

COMPLIANCE LIBRARY DOCUMENTS:
{json.dumps(library_docs, indent=2, default=str)[:2000]}

COMPANY PROFILE:
{json.dumps(company, indent=2, default=str)[:1000]}

Generate the full READINESS REPORT with all 7 sections as specified."""
    try:
        return _gemini_chat(prompt, system=READINESS_SYSTEM, max_tokens=6000)
    except RuntimeError as e:
        # Never surface a raw failure: give the user the real, data-driven report.
        report = build_readiness_report_offline(
            tender_data, extracted, checklist, library_docs, company
        )
        return f"{report}\n\n(AI analysis unavailable: {e})"


# ---- Smart document analysis ----

SMART_DOCS_SYSTEM = """You are a South African tender submission analyst.
Analyze the tender's AI-extracted information and determine which documents are required for the submission.
Respond with ONLY a valid JSON array (no markdown, no code fences).

Each element must follow this schema:
{
  "doc_type": string (must be one of: "cover_letter", "company_profile", "compliance_docs", "technical_proposal", "method_statement", "implementation_plan", "risk_assessment", "sops", "organogram", "pricing_schedule", "references", "signed_declarations", "appendices", "table_of_contents"),
  "reason": string (1-2 sentences explaining WHY this document is needed for THIS specific tender),
  "priority": "essential" | "recommended" | "optional"
}

Rules:
- Include "cover_letter" and "table_of_contents" as essential for every tender.
- Include "pricing_schedule" as essential for every tender (all tenders require pricing).
- Include "signed_declarations" as essential for government tenders.
- Include "compliance_docs" as essential if any compulsory documents are mentioned.
- Include "technical_proposal" as essential if functionality requirements or evaluation criteria mention functionality.
- Include "method_statement" as essential if the scope of work is detailed.
- Include "implementation_plan" as essential for service contracts.
- Include "risk_assessment" as recommended for security/service tenders.
- Include "sops" as recommended for service tenders with operational requirements.
- Include "organogram" as essential if personnel/guards are required.
- Include "references" as essential if references are listed as compulsory documents.
- Include "company_profile" as essential if company profile is listed as a compulsory document.
- Include "appendices" as recommended if equipment, training, or technical specifications are mentioned.
- Be specific to THIS tender — don't include documents that aren't relevant."""


def analyze_required_documents(extracted: Dict[str, Any], tender: Dict[str, Any]) -> List[Dict[str, Any]]:
    """Use AI to analyze the tender and determine which documents are required."""
    if not extracted or extracted.get("_error"):
        # Fallback: return all document types as recommended
        return [
            {"doc_type": dt, "reason": "Recommended for a complete tender submission", "priority": "recommended"}
            for dt in ["cover_letter", "company_profile", "compliance_docs", "technical_proposal",
                       "method_statement", "implementation_plan", "risk_assessment", "sops",
                       "organogram", "pricing_schedule", "references", "signed_declarations",
                       "appendices", "table_of_contents"]
        ]

    prompt = f"""Analyze this tender and determine which documents are required for the submission.

TENDER DETAILS:
- Reference: {tender.get('reference_number', 'N/A')}
- Title: {tender.get('title', 'N/A')}
- Client: {tender.get('client_company', 'N/A')}
- Scope: {extracted.get('scope_of_work', 'N/A')}
- Personnel: {extracted.get('number_of_personnel_guards', 'N/A')}
- PSIRA grades: {extracted.get('required_psira_grades', [])}

AI-EXTRACTED INFO:
- Compulsory documents: {json.dumps(extracted.get('compulsory_documents', []), default=str)}
- Mandatory requirements: {json.dumps(extracted.get('mandatory_requirements', []), default=str)}
- Functionality requirements: {json.dumps(extracted.get('functionality_requirements', []), default=str)}
- Evaluation criteria: {json.dumps(extracted.get('evaluation_criteria', []), default=str)}
- Pricing requirements: {json.dumps(extracted.get('pricing_requirements', []), default=str)}
- Submission requirements: {json.dumps(extracted.get('submission_requirements', []), default=str)}
- Required equipment: {json.dumps(extracted.get('required_equipment', []), default=str)}
- Disqualification risks: {json.dumps(extracted.get('disqualification_requirements', []), default=str)}

Return ONLY the JSON array of required documents."""
    try:
        result = _gemini_chat(prompt, system=SMART_DOCS_SYSTEM)
        result = result.strip()
        if result.startswith("```"):
            result = result.split("\n", 1)[1] if "\n" in result else result[3:]
            if result.endswith("```"):
                result = result[:-3]
            result = result.strip()
        if result.startswith("json"):
            result = result[4:].strip()
        first = result.find("[")
        last = result.rfind("]")
        if first >= 0 and last > first:
            result = result[first:last + 1]
        items = json.loads(result)
        if not isinstance(items, list):
            return []
        # Validate doc_types
        valid_types = set(DOCUMENT_TYPE_INFO.keys())
        valid_items = []
        for item in items:
            if isinstance(item, dict) and item.get("doc_type") in valid_types:
                valid_items.append({
                    "doc_type": item["doc_type"],
                    "reason": str(item.get("reason", ""))[:500],
                    "priority": item.get("priority", "recommended"),
                })
        return valid_items
    except (json.JSONDecodeError, RuntimeError, Exception):
        # Fallback: return all as recommended
        return [
            {"doc_type": dt, "reason": "Recommended for a complete tender submission", "priority": "recommended"}
            for dt in ["cover_letter", "company_profile", "compliance_docs", "technical_proposal",
                       "method_statement", "implementation_plan", "risk_assessment", "sops",
                       "organogram", "pricing_schedule", "references", "signed_declarations",
                       "appendices", "table_of_contents"]
        ]


# ============================================================
# ISSUER PORTAL AI FUNCTIONS
# ============================================================

def generate_tender_from_prompt(prompt: str, industry: str = "", company_name: str = "") -> Dict[str, Any]:
    """AI Tender Writer — generate a complete tender specification from a natural-language prompt.

    Used by issuers to create professional tender documents quickly.
    Returns a dict with title, description, scope_of_work, evaluation_criteria,
    submission_method, compulsory_documents, mandatory_requirements,
    functionality_requirements, and ai_generated_content (the full document).
    """
    system = (
        "You are a senior procurement specialist in South Africa who writes professional, "
        "compliant tender specifications. You understand PFMA, PPPFA, B-BBEE, SARS, CIPC, "
        "COIDA and sector-specific requirements (PSIRA, CIDB, SACPCMP, etc.). "
        "You MUST respond with ONLY a valid JSON object (no markdown, no code fences)."
    )
    user_prompt = f"""Create a complete, professional tender specification based on this request:

REQUEST: {prompt}
INDUSTRY/SECTOR: {industry or "General"}
ISSUING ORGANISATION: {company_name or "The organisation"}

Respond with ONLY this JSON schema (fill all fields with rich, detailed, professional content tailored to South African procurement):

{{
  "title": "A clear, professional tender title",
  "description": "A 2-3 paragraph overview of what is being procured and why",
  "scope_of_work": "Detailed scope of work with numbered deliverables (at least 8-12 items)",
  "category": "The industry sector",
  "location": "Where the work will be performed",
  "contract_period": "e.g. 24 months",
  "budget": 0,
  "evaluation_criteria": "Detailed evaluation criteria including compulsory requirements, functionality (with weights), pricing (80/20 or 90/10 principle), and B-BBEE preferences",
  "submission_method": "Bids must be submitted online through the TM Flow portal by the closing date. No physical or email submissions will be accepted.",
  "compulsory_documents": ["List 20-25 compulsory documents bidders must submit, e.g. CIPC registration certificate, SARS tax clearance, B-BBEE certificate, COIDA letter of good standing, company profile, etc."],
  "mandatory_requirements": ["List 8-12 mandatory requirements bidders must meet to be considered"],
  "functionality_requirements": ["List 6-10 functionality requirements with pass/fail criteria"],
  "ai_generated_content": "The FULL tender document as formatted text (1200-2000 words) with sections: 1. Background, 2. Scope of Work, 3. Mandatory Requirements, 4. Compulsory Documents, 5. Functionality Requirements, 6. Evaluation Criteria, 7. Pricing, 8. B-BBEE, 9. Terms and Conditions, 10. Submission Instructions"
}}

Make the content specific, detailed, and immediately usable. Use South African context (Rand currency, SA legislation, etc.)."""

    try:
        result = _gemini_chat(user_prompt, system=system, max_tokens=8000)
        # Strip markdown fences if present
        result = result.strip()
        if result.startswith("```"):
            result = result.split("\n", 1)[1] if "\n" in result else result[3:]
        if result.endswith("```"):
            result = result[:-3]
        result = result.strip()
        if result.startswith("json"):
            result = result[4:].strip()
        # Find the JSON object
        first = result.find("{")
        last = result.rfind("}")
        if first >= 0 and last > first:
            result = result[first:last + 1]
        data = json.loads(result)
        # Ensure required fields exist
        data.setdefault("title", "Untitled Tender")
        data.setdefault("description", "")
        data.setdefault("scope_of_work", "")
        data.setdefault("category", industry or "General")
        data.setdefault("location", "South Africa")
        data.setdefault("contract_period", "12 months")
        data.setdefault("budget", 0)
        data.setdefault("evaluation_criteria", "")
        data.setdefault("submission_method", "Bids must be submitted online through the TM Flow portal by the closing date.")
        data.setdefault("compulsory_documents", [])
        data.setdefault("mandatory_requirements", [])
        data.setdefault("functionality_requirements", [])
        data.setdefault("ai_generated_content", data.get("description", ""))
        return data
    except Exception as e:
        # Fallback with minimal data
        return {
            "title": prompt[:100] if prompt else "Untitled Tender",
            "description": f"Tender generated from request: {prompt}",
            "scope_of_work": "",
            "category": industry or "General",
            "location": "South Africa",
            "contract_period": "12 months",
            "budget": 0,
            "evaluation_criteria": "",
            "submission_method": "Bids must be submitted online through the TM Flow portal by the closing date.",
            "compulsory_documents": [],
            "mandatory_requirements": [],
            "functionality_requirements": [],
            "ai_generated_content": f"Tender generated from: {prompt}",
            "_error": str(e),
        }


def review_bid(bid_data: Dict[str, Any], tender_data: Dict[str, Any]) -> Dict[str, Any]:
    """AI Bid Review — analyse a submitted bid against the tender requirements.

    Returns dict with review (text), technical_score, financial_score,
    recommendation (award/do not award), and strengths/weaknesses lists.
    """
    system = (
        "You are an expert procurement evaluation committee member in South Africa. "
        "You evaluate bids objectively against tender requirements, considering compliance, "
        "functionality, B-BBEE, and value for money. "
        "You MUST respond with ONLY a valid JSON object (no markdown, no code fences)."
    )
    user_prompt = f"""Evaluate this bid against the tender requirements.

TENDER:
- Title: {tender_data.get('title', '')}
- Description: {(tender_data.get('description') or '')[:800]}
- Scope of Work: {(tender_data.get('scope_of_work') or '')[:800]}
- Compulsory Documents Required: {json.dumps(tender_data.get('compulsory_documents', []))[:500]}
- Mandatory Requirements: {json.dumps(tender_data.get('mandatory_requirements', []))[:500]}
- Evaluation Criteria: {(tender_data.get('evaluation_criteria') or '')[:500]}

BID:
- Bidder Company: {bid_data.get('bidder_company_name', '')}
- Bidder Contact: {bid_data.get('bidder_contact_person', '')}
- B-BBEE Level: {bid_data.get('bidder_bbbee_level', 'Not specified')}
- Proposal Summary: {(bid_data.get('proposal_summary') or '')[:1000]}
- Total Bid Amount: R {bid_data.get('total_amount', 0):,.2f}

Respond with ONLY this JSON:
{{
  "technical_score": 0-100,
  "financial_score": 0-100,
  "compliance_score": 0-100,
  "recommendation": "Award" | "Shortlist" | "Do Not Award",
  "strengths": ["list 3-5 key strengths"],
  "weaknesses": ["list 3-5 weaknesses or risks"],
  "summary": "A 2-3 paragraph narrative evaluation",
  "conditions": ["any conditions or clarifications needed"]
}}"""

    try:
        result = _gemini_chat(user_prompt, system=system, max_tokens=4000)
        result = result.strip()
        if result.startswith("```"):
            result = result.split("\n", 1)[1] if "\n" in result else result[3:]
        if result.endswith("```"):
            result = result[:-3]
        result = result.strip()
        if result.startswith("json"):
            result = result[4:].strip()
        first = result.find("{")
        last = result.rfind("}")
        if first >= 0 and last > first:
            result = result[first:last + 1]
        data = json.loads(result)
        data.setdefault("technical_score", 0)
        data.setdefault("financial_score", 0)
        data.setdefault("compliance_score", 0)
        data.setdefault("recommendation", "Shortlist")
        data.setdefault("strengths", [])
        data.setdefault("weaknesses", [])
        data.setdefault("summary", "Review completed.")
        data.setdefault("conditions", [])
        return data
    except Exception as e:
        return {
            "technical_score": 0,
            "financial_score": 0,
            "compliance_score": 0,
            "recommendation": "Shortlist",
            "strengths": [],
            "weaknesses": [],
            "summary": f"AI review could not be completed: {e}. Manual review required.",
            "conditions": [],
            "_error": str(e),
        }


def verify_checklist_document(item_name: str, item_category: str, document_text: str, filename: str = "") -> Dict[str, Any]:
    """AI verifies whether an uploaded document matches the required checklist item.

    Returns dict with:
      - matches: bool (whether the document is the correct type)
      - confidence: str (high/medium/low)
      - reason: str (explanation)
      - detected_type: str (what document type the AI detected)
      - key_info: str (key information found, e.g. registration number, expiry date)
    """
    system = (
        "You are a compliance document verifier for South African tender submissions. "
        "You determine whether an uploaded document matches the required compliance item. "
        "You understand SA document types: CIPC certificates, SARS tax clearances, B-BBEE certificates, "
        "COIDA letters, PSIRA certificates, company profiles, financial statements, etc. "
        "You MUST respond with ONLY a valid JSON object (no markdown, no code fences)."
    )
    user_prompt = f"""Verify whether this uploaded document matches the required compliance item.

REQUIRED CHECKLIST ITEM:
- Name: {item_name}
- Category: {item_category}

UPLOADED DOCUMENT:
- Filename: {filename}
- Extracted text (first 1500 chars): {document_text[:1500]}

Respond with ONLY this JSON:
{{
  "matches": true/false,
  "confidence": "high" | "medium" | "low",
  "detected_type": "What document type this actually is (e.g. 'B-BBEE Certificate', 'Tax Clearance Certificate')",
  "key_info": "Key information found (e.g. 'Registration number: 2018/123456/07, Expiry: 2025-12-31') or 'None found'",
  "reason": "1-2 sentence explanation of why this does or does not match"
}}"""

    try:
        result = _gemini_chat(user_prompt, system=system, max_tokens=1000)
        result = result.strip()
        if result.startswith("```"):
            result = result.split("\n", 1)[1] if "\n" in result else result[3:]
        if result.endswith("```"):
            result = result[:-3]
        result = result.strip()
        if result.startswith("json"):
            result = result[4:].strip()
        first = result.find("{")
        last = result.rfind("}")
        if first >= 0 and last > first:
            result = result[first:last + 1]
        data = json.loads(result)
        data.setdefault("matches", False)
        data.setdefault("confidence", "low")
        data.setdefault("detected_type", "Unknown")
        data.setdefault("key_info", "")
        data.setdefault("reason", "Could not verify document.")
        return data
    except Exception as e:
        return {
            "matches": True,  # Default to accepting if AI fails — don't block the user
            "confidence": "low",
            "detected_type": "Unknown",
            "key_info": "",
            "reason": f"AI verification unavailable: {e}. Document accepted pending manual review.",
        }


def generate_document_by_prompt(
    prompt: str,
    tender: Dict[str, Any],
    extracted: Dict[str, Any],
    company: Dict[str, Any],
    checklist_items: List[Dict[str, Any]] = None,
    generated_docs: List[Dict[str, Any]] = None,
    library_docs: List[Dict[str, Any]] = None,
    ai_summary: str = "",
) -> str:
    """Generate any document the user wants via a natural-language prompt.
    The AI has full context of the tender, extracted info, company profile,
    checklist items, previously generated documents, and library documents."""
    system = (
        "You are a professional tender bid writer for South African procurement. "
        "You generate any document the user needs for their tender submission. "
        "You have deep knowledge of PFMA, PPPFA, B-BBEE, SARS, CIPC, COIDA, PSIRA, CIDB, "
        "and sector-specific requirements. You write professional, compliant, detailed documents."
    )

    # Build a rich context string from all available data
    context_parts = []
    context_parts.append(f"TENDER:\n  Reference: {tender.get('reference_number','')}\n  Title: {tender.get('title','')}\n  Client: {tender.get('client_company','')}\n  Location: {tender.get('location_site','')}\n  Contract Period: {tender.get('contract_period','')}\n  Estimated Value: R {tender.get('estimated_value',0):,.2f}" if tender.get('estimated_value') else f"  Estimated Value: Not specified")
    if tender.get('scope_of_work'):
        context_parts.append(f"  Scope of Work: {tender['scope_of_work'][:800]}")
    if tender.get('description'):
        context_parts.append(f"  Description: {tender['description'][:500]}")
    if tender.get('submission_method'):
        context_parts.append(f"  Submission Method: {tender['submission_method']}")
    if ai_summary:
        context_parts.append(f"  AI Summary: {ai_summary[:500]}")

    if extracted and not extracted.get('_error'):
        ex_parts = []
        if extracted.get('scope_of_work'): ex_parts.append(f"Scope: {extracted['scope_of_work'][:400]}")
        if extracted.get('mandatory_requirements'): ex_parts.append(f"Mandatory: {json.dumps(extracted['mandatory_requirements'][:5])}")
        if extracted.get('functionality_requirements'): ex_parts.append(f"Functionality: {json.dumps(extracted['functionality_requirements'][:5])}")
        if extracted.get('evaluation_criteria'): ex_parts.append(f"Evaluation: {json.dumps(extracted['evaluation_criteria'][:5])}")
        if extracted.get('compulsory_documents'): ex_parts.append(f"Compulsory Docs: {json.dumps(extracted['compulsory_documents'][:8])}")
        if ex_parts:
            context_parts.append("AI EXTRACTED INFO:\n  " + "\n  ".join(ex_parts))

    if company:
        co_parts = []
        if company.get('company_name'): co_parts.append(f"Name: {company['company_name']}")
        if company.get('registration_number'): co_parts.append(f"Reg: {company['registration_number']}")
        if company.get('bbbbee_level'): co_parts.append(f"B-BBEE: {company['bbbbee_level']}")
        if company.get('email'): co_parts.append(f"Email: {company['email']}")
        if company.get('phone'): co_parts.append(f"Phone: {company['phone']}")
        if co_parts:
            context_parts.append("COMPANY:\n  " + "\n  ".join(co_parts))

    if checklist_items:
        cl_complete = [c for c in checklist_items if c.get('status') == 'Complete']
        cl_outstanding = [c for c in checklist_items if c.get('status') == 'Outstanding']
        context_parts.append(f"CHECKLIST: {len(cl_complete)} complete, {len(cl_outstanding)} outstanding of {len(checklist_items)} items")
        if cl_complete:
            context_parts.append(f"  Completed items: {', '.join(c.get('name','') for c in cl_complete[:8])}")

    if generated_docs:
        context_parts.append(f"EXISTING GENERATED DOCUMENTS: {', '.join(d.get('doc_type','') for d in generated_docs)}")

    if library_docs:
        lib_names = [d.get('name','') for d in library_docs[:10]]
        context_parts.append(f"LIBRARY DOCUMENTS: {', '.join(lib_names)}")

    context = "\n\n".join(context_parts)

    user_prompt = f"""{context}

USER REQUEST: {prompt}

Generate a complete, professional document based on the user's request. The document should be:
- Specific to this tender and company
- Professional and compliant with South African procurement standards
- Detailed and immediately usable
- Formatted with clear sections, headings, and structure

Write the full document now:"""

    try:
        result = _gemini_chat(user_prompt, system=system, max_tokens=6000)
        return result.strip()
    except Exception as e:
        return f"Error generating document: {e}\n\nPlease try again."


# ===================== Document Pack (what this tender actually needs) =====================

# Documents we can WRITE from the tenant's knowledge base, vs documents that
# are evidence the tenant must hold (certificates) and can only attach.
WRITABLE_DOC_TYPES = {
    "cover_letter", "company_profile", "compliance_docs", "technical_proposal",
    "method_statement", "implementation_plan", "risk_assessment", "sops",
    "organogram", "pricing_schedule", "references", "signed_declarations",
    "appendices", "table_of_contents", "business_plan",
}


def _norm(s: Any) -> str:
    return re.sub(r"[^a-z0-9]+", " ", str(s or "").lower()).strip()


def _match_library_doc(requirement: Dict[str, Any],
                       library: List[Dict[str, Any]]) -> Optional[Dict[str, Any]]:
    """Find the best matching document the tenant already holds.

    Preference order: an explicitly linked document, then a category match,
    then a loose name match. Active documents beat expiring ones; expired
    documents still count as "held but not usable".
    """
    if not library:
        return None

    linked_id = requirement.get("linked_library_doc_id")
    if linked_id:
        for d in library:
            if d.get("id") == linked_id:
                return d

    want = _norm(requirement.get("library_category") or requirement.get("category"))
    name = _norm(requirement.get("name") or requirement.get("title"))

    def score(d: Dict[str, Any]) -> int:
        cat = _norm(d.get("category"))
        doc_name = _norm(d.get("name"))
        if want and cat and cat == want:
            return 3
        if want and cat and (want in cat or cat in want):
            return 2
        if name and doc_name and (name in doc_name or doc_name in name):
            return 1
        return 0

    def status_rank(d: Dict[str, Any]) -> int:
        return {"Active": 0, "Expiring Soon": 1, "Expired": 2}.get(d.get("status"), 3)

    # Best score first; among equals prefer the healthiest document.
    best = sorted(library, key=lambda d: (-score(d), status_rank(d), _norm(d.get("name"))))[0]
    if score(best) <= 0:
        return None  # nothing in the library actually matches this requirement
    return best


def build_document_pack(
    checklist: List[Dict[str, Any]],
    library_docs: List[Dict[str, Any]],
    generated_docs: List[Dict[str, Any]],
    smart_docs: Optional[List[Dict[str, Any]]] = None,
) -> List[Dict[str, Any]]:
    """The exact set of documents this tender needs, each with its real status.

    Two kinds of requirement are merged:
      * compliance/evidence items that come from the tender's checklist
        (CIPC, B-BBEE, PSIRA, tax clearance, COIDA...) - these can only be
        ATTACHED from the tenant's library, never invented;
      * documents we can WRITE from their knowledge base (method statement,
        business plan, cover letter...).

    Every entry is resolved to one of: linked (we hold it), generated (we
    wrote it), or missing - so the user always knows what is outstanding.
    """
    generated_by_type = {g.get("doc_type"): g for g in (generated_docs or [])}
    pack: List[Dict[str, Any]] = []
    seen_keys = set()

    # 1. Compliance / evidence documents from the checklist.
    for item in checklist or []:
        name = (item.get("name") or "").strip()
        if not name:
            continue
        key = "checklist:" + _norm(name)
        if key in seen_keys:
            continue
        seen_keys.add(key)
        held = _match_library_doc(item, library_docs)
        entry = {
            "key": key,
            "title": name,
            "kind": "compliance",
            "mandatory": bool(item.get("mandatory", True)),
            "requirement_reason": item.get("description") or "Required by the tender",
            "priority": "essential" if item.get("mandatory", True) else "recommended",
            "editable": False,
            "generated_id": None,
            "library_document_id": held.get("id") if held else None,
            "library_status": held.get("status") if held else None,
            "library_expiry": held.get("expiry_date") if held else None,
        }
        if held:
            entry["status"] = (
                "expired" if str(held.get("status")) == "Expired"
                else ("expiring" if str(held.get("status")) == "Expiring Soon" else "ready")
            )
        else:
            entry["status"] = "missing"
        pack.append(entry)

    # 2. Documents the AI says this tender needs, that we can write.
    for item in smart_docs or []:
        doc_type = item.get("doc_type")
        if not doc_type or doc_type not in DOCUMENT_GENERATORS:
            continue
        key = "doc:" + doc_type
        if key in seen_keys:
            continue
        seen_keys.add(key)
        generated = generated_by_type.get(doc_type)
        pack.append({
            "key": key,
            "doc_type": doc_type,
            "title": DOCUMENT_TYPE_INFO.get(doc_type, {}).get("title", doc_type),
            "kind": "content",
            "mandatory": item.get("priority") == "essential",
            "requirement_reason": item.get("reason") or DOCUMENT_TYPE_INFO.get(doc_type, {}).get("description", ""),
            "priority": item.get("priority", "recommended"),
            "editable": True,
            "status": "generated" if generated else "missing",
            "generated_id": generated.get("id") if generated else None,
            "library_document_id": None,
            "library_status": None,
            "library_expiry": None,
        })

    # Documents already written but no longer flagged as required are still shown
    # so nothing the user prepared silently disappears.
    for doc_type, generated in generated_by_type.items():
        key = "doc:" + doc_type
        if key in seen_keys or doc_type not in DOCUMENT_GENERATORS:
            continue
        seen_keys.add(key)
        pack.append({
            "key": key,
            "doc_type": doc_type,
            "title": DOCUMENT_TYPE_INFO.get(doc_type, {}).get("title", doc_type),
            "kind": "content",
            "mandatory": False,
            "requirement_reason": "You prepared this for an earlier run of this tender",
            "priority": "optional",
            "editable": True,
            "status": "generated",
            "generated_id": generated.get("id"),
            "library_document_id": None,
            "library_status": None,
            "library_expiry": None,
        })

    def sort_key(e: Dict[str, Any]):
        status_rank = {"missing": 0, "expired": 1, "expiring": 2, "generated": 3, "ready": 4}
        return (
            0 if e.get("mandatory") else 1,
            status_rank.get(e.get("status"), 5),
            e.get("title", "").lower(),
        )

    pack.sort(key=sort_key)
    return pack


def document_pack_summary(pack: List[Dict[str, Any]]) -> Dict[str, Any]:
    counts = {"total": len(pack), "ready": 0, "generated": 0, "missing": 0,
              "expired": 0, "expiring": 0}
    for e in pack or []:
        status = e.get("status")
        if status in counts:
            counts[status] += 1
    counts["outstanding"] = counts["missing"] + counts["expired"]
    return counts


# ===================== AI document editing =====================

DOC_EDIT_SYSTEM = """You are a senior tender bid writer editing a document on behalf of a South African company.

You rewrite the document the user asked you to change, following their instruction exactly.

Rules:
- Keep everything that is still correct and relevant; change only what the instruction requires.
- Keep the same document format and section headings unless asked to change them.
- Never invent facts (registration numbers, certificates, figures, references) that are not in the document or the company information provided.
- If the instruction asks for something and there is no supporting information, write a clear, professional placeholder such as [INSERT X] rather than making something up.
- Use formal South African business English. Plain text/markdown only, no code fences.
- Return the complete revised document, not a summary or a diff."""


def ai_edit_document(content: str, instruction: str, tender_data: Dict[str, Any],
                     company: Dict[str, Any]) -> str:
    """Revise an existing document according to the user's instruction."""
    prompt = f"""EDIT THIS TENDER DOCUMENT.

DOCUMENT TO EDIT:
{str(content or "")[:20000]}

EDIT INSTRUCTION FROM THE USER:
{str(instruction or "")[:2000]}

TENDER DETAILS:
{json.dumps(tender_data or {}, indent=2, default=str)[:2000]}

COMPANY INFORMATION:
{json.dumps(company or {}, indent=2, default=str)[:1500]}

Return the complete revised document."""
    try:
        return _gemini_chat(prompt, system=DOC_EDIT_SYSTEM, max_tokens=6000).strip()
    except RuntimeError as e:
        # The user keeps their own version; we never destroy their work.
        return f"[AI edit unavailable: {e}]\n\n{content or ''}"
