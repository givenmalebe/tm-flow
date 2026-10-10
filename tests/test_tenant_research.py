"""Link verification + tenant capability profile + tenant-specific search.

Network is fully mocked: the verifier is exercised through a fake session and
the capability reader through real files written to a temp dir.
"""
import os

import ai_agent
import ai_module
import linkcheck
import scraper
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

# ---------------- knowledge base drives matching ----------------

def test_service_terms_come_from_a_single_uploaded_document():
    """One uploaded company profile is enough to learn the services."""
    kb = (
        "Company: Sparkle Cleaning\n"
        "What this organisation can do (from its own uploaded documents):\n"
        "[Company Profile - Company Profile] Sparkle Cleaning provides office "
        "cleaning, deep cleaning, window cleaning and facade cleaning services "
        "across Gauteng."
    )
    terms = ai_module._capability_terms(kb)
    assert "office cleaning" in terms
    assert "deep cleaning" in terms
    # The company's own name is not one of its services.
    assert "sparkle cleaning" not in terms


def test_service_terms_ignore_filler_words():
    kb = (
        "Company: Ironclad Security\n"
        "Ironclad Security provides security guarding services, armed guarding "
        "and access control for malls and offices."
    )
    terms = ai_module._capability_terms(kb)
    assert "security guarding" in terms
    assert "armed guarding" in terms
    assert all("provides" not in t for t in terms)
    assert all("uploaded" not in t for t in terms)


def test_knowledge_state_empty_without_documents(db):
    alice = make_user(db, "kb@example.com", company_name="Empty Co")
    make_company(db, "Empty Co", alice)
    scope = ai_agent.resolve_scope(db, alice)
    state = ai_agent._knowledge_state(db, scope, "", [], False)
    assert state["needs_documents"] is True
    assert state["ready"] is False
    assert state["documents"] == 0


def test_knowledge_state_ready_with_services(db):
    alice = make_user(db, "kb2@example.com", company_name="Sparkle")
    make_company(db, "Sparkle", alice)
    scope = ai_agent.resolve_scope(db, alice)
    state = ai_agent._knowledge_state(db, scope, "Company: Sparkle", ["office cleaning"], False)
    assert state["needs_documents"] is False
    assert state["services"] == ["office cleaning"]


def test_research_asks_for_documents_when_knowledge_base_is_empty(db, monkeypatch):
    """With no knowledge base the AI must not guess and flood the tenant with
    unrelated tenders - it asks for documents instead."""
    alice = make_user(db, "nokb@example.com", company_name="New Co")
    make_company(db, "New Co", alice)

    scraped = []
    monkeypatch.setattr(
        scraper, "scrape_etenders_opportunities", lambda *a, **k: scraped.append(1) or []
    )
    monkeypatch.setattr(scraper, "scrape_security_co_za", lambda *a, **k: [])
    monkeypatch.setattr(scraper, "scrape_tenderflow_co_za", lambda *a, **k: [])

    result = ai_agent.run_research(db, alice)

    assert result["status"] == "needs_documents"
    assert result["needs_documents"] is True
    assert result["tenders_found"] == 0
    # Nothing was scraped, because we have no way to know what to look for.
    assert scraped == []
    assert ai_agent.list_opportunities(db, ai_agent.resolve_scope(db, alice)) == []
    # Asking again immediately adds nothing, so it is not treated as stale.
    assert ai_agent._research_staleness(db, ai_agent.resolve_scope(db, alice)) is False


def test_briefing_exposes_knowledge_state_and_asks_for_documents(db, monkeypatch):
    alice = make_user(db, "kb3@example.com", company_name="New Co")
    make_company(db, "New Co", alice)
    monkeypatch.setattr(ai_module, "generate_briefing", lambda *a, **k: "narrative")

    brief = ai_agent.build_briefing(db, alice, force_refresh=True)
    assert brief["knowledge"]["needs_documents"] is True


def test_briefing_narrative_asks_for_documents_when_empty(db, monkeypatch):
    """The fallback narrative must explain the knowledge base, not fake results."""
    alice = make_user(db, "kb4@example.com", company_name="New Co")
    make_company(db, "New Co", alice)

    def _no_quota(*a, **k):
        raise RuntimeError("quota")

    monkeypatch.setattr(ai_module, "generate_briefing", _no_quota)

    brief = ai_agent.build_briefing(db, alice, force_refresh=True)
    text = brief["narrative"]
    assert "knowledge base" in text.lower()
    assert "upload" in text.lower()
