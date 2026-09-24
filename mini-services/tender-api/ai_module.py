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


# ---- Tender summary ----

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
  "summary": string
}"""


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

