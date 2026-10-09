import os
import sys
import tempfile
import uuid

import pytest

# Must happen before any import of `database`, which reads this at module scope.
_TMP_DIR = tempfile.mkdtemp(prefix="tenderflow-test-")
ACTIVE_DB_PATH = os.path.join(_TMP_DIR, "test.db")
os.environ["TENDERFLOW_DB"] = ACTIVE_DB_PATH

# Make `mini-services/tender-api` importable.
API_DIR = os.path.join(
    os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
    "mini-services",
    "tender-api",
)
if API_DIR not in sys.path:
    sys.path.insert(0, API_DIR)


@pytest.fixture
def db():
    """A session on the isolated test DB, schema created and torn down per test."""
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
    """TestClient with get_db bound to the isolated session."""
    import main as mainmod

    def override_get_db():
        yield db

    mainmod.app.dependency_overrides[dbmod_get_db()] = override_get_db
    with TestClient(mainmod.app) as c:
        yield c
    mainmod.app.dependency_overrides.clear()


def dbmod_get_db():
    import database as dbmod

    return dbmod.get_db


from fastapi.testclient import TestClient  # noqa: E402


def make_user(db, email, password="pw12345", full_name="Test User"):
    import database as dbmod
    from auth import hash_password

    user = dbmod.User(
        email=email.lower(),
        full_name=full_name,
        hashed_password=hash_password(password),
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


def make_org(db, name, account_type="bidder", user=None, role="owner"):
    import database as dbmod

    org = dbmod.Organisation(
        name=name,
        join_code=uuid.uuid4().hex[:8],
        account_type=account_type,
    )
    db.add(org)
    db.commit()
    db.refresh(org)
    if user is not None:
        db.add(dbmod.Membership(user_id=user.id, org_id=org.id, role=role))
        db.commit()
    return org


def auth_headers(user, org):
    from auth import create_access_token

    token = create_access_token({"sub": str(user.id), "org_id": str(org.id)})
    return {"Authorization": f"Bearer {token}"}
