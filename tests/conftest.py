"""
Shared test fixtures for the TM Flow backend.

The live service owns identity via Firebase Auth; tests bypass token
verification by overriding the get_current_user dependency with whatever
user the test selects via the `act_as` fixture.

database.py resolves DB_PATH at import time, so a throwaway path is set
before anything imports `database`.
"""
import os
import sys
import tempfile
from datetime import datetime

import pytest
from fastapi.testclient import TestClient

_TMP_DIR = tempfile.mkdtemp(prefix="tmflow-test-")
os.environ["DB_PATH"] = os.path.join(_TMP_DIR, "test.db")

API_DIR = os.path.join(
    os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
    "mini-services",
    "tender-api",
)
if API_DIR not in sys.path:
    sys.path.insert(0, API_DIR)


class AuthState:
    """The user that get_current_user resolves to during tests."""

    user = None


@pytest.fixture
def db():
    """A session on the isolated test DB; schema per test."""
    import database as dbmod

    dbmod.Base.metadata.create_all(bind=dbmod.engine)
    session = dbmod.SessionLocal()
    try:
        yield session
    finally:
        session.close()
        dbmod.Base.metadata.drop_all(bind=dbmod.engine)


@pytest.fixture
def client(db):
    """TestClient with get_db + get_current_user bound to this test."""
    import main as mainmod
    import database as dbmod
    from fastapi import HTTPException

    def override_get_db():
        yield db

    def override_get_current_user():
        if AuthState.user is None:
            raise HTTPException(status_code=401, detail="No test user set — use act_as(user)")
        return AuthState.user

    mainmod.app.dependency_overrides[dbmod.get_db] = override_get_db
    mainmod.app.dependency_overrides[mainmod.get_current_user] = override_get_current_user
    with TestClient(mainmod.app) as c:
        yield c
    mainmod.app.dependency_overrides.clear()


@pytest.fixture
def act_as():
    """act_as(user) makes subsequent client calls authenticate as that user."""
    def _act_as(user):
        AuthState.user = user
    yield _act_as
    AuthState.user = None


# ---------- data factories (importable as `from tests.conftest import ...`) ----------

def make_user(db, email, full_name="Test User", company_name=None, account_type="applicant"):
    import database as dbmod

    user = dbmod.User(
        email=email.lower(),
        full_name=full_name,
        hashed_password="",
        company_name=company_name,
        account_type=account_type,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


def make_company(db, name, owner, industry=None):
    """A BidderCompany with `owner` as an approved admin member."""
    import database as dbmod

    company = dbmod.BidderCompany(name=name, industry=industry, created_by=owner.id)
    db.add(company)
    db.flush()
    member = dbmod.BidderMember(
        company_id=company.id,
        user_id=owner.id,
        role="admin",
        status="approved",
        approved_at=datetime.utcnow(),
    )
    db.add(member)
    db.commit()
    db.refresh(company)
    return company


def add_member(db, company, user, status="approved", role="member"):
    import database as dbmod

    member = dbmod.BidderMember(
        company_id=company.id,
        user_id=user.id,
        role=role,
        status=status,
        approved_at=datetime.utcnow() if status == "approved" else None,
    )
    db.add(member)
    db.commit()
    db.refresh(member)
    return member


def make_tender(db, user, ref="T-1", title="Tender", closing_date=None, category=None,
               status="New Opportunity", client_company="Client"):
    import database as dbmod

    tender = dbmod.Tender(
        reference_number=ref,
        title=title,
        client_company=client_company,
        created_by=user.id,
        closing_date=closing_date,
        category=category,
        status=status,
    )
    db.add(tender)
    db.commit()
    db.refresh(tender)
    return tender
