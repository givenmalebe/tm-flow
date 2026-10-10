"""Memory / chat / opportunity helpers: per-scope CRUD + cross-scope invisibility."""
from tests.conftest import add_member, make_company, make_user

import ai_agent


def _solo(db, email):
    return make_user(db, email)


def test_memory_is_one_row_per_scope(db):
    alice = make_user(db, "alice@example.com", company_name="Acme")
    company = make_company(db, "Acme", alice)
    scope = ai_agent.resolve_scope(db, alice)

    m1 = ai_agent.get_or_create_memory(db, scope)
    m1.mission = "Win tenders"
    db.commit()
    m2 = ai_agent.get_or_create_memory(db, scope)
    assert m1.id == m2.id

    import database as dbmod
    assert (
        db.query(dbmod.AICompanyMemory)
        .filter(dbmod.AICompanyMemory.company_id == company.id)
        .count()
        == 1
    )


def test_chat_messages_scoped_and_ordered(db):
    alice = make_user(db, "alice@example.com", company_name="Acme")
    make_company(db, "Acme", alice)
    bob = make_user(db, "bob@example.com")

    sa = ai_agent.resolve_scope(db, alice)
    sb = ai_agent.resolve_scope(db, bob)

    ai_agent.add_chat_message(db, sa, alice, "user", "alice q")
    ai_agent.add_chat_message(db, sa, alice, "assistant", "alice a", context_tenders=3)
    ai_agent.add_chat_message(db, sb, bob, "user", "bob q")

    assert [m.content for m in ai_agent.list_chat_messages(db, sa)] == ["alice q", "alice a"]
    assert [m.content for m in ai_agent.list_chat_messages(db, sb)] == ["bob q"]

    serialized = ai_agent.serialize_chat(db, ai_agent.list_chat_messages(db, sa))
    assert serialized[0]["user_name"] == "Test User"
    assert serialized[1]["user_name"] is None
    assert serialized[1]["context_tenders"] == 3

    assert ai_agent.clear_chat_messages(db, sa) == 2
    assert ai_agent.list_chat_messages(db, sb)[0].content == "bob q"


def test_company_members_share_one_chat_scope(db):
    alice = make_user(db, "alice@example.com", company_name="Acme")
    company = make_company(db, "Acme", alice)
    zanele = make_user(db, "zanele@example.com")
    add_member(db, company, zanele)

    sa = ai_agent.resolve_scope(db, alice)
    sz = ai_agent.resolve_scope(db, zanele)
    ai_agent.add_chat_message(db, sa, alice, "user", "hello team")

    # Zanele (same company) sees Alice's message; the chat is team-visible.
    assert [m.content for m in ai_agent.list_chat_messages(db, sz)] == ["hello team"]


def test_opportunities_scoped_and_404_semantics(db):
    alice = make_user(db, "alice@example.com", company_name="Acme")
    make_company(db, "Acme", alice)
    bob = make_user(db, "bob@example.com")

    sa = ai_agent.resolve_scope(db, alice)
    sb = ai_agent.resolve_scope(db, bob)

    import database as dbmod
    opp = dbmod.AIOpportunity(
        company_id=sa["company_id"], type="tender", title="T1", status="new"
    )
    db.add(opp)
    db.commit()
    db.refresh(opp)

    assert ai_agent.get_opportunity_checked(db, sa, opp.id).title == "T1"
    assert ai_agent.get_opportunity_checked(db, sb, opp.id) is None
    assert [o.title for o in ai_agent.list_opportunities(db, sa)] == ["T1"]
    assert ai_agent.list_opportunities(db, sb) == []

    summaries = ai_agent.recent_opportunity_summaries(db, sa)
    assert summaries == [
        {"id": opp.id, "type": "tender", "title": "T1", "provider": None,
         "match_score": None, "status": "new", "closing_date": None}
    ]
