"""
TenderFlow - AI module
Uses the z-ai-web-dev-sdk CLI (Node.js) via subprocess for:
- Tender document reading & extraction (chat)
- AI assistant chat
- AI tender summaries
- Addendum change detection
"""
import os
import json
import subprocess
import tempfile
from typing import Optional, Dict, Any, List

Z_AI_CLI = os.path.join(
    os.environ.get("Z_AI_CLI_PATH", "/home/z/my-project/node_modules/.bin/z-ai")
)


def _run_zai_chat(prompt: str, system: Optional[str] = None, max_tokens: int = 8000) -> str:
    """Run the z-ai chat CLI and return the assistant text content."""
    with tempfile.NamedTemporaryFile(mode="w", suffix=".json", delete=False) as f:
        out_path = f.name
    try:
        cmd = [Z_AI_CLI, "chat", "--prompt", prompt, "--output", out_path]
        if system:
            cmd += ["--system", system]
        proc = subprocess.run(cmd, capture_output=True, text=True, timeout=180)
        if proc.returncode != 0:
            raise RuntimeError(f"z-ai chat failed: {proc.stderr[:500]}")
        with open(out_path, "r") as fp:
            data = json.load(fp)
        # Response structure: {choices:[{message:{content}}]} or {content}
        if isinstance(data, dict):
            if "choices" in data and data["choices"]:
                msg = data["choices"][0].get("message", {})
                return msg.get("content", "")
            if "content" in data:
                return data["content"]
            return json.dumps(data)
        return str(data)
    finally:
        try:
            os.unlink(out_path)
        except OSError:
            pass


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
        result = _run_zai_chat(prompt, system=EXTRACTION_SYSTEM)
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
        result = _run_zai_chat(prompt, system=CHECKLIST_SYSTEM)
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
        return _run_zai_chat(prompt, system=SUMMARY_SYSTEM)
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
        result = _run_zai_chat(prompt, system=ADDENDUM_SYSTEM)
        result = result.strip()
        first = result.find("{")
        last = result.rfind("}")
        if first >= 0 and last > first:
            result = result[first:last + 1]
        return json.loads(result)
    except (json.JSONDecodeError, RuntimeError) as e:
        return {"_error": f"Change detection failed: {e}", "summary": addendum_text[:500]}


# ---- AI Assistant (natural language Q&A over tenders) ----

ASSISTANT_SYSTEM = """You are TenderFlow AI, the mission-driven tender-winning assistant for a South African tender management system.

YOUR MISSION: Help the user WIN tenders. Every answer you give should move the user closer to a successful, compliant, on-time tender submission.

YOU KNOW EVERYTHING IN THE SYSTEM SNAPSHOT PROVIDED TO YOU, including:
- Every tender in the database (reference, title, client, status, closing date, scope, estimated value, person responsible)
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

HOW TO ANSWER:
1. Be specific — reference tenders by their reference number (e.g. "E137") and title.
2. Be actionable — don't just state facts; tell the user what to DO next to win the tender.
3. Be a coach — if a tender is at risk (deadline close, documents missing, briefing not confirmed), say so clearly and recommend immediate action.
4. Be honest — if data is missing or you don't know, say "I don't have that information" rather than inventing it.
5. Be structured — use bullet points and short paragraphs. For lists of missing items, use checklists.
6. Be South-Africa-aware — understand PSIRA grades (A/B/C/D/E), B-BBEE levels, CIPC, SARS, COIDA, POPIA, SBD forms, functionality/price evaluation, 80/20 or 90/10 preference points.
7. Be deadline-focused — always highlight closing dates, days remaining, and urgency.
8. Be compliance-focused — flag expired/expiring compliance documents that could disqualify a bid.

YOU CAN ANSWER QUESTIONS LIKE:
- "Which tenders are closing this week?" → list them with days remaining
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

When the user asks a general tender advice question (not about specific data), draw on your knowledge of South African procurement best practices.

YOUR TONE: Professional, encouraging, direct. You are the user's bid manager and you want them to win."""


def assistant_answer(question: str, context_data: Dict[str, Any]) -> str:
    """Answer a user question given the comprehensive system context."""
    # Build a focused context — include everything but cap size to avoid token limits
    context_str = json.dumps(context_data, default=str)
    # Cap at 40000 chars (~10000 tokens) to leave room for the answer
    if len(context_str) > 40000:
        context_str = context_str[:40000] + "\n...[truncated, more data exists]..."

    prompt = f"""Answer the user's question using the COMPLETE SYSTEM SNAPSHOT below.

This snapshot contains ALL data from every part of the TenderFlow system:
- All tenders with full details, AI-extracted info, checklists, documents, briefings, pricing, submissions, communications, addendums
- The compliance document library with expiry dates
- Dashboard statistics
- Extracted text from uploaded tender documents

COMPLETE SYSTEM SNAPSHOT (JSON):
{context_str}

USER QUESTION:
{question}

Remember your mission: help the user WIN this tender. Be specific, actionable, and honest. Reference tenders by their reference number. If the question is about a specific tender, focus on that tender's data. If data is missing, say so."""
    try:
        return _run_zai_chat(prompt, system=ASSISTANT_SYSTEM, max_tokens=6000)
    except RuntimeError as e:
        return f"I couldn't process that request right now. ({e})"


def answer_general_question(question: str) -> str:
    """General fallback chat (no system data)."""
    try:
        return _run_zai_chat(question, system=ASSISTANT_SYSTEM)
    except RuntimeError as e:
        return f"I couldn't process that request right now. ({e})"


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

