import database as dbmod
from tenancy import (
    LEGACY_ORG_NAME,
    ensure_legacy_org,
    find_org_by_name,
    generate_join_code,
)


def test_migration_creates_a_bidder_org_and_owns_every_tender(db):
    orphan = dbmod.Tender(
        reference_number="LEG-1", title="Old tender", client_company="Client"
    )
    db.add(orphan)
    db.add(dbmod.User(email="old@example.com", full_name="Old", hashed_password="x"))
    db.commit()

    org = ensure_legacy_org(db)

    assert org.name == LEGACY_ORG_NAME
    assert org.account_type == "bidder"
    db.refresh(orphan)
    assert orphan.org_id == org.id


def test_migration_is_idempotent(db):
    first = ensure_legacy_org(db)
    second = ensure_legacy_org(db)
    assert first.id == second.id
    count = (
        db.query(dbmod.Organisation)
        .filter(dbmod.Organisation.name == LEGACY_ORG_NAME)
        .count()
    )
    assert count == 1


def test_migration_gives_every_user_owner(db):
    db.add(dbmod.User(email="a@example.com", full_name="A", hashed_password="x"))
    db.add(dbmod.User(email="b@example.com", full_name="B", hashed_password="x"))
    db.commit()

    org = ensure_legacy_org(db)
    members = (
        db.query(dbmod.Membership).filter(dbmod.Membership.org_id == org.id).all()
    )
    assert len(members) == 2
    assert {m.role for m in members} == {"owner"}


def test_migration_does_not_duplicate_memberships(db):
    db.add(dbmod.User(email="c@example.com", full_name="C", hashed_password="x"))
    db.commit()

    ensure_legacy_org(db)
    ensure_legacy_org(db)
    ensure_legacy_org(db)

    org = find_org_by_name(db, LEGACY_ORG_NAME)
    members = (
        db.query(dbmod.Membership).filter(dbmod.Membership.org_id == org.id).all()
    )
    assert len(members) == 1


def test_ensure_org_columns_is_idempotent(db):
    """Pre-tenancy tables need org_id added; running twice must be a no-op."""
    from sqlalchemy import inspect
    from tenancy import ensure_org_columns

    first = ensure_org_columns(db)
    second = ensure_org_columns(db)

    assert second == []
    inspector = inspect(db.get_bind())
    for table in ("tenders", "library_documents", "company_profile"):
        cols = {c["name"] for c in inspector.get_columns(table)}
        assert "org_id" in cols, f"{table} still missing org_id"


def test_migration_backfills_library_and_company_profile(db):
    doc = dbmod.LibraryDocument(
        name="Legacy Cert", category="SARS", filename="c.txt", file_path="c.txt"
    )
    db.add(doc)
    db.commit()

    org = ensure_legacy_org(db)

    db.refresh(doc)
    assert doc.org_id == org.id


def test_find_org_by_name_is_case_insensitive(db):
    from tests.conftest import make_org

    make_org(db, "Globex Issuing")
    assert find_org_by_name(db, "globex issuing") is not None
    assert find_org_by_name(db, "GLOBEX ISSUING") is not None
    assert find_org_by_name(db, "Nope") is None


def test_generate_join_code_is_hex_and_distinct():
    codes = {generate_join_code() for _ in range(50)}
    assert len(codes) == 50
    assert all(len(c) == 12 for c in codes)
    assert all(all(ch in "0123456789abcdef" for ch in c) for c in codes)
