import database as dbmod
from tests.conftest import make_org, make_user


def test_membership_is_unique_per_user_and_org(db):
    user = make_user(db, "carol@example.com")
    org = make_org(db, "Carol Co")
    db.add(dbmod.Membership(user_id=user.id, org_id=org.id, role="member"))
    db.commit()

    duplicate = dbmod.Membership(user_id=user.id, org_id=org.id, role="member")
    db.add(duplicate)
    try:
        db.commit()
        assert False, "expected IntegrityError on duplicate membership"
    except Exception:
        db.rollback()


def test_user_can_belong_to_multiple_orgs(db):
    user = make_user(db, "dave@example.com")
    org1 = make_org(db, "Dave Trading")
    org2 = make_org(db, "Dave Holdings", account_type="issuer")
    db.add(dbmod.Membership(user_id=user.id, org_id=org1.id, role="owner"))
    db.add(dbmod.Membership(user_id=user.id, org_id=org2.id, role="member"))
    db.commit()

    memberships = (
        db.query(dbmod.Membership).filter(dbmod.Membership.user_id == user.id).all()
    )
    assert len(memberships) == 2
    assert {m.org_id for m in memberships} == {org1.id, org2.id}
    assert {m.role for m in memberships} == {"owner", "member"}


def test_org_name_is_unique_case_insensitively(db):
    make_org(db, "Unique Name Ltd")
    clash = dbmod.Organisation(
        name="unique name ltd", join_code="abc12345", account_type="bidder"
    )
    db.add(clash)
    try:
        db.commit()
        assert False, "expected IntegrityError on duplicate org name"
    except Exception:
        db.rollback()


def test_tender_belongs_to_an_org(db):
    user = make_user(db, "erin@example.com")
    org = make_org(db, "Erin Builds", user=user)
    tender = dbmod.Tender(
        reference_number="T-1",
        title="Roads",
        client_company="Municipality",
        org_id=org.id,
    )
    db.add(tender)
    db.commit()
    db.refresh(tender)
    assert tender.org_id == org.id
