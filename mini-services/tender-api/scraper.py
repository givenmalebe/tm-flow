"""
TenderFlow - Real Tender Scraper
Directly scrapes South African tender portals using Python requests + BeautifulSoup
to get REAL, CURRENT tender listings.
"""
import re
import json
from datetime import datetime, date
from typing import List, Dict, Any, Optional
from urllib.parse import urljoin, urlparse, quote

import requests
from bs4 import BeautifulSoup

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "en-ZA,en;q=0.9",
    "Accept-Encoding": "gzip, deflate, br",
    "Connection": "keep-alive",
    "Upgrade-Insecure-Requests": "1",
}

TIMEOUT = 15

# The official National Treasury eTenders portal: public, authoritative, and —
# unlike members-only portals — its tender document links actually resolve.
ETENDERS_BASE = "https://www.etenders.gov.za"
ETENDERS_API = f"{ETENDERS_BASE}/Home/PaginatedTenderOpportunities"
ETENDERS_ACTIVE_STATUS = "1"  # status=1 -> currently open/published tenders
ETENDERS_TIMEOUT = 30

# Hosts whose tender detail pages sit behind a paid login. We still read their
# public listings for content, but we must never emit these as clickable links
# (a login wall is worse than offering no link at all).
LOGIN_WALL_HOSTS = {"security.co.za", "www.security.co.za"}


def public_url_or_none(url: Optional[str]) -> Optional[str]:
    """Return the URL only if it is a genuinely public link; drop known login
    walls so the UI never sends a user to a members-only sign-in page."""
    if not url:
        return None
    try:
        host = (urlparse(str(url)).netloc or "").lower().split(":")[0]
    except Exception:
        return url
    if host in LOGIN_WALL_HOSTS:
        return None
    return url


def _fetch(url: str, session: Optional[requests.Session] = None) -> Optional[str]:
    """Fetch a URL and return HTML text, or None on failure."""
    s = session or requests.Session()
    try:
        resp = s.get(url, headers=HEADERS, timeout=TIMEOUT, allow_redirects=True)
        if resp.status_code == 200:
            return resp.text
    except Exception:
        pass
    return None


def _parse_date(date_str: str) -> Optional[str]:
    """Try to parse a date string and return ISO format YYYY-MM-DD."""
    if not date_str:
        return None
    date_str = date_str.strip()
    # ISO 8601, with or without a time component (e.g. 2026-12-03T10:00:00).
    try:
        return datetime.fromisoformat(date_str.replace("Z", "+00:00")).date().isoformat()
    except ValueError:
        pass
    # Try common SA date formats
    formats = [
        "%d %b %Y", "%d %B %Y",
        "%d-%m-%Y", "%d/%m/%Y",
        "%Y-%m-%d", "%d.%m.%Y",
        "%d %b %Y %H:%M", "%d %B %Y %H:%M",
        "%d %b %Y %H:%M%p", "%d %B %Y %H:%M%p",
        "%d/%m/%Y %H:%M", "%d-%m-%Y %H:%M",
    ]
    for fmt in formats:
        try:
            dt = datetime.strptime(date_str[:25].strip(), fmt)
            return dt.date().isoformat()
        except ValueError:
            continue
    # Try regex extraction
    m = re.search(r"(\d{1,2})\s+([A-Za-z]{3,9})\s+(\d{4})", date_str)
    if m:
        try:
            dt = datetime.strptime(f"{m.group(1)} {m.group(2)} {m.group(3)}", "%d %B %Y")
            return dt.date().isoformat()
        except ValueError:
            try:
                dt = datetime.strptime(f"{m.group(1)} {m.group(2)} {m.group(3)}", "%d %b %Y")
                return dt.date().isoformat()
            except ValueError:
                pass
    return None


# ---------------------- Portal Scrapers ----------------------

