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

ASSISTANT_SYSTEM = """You are TenderFlow AI, an assistant for a tender management system.
You help users manage tenders by answering questions based on the tender data provided to you.
Be concise, specific and reference tenders by their reference number or title when relevant.
If data is missing, say so. Do not invent data."""


def assistant_answer(question: str, context_data: Dict[str, Any]) -> str:
    """Answer a user question given the current tender context (dashboard snapshot)."""
    prompt = f"""Answer the user's question using ONLY the data below.

TENDER SYSTEM SNAPSHOT (JSON):
{json.dumps(context_data, default=str)[:30000]}

USER QUESTION:
{question}
"""
    try:
        return _run_zai_chat(prompt, system=ASSISTANT_SYSTEM)
    except RuntimeError as e:
        return f"I couldn't process that request right now. ({e})"


def answer_general_question(question: str) -> str:
    """General fallback chat."""
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
    Search the web for open tenders matching the given criteria.
    Returns a dict with 'query', 'results' (list of structured tenders), and 'raw_count'.
    """
    # Build an optimized search query
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

    # Do the web search
    raw_results = _run_zai_web_search(query, num=num_results)

    if not raw_results:
        return {
            "query": query,
            "results": [],
            "raw_count": 0,
            "error": "No search results returned. Please try different keywords.",
        }

    # Use AI to structure the raw results into clean tender entries
    raw_text = json.dumps(raw_results, indent=2, default=str)[:20000]
    prompt = f"""Analyze these web search results and extract ONLY actual tender opportunities.
If a result is a news article, blog post, or generic page (not an actual tender listing), EXCLUDE it.

The user is looking for: {category} {keywords} in {location}

RAW SEARCH RESULTS (JSON):
{raw_text}

Return ONLY the JSON array as specified. Exclude non-tender results."""
    try:
        response = _run_zai_chat(prompt, system=DISCOVER_SYSTEM)
        # Parse the JSON array from the response
        response = response.strip()
        if response.startswith("```"):
            response = response.split("\n", 1)[1] if "\n" in response else response[3:]
            if response.endswith("```"):
                response = response[:-3]
            response = response.strip()
        if response.startswith("json"):
            response = response[4:].strip()
        # Find first [ and last ]
        first = response.find("[")
        last = response.rfind("]")
        if first >= 0 and last > first:
            response = response[first:last + 1]
        structured = json.loads(response)
        if not isinstance(structured, list):
            structured = []
    except (json.JSONDecodeError, RuntimeError) as e:
        # Fallback: return raw results in a simpler format
        structured = [
            {
                "title": r.get("name", ""),
                "client": "Unknown",
                "category": category,
                "location": location,
                "closing_date": None,
                "description": r.get("snippet", ""),
                "source_site": r.get("host_name", ""),
                "url": r.get("url", ""),
                "reference_number": None,
                "estimated_value": None,
                "relevance": "medium",
            }
            for r in raw_results
        ]

    return {
        "query": query,
        "results": structured,
        "raw_count": len(raw_results),
    }

