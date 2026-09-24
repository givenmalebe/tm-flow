"""
TenderFlow - Real Tender Scraper
Directly scrapes South African tender portals using Python requests + BeautifulSoup
to get REAL, CURRENT tender listings.
"""
import re
import json
from datetime import datetime, date
from typing import List, Dict, Any, Optional
from urllib.parse import urljoin, urlparse

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
            detail_url = urljoin(base, href)
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

            # Filter by keywords
            relevance = "high"
            search_terms = [t.lower() for t in (category + " " + keywords).split() if len(t) > 2]
            if search_terms:
                text_lower = (title + " " + description).lower()
                matches = sum(1 for term in search_terms if term in text_lower)
                if matches == 0:
                    relevance = "low"
                elif matches < len(search_terms) / 2:
                    relevance = "medium"

            results.append({
                "title": title,
                "client": client_type or "Government",
                "category": category or "Security Services",
                "location": region or "South Africa",
                "closing_date": closing_date,
                "description": description[:500],
                "source_site": "security.co.za",
                "url": detail_url,
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

            # Relevance check
            relevance = "medium"
            search_terms = [t.lower() for t in (category + " " + keywords).split() if len(t) > 2]
            if search_terms:
                text_lower = (title + " " + card_text).lower()
                matches = sum(1 for term in search_terms if term in text_lower)
                if matches >= len(search_terms) / 2:
                    relevance = "high"
                elif matches == 0:
                    relevance = "low"

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


def scrape_etenders_search(category: str = "", keywords: str = "", location: str = "South Africa", limit: int = 20) -> List[Dict[str, Any]]:
    """
    Try the National Treasury eTenders portal API/search.
    The portal at etenders.gov.za publishes all government tenders.
    """
    base = "https://www.etenders.gov.za"
    # Try the tender search page
    url = f"{base}/tendersearch"
    html = _fetch(url)
    if not html:
        # Try alternate page
        html = _fetch(f"{base}/")

    if not html:
        return []

    soup = BeautifulSoup(html, "lxml")
    results = []

    # Look for tender entries in tables or lists
    # eTenders often uses tables
    tables = soup.find_all("table")
    for table in tables[:2]:
        rows = table.find_all("tr")
        for row in rows[1:]:  # skip header
            try:
                cells = row.find_all(["td", "th"])
                if len(cells) < 2:
                    continue
                cell_texts = [c.get_text(strip=True) for c in cells]
                # Try to identify columns
                full_text = " | ".join(cell_texts)
                if not any(kw in full_text.lower() for kw in ["tender", "bid", "closing", "dept"]):
                    continue

                title = cell_texts[0] if cell_texts else ""
                if not title or len(title) < 5:
                    continue

                # Find a link in the row
                link = row.find("a", href=True)
                detail_url = urljoin(base, link["href"]) if link else url

                # Try to find closing date
                closing_date = None
                for ct in cell_texts:
                    cd = _parse_date(ct)
                    if cd:
                        closing_date = cd
                        break

                results.append({
                    "title": title[:200],
                    "client": cell_texts[1] if len(cell_texts) > 1 else "Government",
                    "category": category or "Government Tender",
                    "location": location or "South Africa",
                    "closing_date": closing_date,
                    "description": full_text[:500],
                    "source_site": "etenders.gov.za",
                    "url": detail_url,
                    "reference_number": None,
                    "estimated_value": None,
                    "relevance": "medium",
                })
                if len(results) >= limit:
                    return results
            except Exception:
                continue

    return results


def scrape_all(category: str, keywords: str = "", location: str = "South Africa", limit: int = 20) -> Dict[str, Any]:
    """
    Run all scrapers in parallel-ish (sequential) and merge results.
    Returns {results, sources, total_found, errors}.
    """
    all_results: List[Dict[str, Any]] = []
    sources_used: List[str] = []
    errors: List[str] = []

    # 1. security.co.za — most reliable, has 100+ tenders
    try:
        results = scrape_security_co_za(category, keywords, location, limit)
        if results:
            all_results.extend(results)
            sources_used.append(f"security.co.za ({len(results)} tenders)")
    except Exception as e:
        errors.append(f"security.co.za: {str(e)[:100]}")

    # 2. tenderflow.co.za
    try:
        results = scrape_tenderflow_co_za(category, keywords, location, limit)
        if results:
            all_results.extend(results)
            sources_used.append(f"tenderflow.co.za ({len(results)} tenders)")
    except Exception as e:
        errors.append(f"tenderflow.co.za: {str(e)[:100]}")

    # 3. etenders.gov.za
    try:
        results = scrape_etenders_search(category, keywords, location, limit)
        if results:
            all_results.extend(results)
            sources_used.append(f"etenders.gov.za ({len(results)} tenders)")
    except Exception as e:
        errors.append(f"etenders.gov.za: {str(e)[:100]}")

    # Deduplicate by title (case-insensitive)
    seen_titles = set()
    deduped = []
    for r in all_results:
        key = r["title"].lower().strip()[:80]
        if key not in seen_titles:
            seen_titles.add(key)
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
    # Quick test
    print("Testing security.co.za scraper...")
    results = scrape_security_co_za("security guards", "PSIRA", "South Africa", 5)
    print(f"Found {len(results)} tenders:")
    for r in results:
        print(f"  - {r['title'][:80]}")
        print(f"    Client: {r['client']}, Location: {r['location']}, Closing: {r['closing_date']}")
        print(f"    URL: {r['url']}")
        print()