def scrape_security_co_za(category: str = "", keywords: str = "", location: str = "South Africa", limit: int = 20) -> List[Dict[str, Any]]:
    """
    Scrape security.co.za/tenders — a real SA tender portal with 100+ live tenders.
    Returns structured tender entries.
    """
    base = "https://www.security.co.za"
    url = f"{base}/tenders/"
    if keywords or category:
        q = " ".join(filter(None, [category, keywords])).strip()
        url = f"{base}/tenders/?q={q.replace(' ', '+')}"

    html = _fetch(url)
    if not html:
        return []

    soup = BeautifulSoup(html, "lxml")
    # Find all "View Tender Details" links
    view_links = soup.find_all("a", href=re.compile(r"/Tender/ViewTender\?tenderId="))
    results = []

    for link in view_links[:limit]:
        try:
            href = link.get("href", "")
            tender_id = re.search(r"tenderId=(\d+)", href)
            ref_no = tender_id.group(1) if tender_id else ""

            # Walk up to find the container with tender info
            parent = link
            card_text = ""
            for _ in range(6):
                parent = parent.parent
                if parent is None:
                    break
                t = parent.get_text(" ", strip=True)
                if 50 < len(t) < 1500 and ("Ref No" in t or "Deadline" in t or "Region" in t):
                    card_text = t
                    break

            if not card_text:
                continue

            # Extract fields with regex
            desc_match = re.search(r"Description:\s*(.+?)(?:View Tender Details|$)", card_text, re.S)
            description = desc_match.group(1).strip() if desc_match else ""

            region_match = re.search(r"Region:\s*(.+?)(?:Client Type|Deadline|Date of Meeting|$)", card_text)
            region = region_match.group(1).strip() if region_match else ""

            deadline_match = re.search(r"Deadline:\s*(.+?)(?:Date of Meeting|Description|$)", card_text)
            deadline_str = deadline_match.group(1).strip() if deadline_match else ""
            closing_date = _parse_date(deadline_str)

            client_type_match = re.search(r"Client Type:\s*(.+?)(?:Deadline|Region|Date of Meeting|$)", card_text)
            client_type = client_type_match.group(1).strip() if client_type_match else ""

            # The description is often the tender title too
            title = description[:200] if description else f"Tender {ref_no}"

            # Filter by location if specified and not "South Africa"
            if location and location != "South Africa":
                loc_lower = location.lower()
                if region and loc_lower not in region.lower() and region.lower() not in loc_lower:
                    # Still include it but mark relevance lower
                    pass

            # Filter by keywords — this portal lists everything, so we keep only
            # what matches the organisation we are researching for.
            relevance = "high"
            search_terms = [t.lower() for t in (category + " " + keywords).split() if len(t) > 2]
            if search_terms:
                text_lower = (title + " " + description + " " + region + " " + client_type).lower()
                matches = sum(1 for term in search_terms if term in text_lower)
                if matches == 0:
                    continue
                if matches < len(search_terms) / 2:
                    relevance = "medium"

            results.append({
                "title": title,
                "client": client_type or "Government",
                "category": category or "Security Services",
                "location": region or "South Africa",
                "closing_date": closing_date,
                "description": description[:500],
                "source_site": "security.co.za",
                # Its detail pages are members-only, so no public link exists.
                # Keep the scraped content, but offer no dead login-wall link.
                "url": None,
                "reference_number": ref_no,
                "estimated_value": None,
                "relevance": relevance,
            })
        except Exception:
            continue

    return results


def scrape_tenderflow_co_za(category: str = "", keywords: str = "", location: str = "South Africa", limit: int = 20) -> List[Dict[str, Any]]:
    """Scrape tenderflow.co.za tender listings."""
    base = "https://www.tenderflow.co.za"
    # Try category-specific pages
    category_slug = ""
    if category:
        slug = category.lower().strip()
        # Map common categories to slugs
        slug_map = {
            "security services": "security-and-investigation-activities",
            "security guards": "security-and-investigation-activities",
            "security": "security-and-investigation-activities",
            "cleaning": "cleaning-activities",
            "construction": "construction-work",
            "it": "computer-related-services",
        }
        category_slug = slug_map.get(slug, slug.replace(" ", "-"))

    url = f"{base}/tenders/{category_slug}" if category_slug else f"{base}/tenders"
    html = _fetch(url)
    if not html:
        return []

    soup = BeautifulSoup(html, "lxml")
    results = []

    # Look for tender links
    tender_links = soup.find_all("a", href=re.compile(r"/tender/", re.I))
    seen = set()

    for link in tender_links[:limit * 2]:
        try:
            href = link.get("href", "")
            if href in seen:
                continue
            seen.add(href)
            detail_url = urljoin(base, href)
            title = link.get_text(strip=True)
            if not title or len(title) < 10:
                continue

            # Try to get parent for more context
            parent = link.parent
            card_text = ""
            for _ in range(4):
                if parent is None:
                    break
                t = parent.get_text(" ", strip=True)
                if 30 < len(t) < 1000:
                    card_text = t
                    break
                parent = parent.parent

            # Extract closing date from card text
            closing_date = None
            if card_text:
                date_match = re.search(r"(\d{1,2}\s+[A-Za-z]{3,9}\s+\d{4})", card_text)
                if date_match:
                    closing_date = _parse_date(date_match.group(1))

            # Relevance check — drop listings unrelated to the organisation we are
            # researching for, so it only ever sees its own kind of work.
            relevance = "medium"
            search_terms = [t.lower() for t in (category + " " + keywords).split() if len(t) > 2]
            if search_terms:
                text_lower = (title + " " + card_text).lower()
                matches = sum(1 for term in search_terms if term in text_lower)
                if matches == 0:
                    continue
                if matches >= len(search_terms) / 2:
                    relevance = "high"
                else:
                    relevance = "medium"

            results.append({
                "title": title[:200],
                "client": "See tender page",
                "category": category or "General",
                "location": location or "South Africa",
                "closing_date": closing_date,
                "description": card_text[:500] if card_text else title,
                "source_site": "tenderflow.co.za",
                "url": detail_url,
                "reference_number": None,
                "estimated_value": None,
                "relevance": relevance,
            })
            if len(results) >= limit:
                break
        except Exception:
            continue

    return results


