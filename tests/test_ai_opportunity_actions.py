"""Endpoints: research, import-to-tender, dismiss — scoped and 404-safe."""
import ai_agent
import main as mainmod
from tests.conftest import make_company, make_user


def _opp(db, scope, **kw):
    import database as dbmod
    o = dbmod.AIOpportunity(
        company_id=scope["company_id"],
        user_id=None if scope["company_id"] else scope["member_ids"][0],
        status="new",
        **kw,
    )
    db.add(o)
    db.commit()
    db.refresh(o)
    return o


def _setup_company(db, email):
    user = make_user(db, email, company_name="Acme")
    make_company(db, "Acme", user)
    return user, ai_agent.resolve_scope(db, user)


def test_research_endpoint_returns_run_summary(db, client, act_as, monkeypatch):
    user, _ = _setup_company(db, "alice@example.com")
    monkeypatch.setattr(
        ai_agent, "run_research",
        lambda d, u: {"run_id": 1, "status": "complete", "tenders_found": 3,
                      "funding_found": 2, "finance_found": 1, "new_count": 5, "updated_count": 1},
    )
    act_as(user)
    r = client.post("/api/ai/research")
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["status"] == "complete"
    assert body["new_count"] == 5


def test_import_creates_interested_tender_with_checklist(db, client, act_as):
    user, scope = _setup_company(db, "alice@example.com")
    opp = _opp(
        db, scope, type="tender", title="CCTV install", provider="Public Works",
        category="Security", location="Cape Town", reference_number="PW-9",
        estimated_value="R1.2m", description="Install CCTV",
    )
    act_as(user)
    r = client.post(f"/api/ai/opportunities/{opp.id}/import")
    assert r.status_code == 200, r.text
    body = r.json()
    tender_id = body["tender_id"]

    import database as dbmod
    tender = db.query(dbmod.Tender).filter(dbmod.Tender.id == tender_id).one()
    assert tender.title == "CCTV install"
    assert tender.client_company == "Public Works"
    assert tender.status == "Interested"
    assert tender.created_by == user.id
    assert len(tender.checklist_items) > 0

    db.refresh(opp)
    assert opp.status == "imported"
    assert opp.imported_tender_id == tender_id


def test_import_is_idempotent(db, client, act_as):
    user, scope = _setup_company(db, "alice@example.com")
    opp = _opp(db, scope, type="tender", title="Guard services")
    act_as(user)
    first = client.post(f"/api/ai/opportunities/{opp.id}/import").json()["tender_id"]
    second = client.post(f"/api/ai/opportunities/{opp.id}/import").json()["tender_id"]
    assert first == second

    import database as dbmod
    assert db.query(dbmod.Tender).count() == 1


def test_dismiss_hides_opportunity(db, client, act_as):
    user, scope = _setup_company(db, "alice@example.com")
    opp = _opp(db, scope, type="funding", title="SEFA loan")
    act_as(user)
    r = client.post(f"/api/ai/opportunities/{opp.id}/dismiss")
    assert r.status_code == 200, r.text
    db.refresh(opp)
    assert opp.status == "dismissed"
    assert ai_agent.list_opportunities(db, scope) == []
    assert ai_agent.list_opportunities(db, scope, statuses=("dismissed",))[0].id == opp.id


def test_cross_scope_import_and_dismiss_are_404(db, client, act_as):
    alice, alice_scope = _setup_company(db, "alice@example.com")
    opp = _opp(db, alice_scope, type="tender", title="Alice only")

    bob = make_user(db, "bob@example.com", company_name="Globex")
    make_company(db, "Globex", bob)
    act_as(bob)

    assert client.post(f"/api/ai/opportunities/{opp.id}/import").status_code == 404
    assert client.post(f"/api/ai/opportunities/{opp.id}/dismiss").status_code == 404
    assert client.post("/api/ai/opportunities/9999/import").status_code == 404
