"""Link verification + tenant capability profile + tenant-specific search.

Network is fully mocked: the verifier is exercised through a fake session and
the capability reader through real files written to a temp dir.
"""
import os

import ai_agent
import ai_module
import linkcheck
from tests.conftest import make_company, make_user


class _FakeResponse:
    def __init__(self, status=200, url="https://example.org/tender/1", content_type="text/html",
                 body=b"<html><body>tender</body></html>"):
        self.status_code = status
        self.url = url
        self.headers = {"Content-Type": content_type}
        self._body = body

    def iter_content(self, n):
        yield self._body

    def close(self):
        pass


class _FakeSession:
    def __init__(self, responses):
        self.responses = responses
        self.closed = False

    def get(self, url, **kwargs):
        r = self.responses.get(url)
        if r is None:
            raise linkcheck.requests.ConnectionError("no route")
        if isinstance(r, Exception):
            raise r
        return r

    def close(self):
        self.closed = True


# ---------------- link verification ----------------

def test_verify_link_classifies_a_real_page():
    url = "https://example.org/tender/1"
    verdict = linkcheck.verify_link(url, session=_FakeSession({url: _FakeResponse(url=url)}))
    assert verdict["kind"] == "page"
    assert verdict["url"] == url


def test_verify_link_classifies_pdf():
    url = "https://example.org/doc.pdf"
    resp = _FakeResponse(url=url, content_type="application/pdf")
    verdict = linkcheck.verify_link(url, session=_FakeSession({url: resp}))
    assert verdict["kind"] == "pdf"
    assert verdict["url"] == url


def test_verify_link_detects_login_redirect():
    url = "https://example.org/tender/9"
    redirected = "https://example.org/Account/Login?ReturnUrl=%2Ftender%2F9"
    resp = _FakeResponse(url=redirected)
    verdict = linkcheck.verify_link(url, session=_FakeSession({url: resp}))
    assert verdict["kind"] == "login"
    assert verdict["url"] is None


def test_verify_link_detects_login_wall_body():
    url = "https://example.org/tender/9"
    body = b"<html>Only members can view tenders. Please sign in below.</html>"
    resp = _FakeResponse(url=url, body=body)
    verdict = linkcheck.verify_link(url, session=_FakeSession({url: resp}))
    assert verdict["kind"] == "login"


def test_verify_link_marks_dead_and_known_login_hosts():
    dead = "https://example.org/gone"
    v = linkcheck.verify_link(dead, session=_FakeSession({dead: _FakeResponse(status=404, url=dead)}))
    assert v["kind"] == "dead"

    walled = "https://www.security.co.za/Tender/ViewTender?tenderId=81616"
    v2 = linkcheck.verify_link(walled, session=_FakeSession({}))
    assert v2["kind"] == "login"
    assert v2["url"] is None


def test_verify_link_handles_unreachable():
    url = "https://example.org/x"
    v = linkcheck.verify_link(url, session=_FakeSession({url: linkcheck.requests.ConnectionError("boom")}))
    assert v["kind"] == "dead"


def test_apply_verdicts_keeps_working_and_drops_dead():
    verdicts = {
        "https://ok/1": {"url": "https://ok/1", "final_url": "https://ok/1", "kind": "page"},
        "https://dead/2": {"url": None, "final_url": "https://dead/2", "kind": "dead"},
        "https://login/3": {"url": None, "final_url": "https://login/3", "kind": "login"},
    }
    items = [
        {"title": "keep", "url": "https://ok/1"},
        {"title": "dead", "url": "https://dead/2"},
        {"title": "login", "url": "https://login/3"},
    ]
    kept = linkcheck.apply_verdicts(items, verdicts)
    assert [k["title"] for k in kept] == ["keep"]
    assert kept[0]["link_kind"] == "page"


def test_verify_links_dedupes_and_fills_missing(monkeypatch):
    monkeypatch.setattr(
        linkcheck,
        "verify_link",
        lambda u, timeout=None, session=None: {
            "url": u, "final_url": u, "kind": "page", "status": 200,
            "content_type": "text/html", "reason": "ok",
        },
    )
    out = linkcheck.verify_links(["https://a/1", "https://a/1", "https://a/2"])
    assert set(out) == {"https://a/1", "https://a/2"}
    assert out["https://a/1"]["kind"] == "page"


