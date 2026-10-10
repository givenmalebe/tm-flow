"""resolve_scope + ensure_company_bootstrap: the backbone of per-org isolation."""
from tests.conftest import add_member, make_company, make_user


def _resolve(db, user):
    import ai_agent
    return ai_agent.resolve_scope(db, user)


def test_member_of_company_gets_company_scope(db):
    alice = make_user(db, "alice@example.com", company_name="Acme")
    company = make_company(db, "Acme", alice)
    bob = make_user(db, "bob@example.com")
    add_member(db, company, bob)

    scope = _resolve(db, alice)
    assert scope["company_id"] == company.id
    assert scope["company_name"] == "Acme"
    assert set(scope["member_ids"]) == {alice.id, bob.id}


def test_solo_user_scope_is_own_rows_only(db):
    bob = make_user(db, "bob@example.com")
    scope = _resolve(db, bob)
    assert scope["company_id"] is None
    assert scope["member_ids"] == [bob.id]


def test_bootstrap_creates_company_for_onboarded_user(db):
    carol = make_user(db, "carol@example.com", company_name="Carol Cleaning")
    scope = _resolve(db, carol)
    assert scope["company_id"] is not None
    assert scope["company_name"] == "Carol Cleaning"
    assert scope["member_ids"] == [carol.id]

    import database as dbmod
    member = db.query(dbmod.BidderMember).filter(dbmod.BidderMember.user_id == carol.id).one()
    assert member.status == "approved"
    assert member.role == "admin"


def test_bootstrap_never_merges_strangers_with_same_company_name(db):
    dan = make_user(db, "dan@example.com", company_name="Shared Co")
    make_company(db, "Shared Co", dan)  # company already exists, owned by dan

    erin = make_user(db, "erin@example.com", company_name="shared co")
    scope = _resolve(db, erin)
    # Erin must NOT be merged into Dan's company
    assert scope["company_id"] is None
    assert scope["member_ids"] == [erin.id]


def test_bootstrap_skips_issuers_and_users_without_a_name(db):
    issuer = make_user(db, "iss@example.com", company_name="Gov", account_type="issuer")
    scope = _resolve(db, issuer)
    assert scope["company_id"] is None

    nameless = make_user(db, "nameless@example.com")
    scope = _resolve(db, nameless)
    assert scope["company_id"] is None


def test_pending_member_is_not_company_scoped(db):
    alice = make_user(db, "alice2@example.com", company_name="Acme2")
    company = make_company(db, "Acme2", alice)
    pat = make_user(db, "pat@example.com")
    add_member(db, company, pat, status="pending")

    scope = _resolve(db, pat)
    assert scope["company_id"] is None
    assert scope["member_ids"] == [pat.id]
