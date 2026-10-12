"""get_current_user identity resolution: firebase_uid linkage + Postgres shadow sync.

These exercise the real resolver (not the dependency override) with token
verification stubbed, so they cover the migration glue the rest of the suite
bypasses: UID-first lookup, backfill of rows predating the firebase_uid
column, and the Postgres-wins refresh of the SQLite shadow row.
"""
import pytest

from tests.conftest import make_user


@pytest.fixture(autouse=True)
def _no_postgres(monkeypatch):
    """Keep unit tests off any real Postgres configured in the environment."""
    import pg

    monkeypatch.setattr(pg, "engine", lambda: None)


def _auth_with_claims(db, monkeypatch, claims):
    import auth

    monkeypatch.setattr(auth, "verify_firebase_token", lambda token: claims)
    return auth.get_current_user("fake-token", db)


def test_first_request_creates_user_with_firebase_uid(db, monkeypatch):
    user = _auth_with_claims(
        db,
        monkeypatch,
        {"email": "fresh@example.com", "user_id": "uid-fresh", "name": "Fresh User"},
    )
    assert user.firebase_uid == "uid-fresh"
    assert user.email == "fresh@example.com"
    assert user.full_name == "Fresh User"
    assert user.account_type == "applicant"


def test_legacy_email_row_is_backfilled_with_uid(db, monkeypatch):
    legacy = make_user(db, "legacy@example.com")
    assert legacy.firebase_uid is None

    user = _auth_with_claims(
        db,
        monkeypatch,
        {"email": "legacy@example.com", "user_id": "uid-legacy", "name": "Legacy"},
    )
    assert user.id == legacy.id
    assert user.firebase_uid == "uid-legacy"


def test_uid_lookup_wins_over_changed_email(db, monkeypatch):
    row = make_user(db, "old@example.com")
    row.firebase_uid = "uid-stable"
    db.commit()

    user = _auth_with_claims(
        db,
        monkeypatch,
        {"email": "new@example.com", "user_id": "uid-stable", "name": "Renamed"},
    )
    assert user.id == row.id


def test_postgres_identity_wins_over_shadow(db, monkeypatch):
    import pg_store

    make_user(db, "shadow@example.com", account_type="applicant")
    monkeypatch.setattr(
        pg_store,
        "get_user",
        lambda uid: {
            "account_type": "issuer",
            "onboarding_completed": True,
            "company_name": "PG Co",
        },
    )

    user = _auth_with_claims(
        db,
        monkeypatch,
        {"email": "shadow@example.com", "user_id": "uid-shadow", "name": "Shadow"},
    )
    assert user.account_type == "issuer"
    assert user.onboarding_completed is True
    assert user.company_name == "PG Co"


def test_postgres_outage_does_not_break_auth(db, monkeypatch):
    import pg_store

    make_user(db, "offline@example.com")

    def boom(uid):
        raise RuntimeError("pg down")

    monkeypatch.setattr(pg_store, "get_user", boom)

    user = _auth_with_claims(
        db,
        monkeypatch,
        {"email": "offline@example.com", "user_id": "uid-off", "name": "Offline"},
    )
    assert user.email == "offline@example.com"
    assert user.account_type == "applicant"
