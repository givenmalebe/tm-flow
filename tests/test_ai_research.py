"""run_research: scrapers + funding + scoring + dedup, all network mocked."""
from datetime import date, timedelta

import ai_agent
import scraper
from tests.conftest import make_company, make_user


T1 = {
    "title": "CCTV cameras", "client": "Public Works", "category": "Security",
    "location": "Cape Town", "closing_date": (date.today() + timedelta(days=10)).isoformat(),
    "description": "Supply and install CCTV", "source_site": "security.co.za",
    "url": "https://t.co.za/1", "reference_number": "S-1", "estimated_value": None,
    "relevance": "high",
}
T2 = {
    "title": "Guarding services", "client": "Municipality", "category": "Security",
    "location": "Durban", "closing_date": None,
    "description": "Guards", "source_site": "etenders.gov.za",
    "url": "https://e.gov/2", "reference_number": "E-2", "estimated_value": "R1.2m",
    "relevance": "medium",
}
F1 = {
    "title": "SEFA SMME Loan", "provider": "SEFA", "type": "funding",
    "category": "Loan", "location": "South Africa", "closing_date": None,
    "description": "Loans", "url": "https://sefa.org.za", "source_site": "sefa.org.za",
    "estimated_value": "R50k-R5m",
}
F2 = {
    "title": "PO Bridging Finance", "provider": "Fund Co", "type": "finance",
    "category": "Bridging finance", "location": "South Africa", "closing_date": None,
    "description": "PO funding", "url": "https://fund.co.za", "source_site": "fund.co.za",
    "estimated_value": None,
}


def _mock_sources(monkeypatch, tenders, funding, scores):
    monkeypatch.setattr(scraper, "scrape_security_co_za", lambda *a, **k: tenders)
    monkeypatch.setattr(scraper, "scrape_tenderflow_co_za", lambda *a, **k: [])
    monkeypatch.setattr(scraper, "scrape_etenders_opportunities", lambda *a, **k: [])
    monkeypatch.setattr(ai_agent.ai_module, "discover_tenders", lambda *a, **k: {"results": []})
    monkeypatch.setattr(ai_agent.ai_module, "discover_funding", lambda *a, **k: funding)
    monkeypatch.setattr(ai_agent.ai_module, "score_opportunities", lambda cs, opps: scores)
    monkeypatch.setattr(ai_agent.ai_module, "generate_briefing", lambda *a, **k: "fresh narrative")


def test_research_stores_scored_opportunities(db, monkeypatch):
    alice = make_user(db, "alice@example.com", company_name="Acme")
    make_company(db, "Acme", alice)
    _mock_sources(
        monkeypatch,
        tenders=[T1, T2],
        funding=[F1, F2],
        scores=[
            {"index": 0, "score": 82, "reason": "You can apply because PSIRA registered"},
            {"index": 2, "score": 74, "reason": "You can apply because Level 1 BEE"},
        ],
    )

    result = ai_agent.run_research(db, alice)

    assert result["status"] == "complete"
    assert result["tenders_found"] == 2
    assert result["funding_found"] == 1
    assert result["finance_found"] == 1
    assert result["new_count"] == 4

    import database as dbmod
    run = db.query(dbmod.AIResearchRun).one()
    assert run.status == "complete"
    assert run.finished_at is not None

    opps = db.query(dbmod.AIOpportunity).order_by(dbmod.AIOpportunity.id).all()
    assert len(opps) == 4
    by_title = {o.title: o for o in opps}
    assert by_title["CCTV cameras"].match_score == 82
    assert by_title["CCTV cameras"].closing_date == date.today() + timedelta(days=10)
    assert by_title["SEFA SMME Loan"].match_score == 74
    assert by_title["PO Bridging Finance"].match_score is None
    assert all(o.status == "new" for o in opps)
    assert all(o.company_id == run.company_id for o in opps)

    # The narrative was regenerated with the fresh findings
    mem = ai_agent.get_or_create_memory(db, ai_agent.resolve_scope(db, alice))
    assert mem.last_briefing_text == "fresh narrative"


def test_research_dedups_and_preserves_statuses(db, monkeypatch):
    alice = make_user(db, "alice@example.com", company_name="Acme")
    make_company(db, "Acme", alice)
    _mock_sources(monkeypatch, tenders=[T1], funding=[], scores=[])

    ai_agent.run_research(db, alice)

    import database as dbmod
    imported = (
        db.query(dbmod.AIOpportunity)
        .filter(dbmod.AIOpportunity.url == "https://t.co.za/1")
        .one()
    )
    imported.status = "imported"
    db.commit()

    # Re-research: T1 refreshed (not duplicated, status kept), SEFA is new
    _mock_sources(monkeypatch, tenders=[T1], funding=[F1], scores=[])
    result = ai_agent.run_research(db, alice)
    assert result["new_count"] == 1  # only SEFA was new
    assert result["updated_count"] == 1

    assert db.query(dbmod.AIOpportunity).count() == 2
    refreshed = (
        db.query(dbmod.AIOpportunity)
        .filter(dbmod.AIOpportunity.url == "https://t.co.za/1")
        .one()
    )
    assert refreshed.status == "imported"
    assert refreshed.run_id is not None


def test_research_with_empty_sources_completes_cleanly(db, monkeypatch):
    alice = make_user(db, "alice@example.com", company_name="Acme")
    make_company(db, "Acme", alice)
    _mock_sources(monkeypatch, tenders=[], funding=[], scores=[])

    result = ai_agent.run_research(db, alice)
    assert result["status"] == "complete"
    assert result["tenders_found"] == 0
    assert result["new_count"] == 0

    brief = ai_agent.build_briefing(db, alice)
    assert brief["last_research_at"] is not None


def test_research_is_isolated_per_scope(db, monkeypatch):
    alice = make_user(db, "alice@example.com", company_name="Acme")
    make_company(db, "Acme", alice)
    bob = make_user(db, "bob@example.com", company_name="Globex")
    make_company(db, "Globex", bob)
    _mock_sources(monkeypatch, tenders=[T1], funding=[F1], scores=[])

    ai_agent.run_research(db, alice)

    scope_b = ai_agent.resolve_scope(db, bob)
    assert ai_agent.list_opportunities(db, scope_b) == []
    assert ai_agent.list_opportunities(db, ai_agent.resolve_scope(db, alice))