def _etenders_document_url(doc: Dict[str, Any]) -> Optional[str]:
    """Build the public download URL for one eTenders support document."""
    if not isinstance(doc, dict):
        return None
    guid = doc.get("supportDocumentID") or doc.get("documentID")
    if not guid:
        return None
    ext = str(doc.get("extension") or "").strip()
    name = str(doc.get("fileName") or "tender-document").strip()
    if ext and not name.lower().endswith(ext.lower()):
        name = f"{name}{ext}"
    return (
        f"{ETENDERS_BASE}/home/Download/"
        f"?blobName={guid}{ext}&downloadedFileName={quote(name)}"
    )


def _etenders_active_opportunities() -> List[Dict[str, Any]]:
    """Fetch every currently-open tender from the eTenders JSON endpoint.

    The portal renders its table client-side and ignores DataTables search
    params, so we pull the full active set (a few MB) and filter locally.
    """
    columns = ["", "category", "description", "eSubmission", "date_Published", "closing_Date"]
    params = {
        "draw": "1",
        "start": "0",
        "length": "3000",
        "search[value]": "",
        "search[regex]": "false",
        "status": ETENDERS_ACTIVE_STATUS,
        "order[0][column]": "5",
        "order[0][dir]": "asc",
    }
    for i, key in enumerate(columns):
        params[f"columns[{i}][data]"] = key
        params[f"columns[{i}][name]"] = ""
        params[f"columns[{i}][searchable]"] = "true"
        params[f"columns[{i}][orderable]"] = "true"
        params[f"columns[{i}][search][value]"] = ""
        params[f"columns[{i}][search][regex]"] = "false"

    headers = dict(HEADERS)
    headers["Accept"] = "application/json, text/javascript, */*; q=0.01"
    headers["X-Requested-With"] = "XMLHttpRequest"
    headers["Referer"] = f"{ETENDERS_BASE}/Home/opportunities"
    try:
        resp = requests.get(ETENDERS_API, headers=headers, params=params, timeout=ETENDERS_TIMEOUT)
        if resp.status_code == 200:
            payload = resp.json()
            if isinstance(payload, dict):
                return payload.get("data") or []
    except Exception:
        pass
    return []


