"""Gemini quota handling: circuit breaker, fast-fail, and funding cache.

The free tier allows only a handful of requests per model per day, so the agent
must stop calling rather than burn time on requests that cannot succeed.
"""
import time

import pytest

import ai_agent
import ai_module
import linkcheck
import scraper
from tests.conftest import make_company, make_tender, make_user


def _reset_breaker():
    ai_module._QUOTA_COOLDOWN_UNTIL = 0.0


def test_parse_retry_seconds_reads_gemini_message():
    body = "You exceeded your current quota... Please retry in 10h34m2.9s."
    assert ai_module._parse_retry_seconds(body) == pytest.approx(
        10 * 3600 + 34 * 60 + 2.9, abs=0.5
    )
    assert ai_module._parse_retry_seconds("no retry info here") is None


def test_gemini_post_trips_breaker_on_quota_429(monkeypatch):
    _reset_breaker()

    class _Resp:
        status_code = 429
        text = "Quota exceeded for metric: generate_content_free_tier_requests. Please retry in 1h0m0s."

    calls = []

    def fake_post(url, headers=None, json=None, timeout=None):
        calls.append(url)
        return _Resp()

    monkeypatch.setattr(ai_module.httpx, "post", fake_post)
    monkeypatch.setattr(ai_module, "GEMINI_API_KEY", "test-key")

    with pytest.raises(RuntimeError) as exc:
        ai_module._gemini_post({}, 1.0)
    assert "quota" in str(exc.value).lower()

    # Crucially: a quota 429 must NOT be retried (that would triple the calls).
    assert len(calls) == 1
    assert ai_module.gemini_available() is False

    # Further calls fail fast without touching the network.
    calls.clear()
    with pytest.raises(RuntimeError):
        ai_module._gemini_post({}, 1.0)
    assert calls == []

    _reset_breaker()
    assert ai_module.gemini_available() is True


def test_gemini_post_falls_back_to_another_model_on_429(monkeypatch):
    """Each model has its own quota, so a 429 should move to the next model."""
    _reset_breaker()

    class _Resp:
        def __init__(self, code, text="quota"):
            self.status_code = code
            self.text = text

        def json(self):
            return {"candidates": [{"content": {"parts": [{"text": "ok"}]}}]}

    tried = []

    def fake_post(url, headers=None, json=None, timeout=None):
        tried.append(url)
        # The first model is out of quota; the second answers.
        if "first-model" in url:
            return _Resp(429, "Please retry in 1h0m0s.")
        return _Resp(200)

    monkeypatch.setattr(ai_module.httpx, "post", fake_post)
    monkeypatch.setattr(ai_module, "GEMINI_API_KEY", "test-key")
    monkeypatch.setattr(
        ai_module, "GEMINI_MODELS", ["first-model", "second-model"]
    )

    data = ai_module._gemini_post({}, 1.0)

    assert "candidates" in data
    assert len(tried) == 2, "should have tried the fallback model"
    # A single model being out of quota must NOT pause the whole service.
    assert ai_module.gemini_available() is True


def test_gemini_post_pauses_only_when_every_model_is_out(monkeypatch):
    _reset_breaker()

    class _Resp:
        status_code = 429
        text = "Please retry in 2h0m0s."

        def json(self):
            return {}

    monkeypatch.setattr(ai_module.httpx, "post", lambda *a, **k: _Resp())
    monkeypatch.setattr(ai_module, "GEMINI_API_KEY", "test-key")
    monkeypatch.setattr(ai_module, "GEMINI_MODELS", ["m1", "m2", "m3"])

    with pytest.raises(RuntimeError) as exc:
        ai_module._gemini_post({}, 1.0)
    assert "quota" in str(exc.value).lower()
    assert ai_module.gemini_available() is False
    _reset_breaker()


def test_search_does_not_pause_the_whole_service(monkeypatch):
    """Grounding quota is separate; losing search must not disable chat/reports."""
    _reset_breaker()

    class _Resp:
        status_code = 429
        text = "Please retry in 3h0m0s."

    monkeypatch.setattr(ai_module.httpx, "post", lambda *a, **k: _Resp())
    monkeypatch.setattr(ai_module, "GEMINI_API_KEY", "test-key")
    monkeypatch.setattr(ai_module, "GEMINI_MODELS", ["m1", "m2"])

    assert ai_module._gemini_web_search("cleaning tenders", timeout=1) == []
    assert ai_module.gemini_available() is True, "search failure must not pause AI"


def test_model_chain_prefers_configured_order():
    # The primary model leads, and the chain has no duplicates.
    assert ai_module.GEMINI_MODELS[0] == ai_module.GEMINI_MODEL
    assert len(ai_module.GEMINI_MODELS) == len(set(ai_module.GEMINI_MODELS))


