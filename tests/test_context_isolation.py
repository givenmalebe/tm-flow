"""_build_full_system_context must be scope-filtered — the AI sees only its own
company's data, never other companies' and never everyone's."""
from datetime import date, timedelta

from tests.conftest import make_company, make_tender, make_user


def _context(db, user, tender_id=None):
    import main
    return main._build_full_system_context(db, user, tender_id)


def _profile(db, user, name):
    import database as dbmod
    p = dbmod.CompanyProfile(user_id=user.id, company_name=name)
    db.add(p)
    db.commit()
    db.refresh(p)
    return p


def _library_doc(db, user, name, category="B-BBEE"):
    import database as dbmod
    d = dbmod.LibraryDocument(
        name=name, category=category, created_by=user.id,
        filename=f"{name}.pdf", file_path="x.pdf",
        expiry_date=date.today() + timedelta(days=3),
    )
    db.add(d)
    db.commit()
    db.refresh(d)
    return d


def test_context_contains_only_own_company_data(db):
    alice = make_user(db, "alice@example.com", company_name="Acme")
    make_company(db, "Acme", alice)
    bob = make_user(db, "bob@example.com", company_name="Globex")
    make_company(db, "Globex", bob)

    make_tender(db, alice, "A-1", "Alice tender")
    make_tender(db, bob, "B-1", "Bob tender")
    _library_doc(db, alice, "Acme BEE")
    _library_doc(db, bob, "Globex BEE")

    ctx = _context(db, alice)
    refs = {t["reference_number"] for t in ctx["tenders"]}
    assert refs == {"A-1"}
    lib = {d["name"] for d in ctx["compliance_library"]}
    assert lib == {"Acme BEE"}
    assert ctx["dashboard"]["total_tenders"] == 1


def test_solo_user_context_is_own_rows_only(db):
    alice = make_user(db, "alice@example.com", company_name="Acme")
    make_company(db, "Acme", alice)
    make_tender(db, alice, "A-1", "Alice tender")
    pat = make_user(db, "pat@example.com")
    make_tender(db, pat, "P-1", "Pat tender")

    ctx = _context(db, pat)
    assert {t["reference_number"] for t in ctx["tenders"]} == {"P-1"}


def test_context_includes_company_profile_memory_and_opportunities(db):
    alice = make_user(db, "alice@example.com", company_name="Acme")
    make_company(db, "Acme", alice)
    _profile(db, alice, "Acme")

    import ai_agent
    scope = ai_agent.resolve_scope(db, alice)
    mem = ai_agent.get_or_create_memory(db, scope)
    mem.mission = "Win every security tender"
    db.commit()
    ai_agent.add_chat_message(db, scope, alice, "user", "what should I do next?")

    ctx = _context(db, alice)
    assert ctx["company_profile"]["company_name"] == "Acme"
    assert ctx["ai_memory"]["mission"] == "Win every security tender"
    assert ctx["recent_chat"] == [{"role": "user", "content": "what should I do next?"}]
    assert ctx["ai_opportunities"] == []


def test_focus_tender_outside_scope_is_ignored(db):
    alice = make_user(db, "alice@example.com", company_name="Acme")
    make_company(db, "Acme", alice)
    bob = make_user(db, "bob@example.com", company_name="Globex")
    make_company(db, "Globex", bob)
    bob_tender = make_tender(db, bob, "B-1", "Bob tender")

    ctx = _context(db, alice, tender_id=bob_tender.id)
    assert "focus_tender_id" not in ctx
