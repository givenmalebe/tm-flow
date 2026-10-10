"""
TenderFlow - Link verification.

A found tender is only useful if the user can actually open it. This module
resolves each candidate URL and classifies it so the AI never hands the user a
dead link, a login wall, or a page that has nothing to do with the tender.

Classification:
  "page"  - resolves to real HTML content (the tender page the user asked for)
  "pdf"   - resolves to a real document (official tender document)
  "login" - resolves, but lands behind a sign-in / registration wall
  "dead"  - 404/410, blocked, unreachable, or not a usable web resource
"""
import re
from concurrent.futures import FIRST_COMPLETED, ThreadPoolExecutor, wait
from typing import Any, Dict, List, Optional
from urllib.parse import urlparse

import requests

from scraper import HEADERS, public_url_or_none

VERIFY_TIMEOUT = 9.0
VERIFY_HEADERS = dict(HEADERS)

# Redirect targets / page markers that mean "you must log in to see this".
_LOGIN_URL_RE = re.compile(
    r"/(account/)?(login|logon|signin|sign-in|register|members?[-_]?only)"
    r"|[?&](returnurl|redirect)=",
    re.I,
)
_LOGIN_BODY_RE = re.compile(
    r"(only members can|sign in to (view|see|continue)|please (log ?in|sign ?in)"
    r"|members? only|this (content|page) is available to (members|registered)"
    r"|create an? account to (view|see))",
    re.I,
)
_BAD_STATUS = {401, 402, 403, 404, 405, 410, 451}


def _content_kind(headers: Dict[str, str]) -> str:
    ctype = (headers.get("Content-Type") or "").lower()
    if "pdf" in ctype:
        return "pdf"
    if "html" in ctype or "xml" in ctype or "text" in ctype:
        return "page"
    return "other"


def verify_link(url: Optional[str], timeout: float = VERIFY_TIMEOUT,
                session: Optional[requests.Session] = None) -> Dict[str, Any]:
    """Resolve one URL and classify it as page | pdf | login | dead."""
    if not url:
        return {"url": None, "final_url": None, "kind": "dead", "status": None,
                "content_type": None, "reason": "no url"}

    url = public_url_or_none(str(url).strip())
    if not url:
        return {"url": None, "final_url": None, "kind": "login", "status": None,
                "content_type": None, "reason": "known members-only portal"}

    host = (urlparse(url).netloc or "").lower()
    if not host:
        return {"url": None, "final_url": None, "kind": "dead", "status": None,
                "content_type": None, "reason": "malformed url"}

    owns = session or requests.Session()
    try:
        resp = owns.get(
            url,
            headers=VERIFY_HEADERS,
            timeout=timeout,
            allow_redirects=True,
            stream=True,
        )
    except requests.Timeout:
        return {"url": None, "final_url": url, "kind": "dead", "status": None,
                "content_type": None, "reason": "timeout"}
    except Exception as e:
        return {"url": None, "final_url": url, "kind": "dead", "status": None,
                "content_type": None, "reason": f"unreachable: {str(e)[:60]}"}

    try:
        final_url = str(resp.url or url)
        status = resp.status_code
        ctype = (resp.headers.get("Content-Type") or "").lower()
        kind = _content_kind(resp.headers)

        if status in _BAD_STATUS or status >= 400:
            return {"url": None, "final_url": final_url, "kind": "dead", "status": status,
                    "content_type": ctype, "reason": f"http {status}"}

        if _LOGIN_URL_RE.search(urlparse(final_url).path + "?" + (urlparse(final_url).query or "")):
            return {"url": None, "final_url": final_url, "kind": "login", "status": status,
                    "content_type": ctype, "reason": "redirected to sign-in"}

        if kind == "pdf":
            return {"url": final_url, "final_url": final_url, "kind": "pdf", "status": status,
                    "content_type": ctype, "reason": "document"}

        if kind != "page":
            return {"url": None, "final_url": final_url, "kind": "dead", "status": status,
                    "content_type": ctype, "reason": f"unsupported content type {ctype[:40]}"}

        # An HTML page: peek at the first chunk to catch JS-rendered login walls.
        body = b""
        try:
            for chunk in resp.iter_content(2048):
                body += chunk
                if len(body) >= 8192:
                    break
        except Exception:
            pass
        finally:
            resp.close()

        try:
            text = body.decode("utf-8", "ignore")
        except Exception:
            text = ""
        if _LOGIN_BODY_RE.search(text):
            return {"url": None, "final_url": final_url, "kind": "login", "status": status,
                    "content_type": ctype, "reason": "page demands sign-in"}

        return {"url": final_url, "final_url": final_url, "kind": "page", "status": status,
                "content_type": ctype, "reason": "ok"}
    finally:
        try:
            resp.close()
        except Exception:
            pass


def verify_links(urls: List[Optional[str]], timeout: float = VERIFY_TIMEOUT,
                 max_workers: int = 8, deadline_s: Optional[float] = None) -> Dict[str, Dict[str, Any]]:
    """Verify many links concurrently. Returns {original_url: verdict}."""
    import time

    uniq: List[str] = []
    for u in urls:
        if u and u not in uniq:
            uniq.append(u)
    if not uniq:
        return {}

    started = time.monotonic()
    verdicts: Dict[str, Dict[str, Any]] = {}
    session = requests.Session()

    def _check(u: str) -> Dict[str, Any]:
        try:
            return verify_link(u, timeout, session)
        except Exception as e:
            return {"url": None, "final_url": u, "kind": "dead", "status": None,
                    "content_type": None, "reason": f"verifier error: {str(e)[:60]}"}

    with ThreadPoolExecutor(max_workers=max(1, min(max_workers, len(uniq)))) as pool:
        futures = {pool.submit(_check, u): u for u in uniq}
        pending = set(futures)
        while pending:
            done, pending = wait(pending, timeout=1.0, return_when=FIRST_COMPLETED)
            for fut in done:
                u = futures[fut]
                verdicts[u] = fut.result()
            if deadline_s and (time.monotonic() - started) >= deadline_s:
                break
    try:
        pool.shutdown(wait=False, cancel_futures=True)
    except Exception:
        pass
    try:
        session.close()
    except Exception:
        pass
    # Anything that never returned (deadline) counts as dead.
    for u in uniq:
        verdicts.setdefault(
            u, {"url": None, "final_url": u, "kind": "dead", "status": None,
                "content_type": None, "reason": "not checked in time"}
        )
    return verdicts


def apply_verdicts(items: List[Dict[str, Any]], verdicts: Dict[str, Dict[str, Any]],
                   allow_pdf: bool = True) -> List[Dict[str, Any]]:
    """Rewrite each item's `url` to the verified final URL; drop the unverifiable.

    An item survives when its link resolves to a real page (or, if allowed, the
    official document). Everything else is removed so the tenant only ever sees
    tenders they can actually open.
    """
    kept: List[Dict[str, Any]] = []
    for item in items:
        if not isinstance(item, dict):
            continue
        original = item.get("url")
        verdict = verdicts.get(original)
        if not verdict or verdict.get("kind") == "dead":
            continue
        if verdict.get("kind") == "login":
            continue
        if verdict.get("kind") == "pdf" and not allow_pdf:
            continue
        item["_orig_url"] = original
        item["url"] = verdict.get("final_url") or original
        item["link_kind"] = verdict.get("kind")
        kept.append(item)
    return kept