def test_gemini_post_still_retries_server_errors(monkeypatch):
    _reset_breaker()

    class _Resp:
        def __init__(self, code):
            self.status_code = code
            self.text = "boom"

        def json(self):
            return {"candidates": [{"content": {"parts": [{"text": "ok"}]}}]}

    codes = [_Resp(503), _Resp(503), _Resp(200)]
    calls = []

    def fake_post(url, headers=None, json=None, timeout=None):
        calls.append(url)
        return codes[min(len(calls) - 1, len(codes) - 1)]

    monkeypatch.setattr(ai_module.httpx, "post", fake_post)
    monkeypatch.setattr(ai_module, "GEMINI_API_KEY", "test-key")
    monkeypatch.setattr(ai_module, "GEMINI_RETRY_DELAY", 0)

    data = ai_module._gemini_post({}, 1.0)
    assert "candidates" in data
    assert len(calls) == 3
    assert ai_module.gemini_available() is True


def test_funding_discovery_is_cached_for_24_hours(db, monkeypatch):
    """Funding refreshes are expensive, so a scope that already has funding
    within a day does not pay for another discovery pass."""
    import database as dbmod

    alice = make_user(db, "f@example.com", company_name="Acme")
    make_company(db, "Acme", alice)
    make_tender(db, alice, ref="H-1", title="History", category="Cleaning Services")
    scope = ai_agent.resolve_scope(db, alice)

    calls = []

    monkeypatch.setattr(
        ai_agent.ai_module, "discover_funding",
        lambda *a, **k: (calls.append(1), [{"title": "Grant", "provider": "SEFA",
                                            "type": "funding", "url": "https://sefa.org.za",
                                            "source_site": "sefa.org.za"}])[1],
    )
    monkeypatch.setattr(scraper, "scrape_security_co_za", lambda *a, **k: [])
    monkeypatch.setattr(scraper, "scrape_tenderflow_co_za", lambda *a, **k: [])
    monkeypatch.setattr(scraper, "scrape_etenders_opportunities", lambda *a, **k: [])
    monkeypatch.setattr(ai_agent.ai_module, "discover_tenders", lambda *a, **k: {"results": []})
    monkeypatch.setattr(ai_agent.ai_module, "score_opportunities", lambda *a, **k: [])
    monkeypatch.setattr(ai_agent.ai_module, "generate_briefing", lambda *a, **k: "n")
    monkeypatch.setattr(ai_module, "gemini_available", lambda: True)
    import linkcheck

    monkeypatch.setattr(
        linkcheck, "verify_links",
        lambda urls, **k: {u: {"url": u, "final_url": u, "kind": "page"} for u in urls},
    )

    # First run discovers funding.
    ai_agent.run_research(db, alice)
    assert len(calls) == 1

    # Second run reuses it.
    ai_agent.run_research(db, alice)
    assert len(calls) == 1

    # Once every cached funding pass is older than a day, funding is refreshed.
    for run in db.query(dbmod.AIResearchRun).all():
        run.created_at = run.created_at.replace(year=run.created_at.year - 1)
    db.commit()
    ai_agent.run_research(db, alice)
    assert len(calls) == 2
    assert scope["company_id"] is not None


def test_research_still_returns_tenders_without_ai(db, monkeypatch):
    """With the AI quota spent, research must still store real tenders."""
    from tests.conftest import make_tender

    alice = make_user(db, "q@example.com", company_name="Acme")
    make_company(db, "Acme", alice)
    make_tender(db, alice, ref="T-1", title="Cleaning", category="Cleaning Services")

    monkeypatch.setattr(
        scraper, "scrape_etenders_opportunities",
        lambda *a, **k: [{"title": "Office cleaning", "client": "Municipality",
                          "category": "Cleaning Services", "location": "Gauteng",
                          "closing_date": "2030-01-01", "description": "cleaning",
                          "source_site": "etenders.gov.za",
                          "url": "https://www.etenders.gov.za/x.pdf",
                          "reference_number": "E-1", "estimated_value": None,
                          "relevance": "high"}],
    )
    monkeypatch.setattr(scraper, "scrape_security_co_za", lambda *a, **k: [])
    monkeypatch.setattr(scraper, "scrape_tenderflow_co_za", lambda *a, **k: [])
    monkeypatch.setattr(ai_module, "gemini_available", lambda: False)
    import linkcheck

    monkeypatch.setattr(
        linkcheck, "verify_links",
        lambda urls, **k: {u: {"url": u, "final_url": u, "kind": "page"} for u in urls},
    )

    called = []
    monkeypatch.setattr(
        ai_agent.ai_module, "discover_tenders",
        lambda *a, **k: called.append(1) or {"results": []},
    )
    monkeypatch.setattr(
        ai_agent.ai_module, "score_opportunities",
        lambda *a, **k: called.append(1) or [],
    )

    result = ai_agent.run_research(db, alice)

    assert result["status"] == "complete"
    assert result["tenders_found"] == 1
    # No AI calls were attempted while the quota is spent.
    assert called == []
    assert time.monotonic() > 0