def _run_zai_web_search(query: str, num: int = 10) -> List[Dict[str, Any]]:
    """Run the z-ai web_search function CLI and return search results."""
    with tempfile.NamedTemporaryFile(mode="w", suffix=".json", delete=False) as f:
        out_path = f.name
    try:
        args = json.dumps({"query": query, "num": num})
        cmd = [Z_AI_CLI, "function", "-n", "web_search", "-a", args, "-o", out_path]
        proc = subprocess.run(cmd, capture_output=True, text=True, timeout=60)
        if proc.returncode != 0:
            raise RuntimeError(f"z-ai web_search failed: {proc.stderr[:500]}")
        with open(out_path, "r") as fp:
            data = json.load(fp)
        if isinstance(data, list):
            return data
        if isinstance(data, dict) and "results" in data:
            return data["results"]
        return []
    except (json.JSONDecodeError, RuntimeError, Exception):
        return []
    finally:
        try:
            os.unlink(out_path)
        except OSError:
            pass


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


def discover_tenders(
    category: str,
    keywords: str = "",
    location: str = "South Africa",
    num_results: int = 15,
) -> Dict[str, Any]:
    """
    Find real open tenders matching the given criteria.
    Uses Python scrapers to directly fetch real tender listings from SA portals,
    then falls back to AI web search for broader coverage.
    Returns a dict with 'query', 'results', 'sources', 'raw_count'.
    """
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
            raw_results = _run_zai_web_search(query, num=num_results)
            if raw_results:
                # Use AI to structure the raw web search results
                raw_text = json.dumps(raw_results, indent=2, default=str)[:20000]
                prompt = f"""Analyze these web search results and extract ONLY actual tender opportunities.
If a result is a news article, blog post, or generic page (not an actual tender listing), EXCLUDE it.

The user is looking for: {category} {keywords} in {location}

RAW SEARCH RESULTS (JSON):
{raw_text}

Return ONLY the JSON array as specified. Exclude non-tender results."""
                try:
                    response = _run_zai_chat(prompt, system=DISCOVER_SYSTEM)
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
    all_results = scraped_results + web_search_results
    seen_urls = set()
    seen_titles = set()
    deduped = []
    for r in all_results:
        url = r.get("url", "")
        title = r.get("title", "").lower().strip()[:80]
        if url in seen_urls or title in seen_titles:
            continue
        seen_urls.add(url)
        seen_titles.add(title)
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
Start each document with a formal header block:

[COMPANY NAME]
[Company Address]
[Phone] | [Email] | [Website]
Registration No: [Reg Number] | VAT: [VAT] | PSIRA: [PSIRA No]

Then the document title, reference, and date.
Then the table of contents (if applicable).
Then the body content.
End with a signature block for the director/authorized signatory."""


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
        return _run_zai_chat(prompt, system=DOC_GEN_SYSTEM, max_tokens=6000)
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
        return _run_zai_chat(prompt, system=DOC_GEN_SYSTEM, max_tokens=6000)
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
        return _run_zai_chat(prompt, system=DOC_GEN_SYSTEM, max_tokens=6000)
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
        return _run_zai_chat(prompt, system=DOC_GEN_SYSTEM, max_tokens=6000)
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
        return _run_zai_chat(prompt, system=DOC_GEN_SYSTEM, max_tokens=6000)
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
        return _run_zai_chat(prompt, system=DOC_GEN_SYSTEM, max_tokens=3000)
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
        return _run_zai_chat(prompt, system=DOC_GEN_SYSTEM, max_tokens=4000)
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
        return _run_zai_chat(prompt, system=DOC_GEN_SYSTEM, max_tokens=5000)
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
        return _run_zai_chat(prompt, system=DOC_GEN_SYSTEM, max_tokens=4000)
    except RuntimeError as e:
        return f"Document generation failed: {e}"


def generate_organogram(tender: Dict[str, Any], extracted: Dict[str, Any], company: Dict[str, Any]) -> str:
    header = _build_company_header(company)
    prompt = f"""Generate an ORGANOGRAM document for the following tender.

COMPANY PROFILE:
{header}

TENDER DETAILS:
- Reference: {tender.get('reference_number', 'N/A')}
- Client: {tender.get('client_company', 'N/A')}
- Personnel required: {extracted.get('number_of_personnel_guards', 'N/A')}
- PSIRA grades: {extracted.get('required_psira_grades', [])}

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
        return _run_zai_chat(prompt, system=DOC_GEN_SYSTEM, max_tokens=4000)
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
        return _run_zai_chat(prompt, system=DOC_GEN_SYSTEM, max_tokens=5000)
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
        return _run_zai_chat(prompt, system=DOC_GEN_SYSTEM, max_tokens=4000)
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
        return _run_zai_chat(prompt, system=DOC_GEN_SYSTEM, max_tokens=4000)
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
        return _run_zai_chat(prompt, system=DOC_GEN_SYSTEM, max_tokens=5000)
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
        result = _run_zai_chat(prompt, system=PRICING_SYSTEM)
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

READINESS_SYSTEM = """You are TenderFlow AI, a tender readiness analyst. Your job is to give the user a crystal-clear picture of where they stand with a tender and exactly what they need to do to win it.

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


def generate_readiness_report(tender_data: Dict[str, Any], extracted: Dict[str, Any], checklist: List[Dict[str, Any]], library_docs: List[Dict[str, Any]], company: Dict[str, Any]) -> str:
    """
    Generate the comprehensive Tender Readiness Report.
    This is the 'most important requirement' — tells the user everything they need to know.
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
        return _run_zai_chat(prompt, system=READINESS_SYSTEM, max_tokens=6000)
    except RuntimeError as e:
        return f"Readiness report generation failed: {e}"


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
        result = _run_zai_chat(prompt, system=SMART_DOCS_SYSTEM)
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