def _etenders_row_to_result(
    row: Dict[str, Any], category: str, terms: List[str], location: str
) -> Optional[Dict[str, Any]]:
    if not isinstance(row, dict):
        return None

    title = re.sub(r"\s+", " ", str(row.get("description") or "")).strip()
    if not title:
        return None

    department = (row.get("organ_of_State") or row.get("department") or "").strip() or None
    row_category = (row.get("category") or "").strip() or None
    province = (row.get("province") or "").strip() or None
    closing_date = _parse_date(row.get("closing_Date"))
    reference = str(row.get("tender_No") or "").strip() or None

    # The single public, working link to the tender: its official document.
    doc_url = None
    docs = row.get("supportDocument")
    docs = docs if isinstance(docs, list) else []
    for doc in docs:
        doc_url = _etenders_document_url(doc)
        if doc_url:
            break

    # Relevance to the company's categories / keywords.
    text = f"{title} {row_category or ''} {department or ''}".lower()
    if terms:
        matches = sum(1 for t in terms if t in text)
        if matches >= max(1, len(terms) // 2):
            relevance = "high"
        elif matches:
            relevance = "medium"
        else:
            relevance = "low"
    else:
        relevance = "medium"
    loc = (location or "").strip().lower()
    if loc and loc != "south africa" and province and loc in province.lower():
        relevance = "high"

    # Enrich the description with official metadata worth surfacing.
    bits: List[str] = []
    if department:
        bits.append(f"Department: {department}")
    if row_category:
        bits.append(f"Category: {row_category}")
    briefing = row.get("compulsory_briefing_session")
    if briefing:
        briefing_date = _parse_date(briefing) or str(briefing)[:16]
        venue = str(row.get("briefingVenue") or "").strip()
        bits.append(f"Compulsory briefing: {briefing_date}" + (f" ({venue})" if venue else ""))
    contact_line = " | ".join(
        str(x).strip()
        for x in (row.get("contactPerson"), row.get("email"), row.get("telephone"))
        if x
    )
    if contact_line:
        bits.append(f"Contact: {contact_line}")
    if row.get("eSubmission"):
        bits.append("Online submission (eSubmission) available")
    if doc_url:
        bits.append("Official tender document available via the link")

    description = title if not bits else title + "\n\n" + " · ".join(bits)

    return {
        "title": title[:200],
        "client": department or "Government",
        "category": category or row_category or "Government Tender",
        "location": province or (location or "South Africa"),
        "closing_date": closing_date,
        "description": description[:2000],
        "source_site": "etenders.gov.za",
        "url": doc_url,
        "reference_number": reference[:255] if reference else None,
        "estimated_value": None,
        "relevance": relevance,
    }


def scrape_etenders_opportunities(
    category: str = "", keywords: str = "", location: str = "South Africa", limit: int = 20
) -> List[Dict[str, Any]]:
    """Scrape the official National Treasury eTenders portal (etenders.gov.za).

    This is the primary discovery source: public, authoritative and — unlike
    members-only portals — every tender it yields carries a working public
    document link. Rows are ranked by relevance then soonest closing date.
    """
    rows = _etenders_active_opportunities()
    if not rows:
        return []

    terms = [t.lower() for t in f"{category} {keywords}".split() if len(t) > 2]

    results: List[Dict[str, Any]] = []
    for row in rows:
        try:
            parsed = _etenders_row_to_result(row, category, terms, location)
        except Exception:
            parsed = None
        if parsed:
            results.append(parsed)

    rel_order = {"high": 0, "medium": 1, "low": 2}
    results.sort(
        key=lambda r: (rel_order.get(r.get("relevance", "medium"), 1), r.get("closing_date") or "9999")
    )
    # When we know what the organisation does, never pad its list with tenders
    # for completely unrelated work.
    if terms:
        relevant = [r for r in results if r.get("relevance") in ("high", "medium")]
        if relevant:
            return relevant[:limit]
    return results[:limit]


# Backwards-compatible alias (older callers used the search-oriented name).
scrape_etenders_search = scrape_etenders_opportunities


def scrape_all(category: str, keywords: str = "", location: str = "South Africa", limit: int = 20) -> Dict[str, Any]:
    """
    Run all scrapers in parallel-ish (sequential) and merge results.
    Returns {results, sources, total_found, errors}.
    """
    all_results: List[Dict[str, Any]] = []
    sources_used: List[str] = []
    errors: List[str] = []

    # 1. etenders.gov.za — official, public, and its document links resolve.
    try:
        results = scrape_etenders_opportunities(category, keywords, location, limit)
        if results:
            all_results.extend(results)
            sources_used.append(f"etenders.gov.za ({len(results)} tenders)")
    except Exception as e:
        errors.append(f"etenders.gov.za: {str(e)[:100]}")

    # 2. security.co.za — content only (its detail pages are members-only).
    try:
        results = scrape_security_co_za(category, keywords, location, limit)
        if results:
            all_results.extend(results)
            sources_used.append(f"security.co.za ({len(results)} tenders)")
    except Exception as e:
        errors.append(f"security.co.za: {str(e)[:100]}")

    # 3. tenderflow.co.za
    try:
        results = scrape_tenderflow_co_za(category, keywords, location, limit)
        if results:
            all_results.extend(results)
            sources_used.append(f"tenderflow.co.za ({len(results)} tenders)")
    except Exception as e:
        errors.append(f"tenderflow.co.za: {str(e)[:100]}")

    # Never surface a login-wall URL, whatever the source.
    for r in all_results:
        r["url"] = public_url_or_none(r.get("url"))

    # Deduplicate: same public link => same tender; otherwise fall back to title.
    seen_keys = set()
    deduped = []
    for r in all_results:
        key = (r.get("url") or "").strip().lower() or r["title"].lower().strip()[:80]
        if key not in seen_keys:
            seen_keys.add(key)
            deduped.append(r)

    # Sort by relevance (high first), then by closing date (soonest first)
    rel_order = {"high": 0, "medium": 1, "low": 2}
    deduped.sort(key=lambda r: (rel_order.get(r.get("relevance", "medium"), 1), r.get("closing_date") or "9999"))

    return {
        "results": deduped[:limit],
        "sources": sources_used,
        "total_found": len(deduped),
        "errors": errors,
    }


if __name__ == "__main__":
    # Quick test against the official eTenders portal.
    print("Testing etenders.gov.za scraper...")
    results = scrape_etenders_opportunities("security", "guards PSIRA", "South Africa", 5)
    print(f"Found {len(results)} tenders:")
    for r in results:
        print(f"  - {r['title'][:80]}")
        print(f"    Client: {r['client']}, Location: {r['location']}, Closing: {r['closing_date']}")
        print(f"    Ref: {r['reference_number']}  URL: {r['url']}")
        print()
