"""build_briefing: facts, cached narrative, template fallback, isolation."""
from datetime import date, timedelta

import ai_agent
from tests.conftest import make_company, make_tender, make_user


def _profile(db, user, name):
    import database as dbmod
    p = dbmod.CompanyProfile(user_id=user.id, company_name=name)
    db.add(p)
    db.commit()
    return p


def _checklist(db, tender, name, status="Complete"):
    import database as dbmod
    item = dbmod.ChecklistItem(tender_id=tender.id, name=name, status=status)
    db.add(item)
    db.commit()
    return item


def _library(db, user, name, expires_in_days):
    import database as dbmod
    d = dbmod.LibraryDocument(
        name=name, category="B-BBEE", created_by=user.id,
        filename=f"{name}.pdf", file_path="x.pdf",
        expiry_date=date.today() + timedelta(days=expires_in_days),
    )
    db.add(d)
    db.commit()
    return d


def _opp(db, scope, **kw):
    import database as dbmod
    o = dbmod.AIOpportunity(
        company_id=scope["company_id"],
        user_id=None if scope["company_id"] else scope["member_ids"][0],
        **kw,
    )
    db.add(o)
    db.commit()
    db.refresh(o)
    return o


def test_briefing_facts_and_shape(db, monkeypatch):
    alice = make_user(db, "alice@example.com", company_name="Acme")
    make_company(db, "Acme", alice)
    _profile(db, alice, "Acme")
    scope = ai_agent.resolve_scope(db, alice)

    urgent = make_tender(db, alice, "A-1", "Urgent", closing_date=date.today() + timedelta(days=4))
    later = make_tender(db, alice, "A-2", "Later", closing_date=date.today() + timedelta(days=40))
    make_tender(db, alice, "A-3", "Past", closing_date=date.today() - timedelta(days=1))
    _checklist(db, urgent, "Done item", status="Complete")
    _checklist(db, urgent, "Missing item", status="Outstanding")
    _library(db, alice, "BEE cert", 2)  # expires before A-1 closes
    _library(db, alice, "Tax clearance", 60)  # expires after

    monkeypatch.setattr(ai_agent.ai_module, "generate_briefing", lambda *a, **k: "narrative text")

    brief = ai_agent.build_briefing(db, alice)

    assert brief["scope"]["company_name"] == "Acme"
    assert brief["narrative"] == "narrative text"
    assert [c["reference_number"] for c in brief["closing_soon"]] == ["A-1", "A-2"]
    urgent_fact = brief["closing_soon"][0]
    assert urgent_fact["days_left"] == 4
    assert urgent_fact["readiness_pct"] == 50
    assert urgent_fact["expiring_docs"] == ["BEE cert"]

    # Empty opportunities, no research yet
    assert brief["opportunities"] == {"tenders": [], "funding": []}
    assert brief["last_research_at"] is None
    assert brief["memory"]["mission"] is None


def test_narrative_is_cached_then_regenerates_after_ttl(db, monkeypatch):
    alice = make_user(db, "alice@example.com", company_name="Acme")
    make_company(db, "Acme", alice)
    calls = []

    def fake_gen(company, facts, memory):
        calls.append(company)
        return f"narrative {len(calls)}"

    monkeypatch.setattr(ai_agent.ai_module, "generate_briefing", fake_gen)

    ai_agent.build_briefing(db, alice)
    ai_agent.build_briefing(db, alice)  # cached — no second call
    assert len(calls) == 1

    # Force the cache stale
    scope = ai_agent.resolve_scope(db, alice)
    mem = ai_agent.get_or_create_memory(db, scope)
    from datetime import datetime, timedelta as td
    mem.last_briefing_at = datetime.utcnow() - td(hours=13)
    db.commit()

    ai_agent.build_briefing(db, alice)
    assert len(calls) == 2


def test_narrative_falls_back_to_template_when_gemini_fails(db, monkeypatch):
    alice = make_user(db, "alice@example.com", company_name="Acme")
    make_company(db, "Acme", alice)
    urgent = make_tender(db, alice, "A-1", "Urgent tender", closing_date=date.today() + timedelta(days=3))

    def boom(*a, **k):
        raise RuntimeError("quota")

    monkeypatch.setattr(ai_agent.ai_module, "generate_briefing", boom)
    brief = ai_agent.build_briefing(db, alice)
    assert "Acme" in brief["narrative"]
    assert "A-1" in brief["narrative"]
    # And it's cached too (not re-attempted on the next call)
    ai_agent.build_briefing(db, alice)
    assert "A-1" in brief["narrative"]


def test_briefing_opportunities_split_and_sorted(db, monkeypatch):
    alice = make_user(db, "alice@example.com", company_name="Acme")
    make_company(db, "Acme", alice)
    scope = ai_agent.resolve_scope(db, alice)
    monkeypatch.setattr(ai_agent.ai_module, "generate_briefing", lambda *a, **k: "n")

    _opp(db, scope, type="tender", title="Low match", match_score=30, status="new")
    _opp(db, scope, type="tender", title="High match", match_score=90, status="new")
    _opp(db, scope, type="funding", title="SEFA", match_score=70, status="seen")
    _opp(db, scope, type="finance", title="PO funding", match_score=None, status="new")
    _opp(db, scope, type="tender", title="Dismissed", match_score=99, status="dismissed")
    _opp(db, scope, type="funding", title="Closed", match_score=99, status="new",
         closing_date=date.today() - timedelta(days=1))

    brief = ai_agent.build_briefing(db, alice)
    assert [o["title"] for o in brief["opportunities"]["tenders"]] == ["High match", "Low match"]
    funding_titles = [o["title"] for o in brief["opportunities"]["funding"]]
    assert funding_titles == ["SEFA", "PO funding"]


def test_briefing_is_isolated(db, monkeypatch):
    alice = make_user(db, "alice@example.com", company_name="Acme")
    make_company(db, "Acme", alice)
    bob = make_user(db, "bob@example.com", company_name="Globex")
    make_company(db, "Globex", bob)
    make_tender(db, alice, "A-1", "Alice urgent", closing_date=date.today() + timedelta(days=2))
    monkeypatch.setattr(ai_agent.ai_module, "generate_briefing", lambda *a, **k: "n")

    brief = ai_agent.build_briefing(db, bob)
    assert brief["closing_soon"] == []
    assert "Alice" not in brief["narrative"] or brief["narrative"] == "n"