# ---------------- capability profile ----------------

def _write_doc(tmp_path, name, text):
    p = tmp_path / name
    p.write_text(text, encoding="utf-8")
    return str(p)


def test_capability_profile_reads_uploaded_documents(db, tmp_path, monkeypatch):
    from database import LibraryDocument

    alice = make_user(db, "clean@example.com", company_name="Sparkle Cleaning")
    company = make_company(db, "Sparkle Cleaning", alice)

    doc = LibraryDocument(
        name="Company Profile",
        category="Company Profile",
        description="What we do",
        filename="profile.txt",
        file_path="profile.txt",
        file_type="text/plain",
        created_by=alice.id,
    )
    db.add(doc)
    db.commit()

    # Point the reader at our temp dir.
    upload_dir = str(tmp_path)
    monkeypatch.setenv("UPLOAD_DIR", upload_dir)
    _write_doc(tmp_path, "profile.txt",
               "Sparkle Cleaning provides office cleaning, deep cleaning and "
               "facility management services across Gauteng for commercial offices.")

    profile = ai_agent._capability_profile(db, alice, ai_agent.resolve_scope(db, alice))

    assert "Sparkle Cleaning" in profile
    assert "office cleaning" in profile
    assert "facility management" in profile
    assert "Company Profile" in profile
    assert company is not None


def test_capability_profile_is_scoped_and_safe_when_no_docs(db):
    alice = make_user(db, "a@example.com", company_name="Acme")
    make_company(db, "Acme", alice)
    bob = make_user(db, "b@example.com", company_name="Globex")
    make_company(db, "Globex", bob)

    pa = ai_agent._capability_profile(db, alice, ai_agent.resolve_scope(db, alice))
    pb = ai_agent._capability_profile(db, bob, ai_agent.resolve_scope(db, bob))
    assert "Acme" in pa and "Acme" not in pb
    assert "Globex" in pb and "Globex" not in pa


# ---------------- tenant-specific search ----------------

def test_capability_terms_extract_service_phrases():
    cap = (
        "Company: Sparkle Cleaning\n"
        "What this organisation can do: office cleaning, deep cleaning, "
        "office cleaning, deep cleaning, window cleaning, office cleaning."
    )
    terms = ai_module._capability_terms(cap)
    assert "office cleaning" in terms
    assert "deep cleaning" in terms


def test_discover_tenders_builds_query_from_capability(monkeypatch):
    captured = {}

    def fake_search(query, num=10, timeout=60):
        captured["query"] = query
        return []

    monkeypatch.setattr(ai_module, "_gemini_web_search", fake_search)
    monkeypatch.setattr(ai_module, "_gemini_chat", lambda *a, **k: "[]")

    ai_module.discover_tenders(
        "cleaning", "office", "South Africa", num_results=5,
        skip_scrapers=True, search_timeout=5,
        capability="Company: Sparkle Cleaning. office cleaning, deep cleaning, office cleaning",
    )
    assert "office cleaning" in captured["query"]
    assert "South Africa" in captured["query"]


def test_discover_tenders_verified_drops_dead_links(monkeypatch):
    monkeypatch.setattr(
        ai_module,
        "discover_tenders",
        lambda *a, **k: {
            "results": [
                {"title": "Live tender", "url": "https://good/1", "relevance": "high"},
                {"title": "Dead tender", "url": "https://bad/2", "relevance": "high"},
                {"title": "No link", "url": None, "relevance": "medium"},
            ],
            "sources": [], "errors": [], "raw_count": 3,
            "scraped_count": 0, "web_search_count": 3, "query": "q",
        },
    )
    monkeypatch.setattr(
        linkcheck,
        "verify_links",
        lambda urls, **k: {
            u: ({"url": u, "final_url": u, "kind": "page", "status": 200,
                 "content_type": "text/html", "reason": "ok"}
                if "good" in u else
                {"url": None, "final_url": u, "kind": "dead", "status": 404,
                 "content_type": "", "reason": "http 404"})
            for u in urls
        },
    )
    out = ai_module.discover_tenders_verified("cleaning", num_results=10)
    titles = [r["title"] for r in out["results"]]
    assert "Live tender" in titles
    assert "Dead tender" not in titles
    assert "No link" in titles
    assert out["links_dropped"] == 1