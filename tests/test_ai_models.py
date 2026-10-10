"""The four AI-agent tables: chat, memory, research runs, opportunities."""
from tests.conftest import make_company, make_user


def _ai_models():
    import database as dbmod
    return (dbmod.AIChatMessage, dbmod.AICompanyMemory, dbmod.AIResearchRun, dbmod.AIOpportunity)


def test_ai_models_exist_and_persist(db):
    AIChatMessage, AICompanyMemory, AIResearchRun, AIOpportunity = _ai_models()

    alice = make_user(db, "alice@example.com", company_name="Acme")
    company = make_company(db, "Acme", alice)

    msg = AIChatMessage(company_id=company.id, user_id=alice.id, role="user", content="hi")
    db.add(msg)

    mem = AICompanyMemory(company_id=company.id, mission="Win tenders", goals=["Grow"], preferences=None)
    db.add(mem)

    run = AIResearchRun(company_id=company.id, user_id=alice.id, status="running")
    db.add(run)
    db.flush()

    opp = AIOpportunity(
        company_id=company.id,
        run_id=run.id,
        type="funding",
        title="SEFA loan",
        provider="SEFA",
        status="new",
    )
    db.add(opp)
    db.commit()

    assert db.query(AIChatMessage).count() == 1
    assert db.query(AICompanyMemory).count() == 1
    assert db.query(AIResearchRun).count() == 1
    stored = db.query(AIOpportunity).first()
    assert stored.match_score is None
    assert stored.imported_tender_id is None
    assert stored.run.status == "running"


def test_ai_models_allow_solo_scope_rows(db):
    AIChatMessage, AICompanyMemory = _ai_models()[:2]
    bob = make_user(db, "bob@example.com")

    db.add(AIChatMessage(company_id=None, user_id=bob.id, role="assistant", content="hello"))
    db.add(AICompanyMemory(company_id=None, user_id=bob.id))
    db.commit()

    assert db.query(AIChatMessage).filter(AIChatMessage.company_id.is_(None)).count() == 1
    assert db.query(AICompanyMemory).filter(AICompanyMemory.company_id.is_(None)).count() == 1
