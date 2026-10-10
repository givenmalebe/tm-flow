"""Proactive research: per-company sweep + cron endpoint guard."""
import ai_agent
import database as dbmod
from tests.conftest import add_member, make_company, make_user


def test_cron_research_iterates_every_company_in_isolation(db, monkeypatch):
    alice = make_user(db, "alice@example.com", company_name="Acme")
    acme = make_company(db, "Acme", alice)
    bob = make_user(db, "bob@example.com", company_name="Globex")
    globex = make_company(db, "Globex", bob)

    researched = []

    def fake_run_research(session, user):
        researched.append(user.id)
        return {"run_id": user.id, "status": "complete"}

    monkeypatch.setattr(ai_agent, "run_research", fake_run_research)

    result = ai_agent.cron_research_all(db)

    assert result["companies"] == 2
    assert result["succeeded"] == 2
    assert set(researched) == {alice.id, bob.id}
    company_ids = {r["company_id"] for r in result["results"]}
    assert company_ids == {acme.id, globex.id}


def test_run_research_for_company_prefers_admin_and_handles_no_members(
    db, monkeypatch
):
    owner = make_user(db, "owner@example.com", company_name="Acme")
    company = make_company(db, "Acme", owner)  # owner is approved admin

    member = make_user(db, "member@example.com", company_name="Acme")
    add_member(db, company, member, role="member")

    used = {}

    def fake_run_research(session, user):
        used["id"] = user.id
        return {"status": "complete"}

    monkeypatch.setattr(ai_agent, "run_research", fake_run_research)

    ai_agent.run_research_for_company(db, company)
    assert used["id"] == owner.id

    # A company with no approved members is skipped, not crashed.
    empty = dbmod.BidderCompany(name="Empty Co", created_by=owner.id)
    db.add(empty)
    db.commit()
    skipped = ai_agent.run_research_for_company(db, empty)
    assert skipped["skipped"] == "no approved members"


def test_cron_endpoint_requires_authorization(client, monkeypatch):
    monkeypatch.delenv("CRON_SECRET", raising=False)

    called = {"n": 0}

    def fake_cron(session):
        called["n"] += 1
        return {"companies": 0, "succeeded": 0, "results": []}

    monkeypatch.setattr(ai_agent, "cron_research_all", fake_cron)

    # No scheduler header and no secret -> rejected.
    assert client.post("/api/ai/cron/research").status_code == 403
    assert called["n"] == 0

    # Cloud Scheduler's header authorizes the sweep.
    res = client.post(
        "/api/ai/cron/research", headers={"X-CloudScheduler": "true"}
    )
    assert res.status_code == 200
    assert called["n"] == 1


def test_cron_endpoint_accepts_bearer_secret(client, monkeypatch):
    monkeypatch.setenv("CRON_SECRET", "s3cret")

    def fake_cron(session):
        return {"companies": 0, "succeeded": 0, "results": []}

    monkeypatch.setattr(ai_agent, "cron_research_all", fake_cron)

    assert client.post("/api/ai/cron/research").status_code == 403
    assert (
        client.post(
            "/api/ai/cron/research",
            headers={"Authorization": "Bearer wrong"},
        ).status_code
        == 403
    )
    assert (
        client.post(
            "/api/ai/cron/research",
            headers={"Authorization": "Bearer s3cret"},
        ).status_code
        == 200
    )
