# Stage 1: Multi-Tenancy, Roles & Two Shells — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add organisations (tenants) and per-org membership roles, scope every existing query to the active organisation — closing the IDOR where any authenticated user can read any tender by ID — and split the frontend into `/bidder` and `/issuer` route trees chosen at registration.

**Architecture:** Two new tables, `organisations` and `memberships`, plus `tenders.org_id`. The JWT gains an `org_id` pointer, but authority always comes from a server-side membership lookup performed on every request, so a stale or hand-edited token grants nothing. Every tender query gains an explicit `.filter(Tender.org_id == org.id)`; returning `404` (not `403`) for another org's row keeps IDs from being enumerable. `LibraryDocument` becomes org-scoped and `CompanyProfile` moves from per-user to per-org so colleagues in one company share a letterhead.

**Tech Stack:** Python 3 / FastAPI / SQLAlchemy 2.x / SQLite / pytest + `fastapi.testclient.TestClient`. Frontend: Next.js 16 / React 19 / TypeScript / zustand / shadcn/ui / Tailwind (emerald theme).

## Global Constraints

- Account type is a property of the **organisation**, values exactly `'bidder'` or `'issuer'`.
- Membership roles are exactly `'owner'`, `'admin'`, `'member'`.
- One user may belong to multiple organisations; the active org lives in the token.
- Membership is re-verified on **every** request. `org_id` in the token is a pointer, never authority.
- Cross-org access returns **404**, never 403, so resource IDs cannot be enumerated.
- `POST /api/auth/join-org` returns **404** for both an unknown org name and a wrong join code, so the endpoint cannot be used to discover which organisations exist.
- Tenant scoping is **explicit filters**, never a global SQLAlchemy auto-filter.
- `tenders.org_id` stays nullable at the column level to avoid a SQLite table rewrite; application code always filters on it.
- The legacy organisation created by the migration has `account_type='bidder'` and the name `Legacy Workspace`.
- Existing roles constant strings: `'owner'` deletes the organisation and transfers ownership; `'owner'`/`'admin'` manage members; all roles do tender and bid work.
- Backward compatibility: existing tender/bidder workflows keep working, now scoped to the legacy org.
- Delete the unused `tender_bidders`, `tender_bidder_documents` and `tender_evaluations` models (added in an earlier change, never exposed via API or UI, wrong shape for a multi-tenant world).
- No comments in code unless explicitly requested.
- Windows: PowerShell 5.1. Use `;` not `&&`. `npm run dev` is broken (`tee`); use `npx.cmd next dev -p 3000`.

---

## File Structure

| File | Responsibility |
|---|---|
| `mini-services/tender-api/database.py` | Add `Organisation`, `Membership`; add `org_id` to `Tender`; `User.memberships`; drop unused bidder models; make `DB_PATH` env-overridable so tests can isolate |
| `mini-services/tender-api/auth.py` | Add `get_current_org` and `require_role` dependencies. Does **not** touch `create_access_token` |
| `mini-services/tender-api/tenancy.py` **(new)** | Legacy data migration, join-code generation, case-insensitive org lookup. Pure logic, no FastAPI imports, so it is trivially testable |
| `mini-services/tender-api/main.py` | New auth/org routes; tenant filters on ~24 tender query sites; org-scope library; move company profile to org |
| `tests/conftest.py` **(new)** | Isolated temp SQLite per test, dependency overrides, org/user/token factories |
| `tests/test_tenancy.py` **(new)** | Membership + role gate tests |
| `tests/test_org_routes.py` **(new)** | Register, join, switch-org tests |
| `tests/test_tender_isolation.py` **(new)** | The security-critical suite: org A cannot touch org B's tender |
| `tests/test_library_isolation.py` **(new)** | Library and company-profile org scoping |
| `tests/test_migration.py` **(new)** | Legacy backfill is idempotent |
| `src/lib/auth-context.tsx` | Expose `orgs`, `activeOrg`, `switchOrg`; keep token in sync after switch |
| `src/lib/api.ts` | Register/join/switch-org/list-orgs methods |
| `src/components/auth-page.tsx` | Add account-type + organisation step |
| `src/components/dashboard/shell.tsx` **(new)** | Shared shell; renders nav filtered by `account_type`; hosts the org switcher |
| `src/app/bidder/page.tsx` **(new)** | Bidder route group |
| `src/app/issuer/page.tsx` **(new)** | Issuer route group |

---

### Task 1: Test harness and an isolated database

Nothing else can be tested until tests can run against a throwaway database.
`DB_PATH` is currently hardcoded, so a test run would mutate the real
`tender.db`.

**Files:**
- Modify: `mini-services/tender-api/database.py:16-17`
- Create: `tests/conftest.py`

**Interfaces:**
- Consumes: nothing
- Produces: `DB_PATH` honours `TENDERFLOW_DB`; `tests/conftest.py` fixtures `client`, `db`, `org_env` (creates two orgs with one user each, returns auth headers)

- [ ] **Step 1: Make the database path overridable**

Replace `mini-services/tender-api/database.py:16-17`:

```python
# SQLite database path
DB_PATH = os.environ.get("TENDERFLOW_DB") or os.path.join(os.path.dirname(__file__), "tender.db")
DB_URL = f"sqlite:///{DB_PATH}"
```

- [ ] **Step 2: Write the failing test**

Create `tests/test_smoke_harness.py`:

```python
def test_harness_uses_an_isolated_database(client):
    # If the harness leaked into the real DB this request would still 200,
    # so assert on the harness's own guarantee instead: the DB file is a temp file.
    from tests.conftest import ACTIVE_DB_PATH
    assert "tmp" in ACTIVE_DB_PATH.lower() or "test" in ACTIVE_DB_PATH.lower()
```

- [ ] **Step 3: Run it to verify it fails**

Run: `python -m pytest tests/test_smoke_harness.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'tests.conftest'`

- [ ] **Step 4: Write `tests/conftest.py`**

The env var must be set **before** `database` is imported, and it must be set at
collection time, so this lives at module scope in `conftest.py`:

```python
import os
import tempfile
import uuid

import pytest

# Must happen before any import of `database`, which reads this at module scope.
_TMP_DIR = tempfile.mkdtemp(prefix="tenderflow-test-")
ACTIVE_DB_PATH = os.path.join(_TMP_DIR, "test.db")
os.environ["TENDERFLOW_DB"] = ACTIVE_DB_PATH

# Make `mini-services/tender-api` importable as a package root.
API_DIR = os.path.join(
    os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
    "mini-services",
    "tender-api",
)
if API_DIR not in sys.path:
    sys.path.insert(0, API_DIR)

from fastapi.testclient import TestClient  # noqa: E402
from sqlalchemy import create_engine  # noqa: E402
from sqlalchemy.orm import sessionmaker  # noqa: E402

import database as dbmod  # noqa: E402
from auth import hash_password, create_access_token  # noqa: E402


@pytest.fixture
def db():
    """A session on the isolated test DB, with schema created and torn down."""
    dbmod.Base.metadata.create_all(bind=dbmod.engine)
    session = dbmod.SessionLocal()
    try:
        yield session
    finally:
        session.close()
        dbmod.Base.metadata.drop_all(bind=dbmod.engine)


@pytest.fixture
def client(db, monkeypatch):
    """TestClient with get_db bound to the isolated session."""
    import main as mainmod

    def override_get_db():
        yield db

    mainmod.app.dependency_overrides[dbmod.get_db] = override_get_db
    with TestClient(mainmod.app) as c:
        yield c
    mainmod.app.dependency_overrides.clear()


def make_user(db, email, password="pw12345", full_name="Test User"):
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
    token = create_access_token({"sub": str(user.id), "org_id": str(org.id)})
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture
def env(db):
    """Two independent tenants, each with one user.

    Returns (alice, orgA, alice_headers, bob, orgB, bob_headers).
    """
    alice = make_user(db, "alice@example.com")
    orgA = make_org(db, "Acme Bidding", account_type="bidder", user=alice)
    bob = make_user(db, "bob@example.com")
    orgB = make_org(db, "Globex Issuing", account_type="issuer", user=bob)
    return {
        "alice": alice,
        "orgA": orgA,
        "alice_headers": auth_headers(alice, orgA),
        "bob": bob,
        "orgB": orgB,
        "bob_headers": auth_headers(bob, orgB),
    }
```

Also add `import sys` to the top of `conftest.py` — the block above references
`sys.path`; the import list must be:

```python
import os
import sys
import tempfile
import uuid
```

- [ ] **Step 5: Run it to verify it passes**

Run: `python -m pytest tests/test_smoke_harness.py -v`
Expected: PASS

- [ ] **Step 6: Verify the real database is untouched**

Run: `git status --short mini-services/tender-api/tender.db`
Expected: no output — the real DB was not opened

- [ ] **Step 7: Commit**

```bash
git add tests/conftest.py tests/test_smoke_harness.py mini-services/tender-api/database.py
git commit -m "test: add isolated test harness and env-overridable DB path"
```

---

### Task 2: Organisation and Membership models

**Files:**
- Modify: `mini-services/tender-api/database.py`
- Test: `tests/test_org_models.py`

**Interfaces:**
- Consumes: `Base`, `Column`, `relationship`, `UniqueConstraint` (must be added to the `sqlalchemy` import at `database.py:8-11`)
- Produces:
  - `Organisation(id, name, join_code, account_type, created_at)`
  - `Membership(id, user_id, org_id, role, created_at)`, `unique(user_id, org_id)`
  - `User.memberships`
  - `Tender.org_id`
  - `LibraryDocument.org_id`
  - `CompanyProfile.org_id`

- [ ] **Step 1: Write the failing test**

Create `tests/test_org_models.py`:

```python
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
    clash = dbmod.Organisation(name="unique name ltd", join_code="abc12345", account_type="bidder")
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
```

- [ ] **Step 2: Run it to verify it fails**

Run: `python -m pytest tests/test_org_models.py -v`
Expected: FAIL — `AttributeError: module 'database' has no attribute 'Organisation'`

- [ ] **Step 3: Add `UniqueConstraint` to the imports**

In `database.py`, change the `from sqlalchemy import (...)` block to include
`UniqueConstraint`:

```python
from sqlalchemy import (
    create_engine, Column, Integer, String, Text, DateTime, Date, Time,
    Boolean, Float, ForeignKey, JSON, Enum as SAEnum, event, UniqueConstraint
)
```

- [ ] **Step 4: Add `User.memberships`**

Add this line inside the `User` class, after `created_at`:

```python
    memberships = relationship("Membership", back_populates="user", cascade="all, delete-orphan")
```

- [ ] **Step 5: Add `org_id` to `Tender`**

In the `Tender` class, add after `created_by`:

```python
    org_id = Column(Integer, ForeignKey("organisations.id"), nullable=True, index=True)
```

- [ ] **Step 6: Add `org_id` to `LibraryDocument` and `CompanyProfile`**

In `LibraryDocument`, add after `created_by`:

```python
    org_id = Column(Integer, ForeignKey("organisations.id"), nullable=True, index=True)
```

In `CompanyProfile`, add after `user_id`:

```python
    org_id = Column(Integer, ForeignKey("organisations.id"), nullable=True, index=True)
```

- [ ] **Step 7: Add the two new models**

Add immediately before `class Tender(Base):`:

```python
class Organisation(Base):
    __tablename__ = "organisations"
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(255), nullable=False, unique=True)
    join_code = Column(String(32), nullable=False, index=True)
    account_type = Column(String(20), nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    memberships = relationship("Membership", back_populates="organisation", cascade="all, delete-orphan")
    tenders = relationship("Tender", back_populates="organisation")
    library_documents = relationship("LibraryDocument", back_populates="organisation")


class Membership(Base):
    __tablename__ = "memberships"
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    org_id = Column(Integer, ForeignKey("organisations.id", ondelete="CASCADE"), nullable=False)
    role = Column(String(20), nullable=False, default="member")
    created_at = Column(DateTime, default=datetime.utcnow)
    user = relationship("User", back_populates="memberships")
    organisation = relationship("Organisation", back_populates="memberships")
    __table_args__ = (UniqueConstraint("user_id", "org_id"),)
```

Note: `Organisation.name` is unique but SQLite compares case-sensitively by
default, so a `unique=True` column alone does **not** give case-insensitive
uniqueness. `test_org_name_is_unique_case_insensitively` asserts the stricter
behaviour, which the column cannot satisfy on its own. Enforce it with a
`before_insert` hook, which needs `select` and `func` — add them to the
SQLAlchemy import block:

```python
from sqlalchemy import (
    create_engine, Column, Integer, String, Text, DateTime, Date, Time,
    Boolean, Float, ForeignKey, JSON, Enum as SAEnum, event, UniqueConstraint,
    select, func
)
```

Then add this listener immediately after the `Membership` class:

```python
@event.listens_for(Organisation, "before_insert")
def _organisation_name_is_case_insensitively_unique(mapper, connection, target):
    existing = connection.execute(
        select(Organisation.id).where(func.lower(Organisation.name) == target.name.lower())
    ).first()
    if existing is not None:
        raise ValueError("An organisation with this name already exists")
```

- [ ] **Step 8: Add back-references on `Tender` and `LibraryDocument`**

In `Tender`, add after `generated_documents`:

```python
    organisation = relationship("Organisation", back_populates="tenders")
```

In `LibraryDocument`, add after `created_by`:

```python
    organisation = relationship("Organisation", back_populates="library_documents")
```

- [ ] **Step 9: Remove the unused bidder models**

Delete the three classes `TenderBidder`, `TenderBidderDocument` and
`TenderEvaluation` in full, and delete their three lines from the `Tender`
relationship block (`bidders`, `required_documents`, `evaluations`).

- [ ] **Step 10: Run the tests**

Run: `python -m pytest tests/test_org_models.py -v`
Expected: 4 passed

- [ ] **Step 11: Commit**

```bash
git add mini-services/tender-api/database.py tests/test_org_models.py
git commit -m "feat: add Organisation and Membership models with org_id scoping"
```

---

### Task 3: `get_current_org` and `require_role` dependencies

**Files:**
- Modify: `mini-services/tender-api/auth.py`
- Test: `tests/test_tenancy.py`

**Interfaces:**
- Consumes: `Organisation`, `Membership`, `User` from `database`; existing `oauth2_scheme`, `create_access_token`, `get_current_user`
- Produces:
  - `get_current_org(...) -> tuple[Organisation, Membership]` — raises 401 unauthenticated, 403 when the token's org is not one the user belongs to
  - `require_role(*roles) -> Callable` — dependency factory raising 403 when the membership role is not listed

- [ ] **Step 1: Write the failing test**

Create `tests/test_tenancy.py`:

```python
import pytest
from fastapi import FastAPI, Depends
from fastapi.testclient import TestClient

import database as dbmod
from auth import create_access_token, get_current_org, require_role
from tests.conftest import make_org, make_user, auth_headers


def test_valid_membership_resolves_the_org(db):
    user = make_user(db, "owner@example.com")
    org = make_org(db, "Owner Org", user=user, role="owner")
    token = create_access_token({"sub": str(user.id), "org_id": str(org.id)})

    app = FastAPI()

    @app.get("/probe")
    def probe(pair=Depends(get_current_org)):
        org, membership = pair
        return {"org_id": org.id, "role": membership.role, "account_type": org.account_type}

    with TestClient(app) as c:
        r = c.get("/probe", headers={"Authorization": f"Bearer {token}"})
    assert r.status_code == 200
    assert r.json()["org_id"] == org.id
    assert r.json()["role"] == "owner"
    assert r.json()["account_type"] == "bidder"


def test_token_pointing_at_a_foreign_org_is_rejected(db):
    """The org_id in the token is a pointer, not authority."""
    mallory = make_user(db, "mallory@example.com")
    victim_org = make_org(db, "Victim Corp")
    token = create_access_token({"sub": str(mallory.id), "org_id": str(victim_org.id)})

    app = FastAPI()

    @app.get("/probe")
    def probe(pair=Depends(get_current_org)):
        return {"ok": True}

    with TestClient(app) as c:
        r = c.get("/probe", headers={"Authorization": f"Bearer {token}"})
    assert r.status_code == 403


def test_token_without_org_id_is_rejected(db):
    """A pre-tenancy token is malformed for org-scoped endpoints -> 401, not 403.

    403 is reserved for a valid token whose org the user is not a member of.
    """
    user = make_user(db, "noorg@example.com")
    token = create_access_token({"sub": str(user.id)})

    app = FastAPI()

    @app.get("/probe")
    def probe(pair=Depends(get_current_org)):
        return {"ok": True}

    with TestClient(app) as c:
        r = c.get("/probe", headers={"Authorization": f"Bearer {token}"})
    assert r.status_code == 401


def test_unauthenticated_request_is_401(db):
    app = FastAPI()

    @app.get("/probe")
    def probe(pair=Depends(get_current_org)):
        return {"ok": True}

    with TestClient(app) as c:
        r = c.get("/probe")
    assert r.status_code == 401


def test_require_role_gates_by_membership_role(db):
    member = make_user(db, "member@example.com")
    org = make_org(db, "Gated Org", user=member, role="member")
    token = create_access_token({"sub": str(member.id), "org_id": str(org.id)})

    app = FastAPI()

    @app.delete("/orgs/1")
    def delete_org(pair=Depends(require_role("owner"))):
        return {"deleted": True}

    headers = {"Authorization": f"Bearer {token}"}
    with TestClient(app) as c:
        assert c.delete("/orgs/1", headers=headers).status_code == 403


def test_require_role_allows_a_listed_role(db):
    admin = make_user(db, "admin@example.com")
    org = make_org(db, "Admin Org", user=admin, role="admin")
    token = create_access_token({"sub": str(admin.id), "org_id": str(org.id)})

    app = FastAPI()

    @app.delete("/orgs/1")
    def delete_org(pair=Depends(require_role("owner", "admin"))):
        return {"deleted": True}

    headers = {"Authorization": f"Bearer {token}"}
    with TestClient(app) as c:
        assert c.delete("/orgs/1", headers=headers).status_code == 200
```

- [ ] **Step 2: Run it to verify it fails**

Run: `python -m pytest tests/test_tenancy.py -v`
Expected: FAIL — `ImportError: cannot import name 'get_current_org' from 'auth'`

- [ ] **Step 3: Implement both dependencies**

Add to the end of `mini-services/tender-api/auth.py`:

```python
from fastapi import Depends as _Depends  # noqa: E402,F811
from database import Organisation, Membership  # noqa: E402


def get_current_org(
    token: str = Depends(oauth2_scheme),
    db: Session = Depends(get_db),
) -> tuple:
    """Resolve the active organisation from the token and re-verify membership.

    Returns (organisation, membership). The org_id claim is only a pointer:
    authority always comes from this server-side membership lookup, so a stale
    or hand-edited token grants nothing.
    """
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        user_id = payload.get("sub")
        org_id = payload.get("org_id")
        if user_id is None or org_id is None:
            raise credentials_exception
        user_id = int(user_id)
        org_id = int(org_id)
    except (JWTError, ValueError):
        raise credentials_exception

    user = db.query(User).filter(User.id == user_id).first()
    if user is None:
        raise credentials_exception

    membership = (
        db.query(Membership)
        .filter(Membership.user_id == user_id, Membership.org_id == org_id)
        .first()
    )
    if membership is None:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You are not a member of this organisation",
        )

    org = db.query(Organisation).filter(Organisation.id == org_id).first()
    if org is None:
        raise credentials_exception

    return org, membership


def require_role(*roles: str):
    """Dependency factory: 403 unless the caller's membership role is listed."""

    def _dependency(pair=Depends(get_current_org)) -> tuple:
        org, membership = pair
        if membership.role not in roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Requires one of these roles: {', '.join(roles)}",
            )
        return org, membership

    return _dependency
```

The header value must be `"WWW-Authenticate"` — a copy of this block that writes
`"WWW-Header"` compiles fine but returns a malformed 401, which breaks clients
that key off the challenge header. Verify with:

Run: `Select-String -Path mini-services/tender-api/auth.py -Pattern "WWW-Header"`
Expected: no output

- [ ] **Step 4: Run the tests**

Run: `python -m pytest tests/test_tenancy.py -v`
Expected: 6 passed

- [ ] **Step 5: Confirm the existing suite still passes**

Run: `python -m pytest tests/ -v`
Expected: all pass

- [ ] **Step 6: Commit**

```bash
git add mini-services/tender-api/auth.py tests/test_tenancy.py
git commit -m "feat: add get_current_org and require_role tenancy dependencies"
```

---

### Task 4: Legacy data migration

Existing rows have no `org_id`. Without this, every existing tender becomes
invisible once queries filter on org.

**Files:**
- Create: `mini-services/tender-api/tenancy.py`
- Test: `tests/test_migration.py`

**Interfaces:**
- Consumes: `Session`, `Organisation`, `Membership`, `User`, `Tender` from `database`
- Produces:
  - `LEGACY_ORG_NAME = "Legacy Workspace"`
  - `generate_join_code() -> str` — 12 hex chars
  - `ensure_org_columns(db) -> list[str]` — **required**: SQLAlchemy's `create_all()` only creates missing tables, it never ALTERs an existing one, so `tenders`, `library_documents` and `company_profile` keep their old shape and `org_id` must be added with `ALTER TABLE`. SQLite has no `ADD COLUMN IF NOT EXISTS`, so inspect the columns first and only issue the ALTERs that are needed
  - `ensure_legacy_org(db) -> Organisation` — idempotent; calls `ensure_org_columns` first, creates the org, attaches every user as `owner`, backfills null `org_id`
  - `find_org_by_name(db, name) -> Organisation | None` — case-insensitive

- [ ] **Step 1: Write the failing test**

Create `tests/test_migration.py`:

```python
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


def test_migration_is_idempotent(db):
    first = ensure_legacy_org(db)
    second = ensure_legacy_org(db)
    assert first.id == second.id
    count = db.query(dbmod.Organisation).filter(
        dbmod.Organisation.name == LEGACY_ORG_NAME
    ).count()
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
```

- [ ] **Step 2: Run it to verify it fails**

Run: `python -m pytest tests/test_migration.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'tenancy'`

- [ ] **Step 3: Implement `tenancy.py`**

Create `mini-services/tender-api/tenancy.py`:

```python
"""
TM Flow - tenancy helpers.

Pure logic only: no FastAPI imports, so every function here is directly
unit-testable without an app or a request.
"""
import uuid

from sqlalchemy import func, inspect, text
from sqlalchemy.orm import Session

from database import (
    CompanyProfile,
    LibraryDocument,
    Membership,
    Organisation,
    Tender,
    User,
)

LEGACY_ORG_NAME = "Legacy Workspace"

_ORG_SCOPED_TABLES = ("tenders", "library_documents", "company_profile")


def generate_join_code() -> str:
    return uuid.uuid4().hex[:12]


def ensure_org_columns(db: Session) -> list:
    """Add org_id to pre-tenancy tables if missing. Idempotent."""
    inspector = inspect(db.get_bind())
    existing_tables = set(inspector.get_table_names())
    added = []
    for table in _ORG_SCOPED_TABLES:
        if table not in existing_tables:
            continue
        columns = {c["name"] for c in inspector.get_columns(table)}
        if "org_id" in columns:
            continue
        db.execute(text(f"ALTER TABLE {table} ADD COLUMN org_id INTEGER"))
        db.execute(
            text(f"CREATE INDEX IF NOT EXISTS ix_{table}_org_id ON {table} (org_id)")
        )
        added.append(table)
    if added:
        db.commit()
    return added


def find_org_by_name(db: Session, name: str):
    return (
        db.query(Organisation)
        .filter(func.lower(Organisation.name) == name.strip().lower())
        .first()
    )


def ensure_legacy_org(db: Session) -> Organisation:
    """Backfill pre-tenancy data into a single bidder org. Idempotent."""
    ensure_org_columns(db)

    org = find_org_by_name(db, LEGACY_ORG_NAME)
    if org is None:
        org = Organisation(
            name=LEGACY_ORG_NAME,
            join_code=generate_join_code(),
            account_type="bidder",
        )
        db.add(org)
        db.flush()

    existing_member_ids = {
        row[0]
        for row in db.query(Membership.user_id)
        .filter(Membership.org_id == org.id)
        .all()
    }
    for user in db.query(User).all():
        if user.id not in existing_member_ids:
            db.add(Membership(user_id=user.id, org_id=org.id, role="owner"))

    for model in (Tender, LibraryDocument, CompanyProfile):
        db.query(model).filter(model.org_id.is_(None)).update(
            {model.org_id: org.id}, synchronize_session=False
        )

    db.commit()
    db.refresh(org)
    return org
```

- [ ] **Step 4: Run the tests**

Run: `python -m pytest tests/test_migration.py -v`
Expected: 8 passed

- [ ] **Step 5: Run the migration against the real database**

Run from `mini-services/tender-api`:
`python -c "import database; database.init_db(); from tenancy import ensure_legacy_org; db = database.SessionLocal(); org = ensure_legacy_org(db); print(org.id, org.name, org.account_type)"`

Expected: prints an id, `Legacy Workspace`, `bidder`

Then confirm idempotency and backfill:

```bash
python -c "
import database
from tenancy import ensure_legacy_org
db = database.SessionLocal()
a = ensure_legacy_org(db); b = ensure_legacy_org(db)
print('idempotent:', a.id == b.id)
print('orgs:', db.query(database.Organisation).count())
print('tenders backfilled:', db.query(database.Tender).filter(database.Tender.org_id.isnot(None)).count(), 'of', db.query(database.Tender).count())
print('memberships:', db.query(database.Membership).count(), 'users:', db.query(database.User).count())
"
```

Expected: idempotent True; 1 org; all tenders backfilled; memberships equal users.

- [ ] **Step 6: Commit**

```bash
git add mini-services/tender-api/tenancy.py tests/test_migration.py
git commit -m "feat: add idempotent legacy-org migration and org_id column upgrade"
```

---

### Task 5: Registration, join, switch-org and member routes

**Files:**
- Modify: `mini-services/tender-api/main.py`
- Test: `tests/test_org_routes.py`

**Interfaces:**
- Consumes: `get_current_org`, `require_role` from `auth`; `Organisation`, `Membership` from `database`; `generate_join_code`, `find_org_by_name` from `tenancy`
- Produces these routes:
  - `POST /api/auth/register` — accepts `org_name` + `account_type`; creates user + org + owner membership; returns token with `org_id`
  - `POST /api/auth/join-org` — `{org_name, join_code}` → token for that org
  - `GET /api/orgs` — orgs the caller belongs to
  - `POST /api/auth/switch-org` — `{org_id}` → re-issued token
  - `GET /api/orgs/{id}/members`, `POST /api/orgs/{id}/members`, `PATCH /api/orgs/{id}/members/{user_id}`, `DELETE /api/orgs/{id}/members/{user_id}`

- [ ] **Step 1: Write the failing test**

Create `tests/test_org_routes.py`:

```python
import database as dbmod
from tests.conftest import make_org, make_user


def register(client, email, org_name, account_type="bidder", password="pw12345"):
    return client.post(
        "/api/auth/register",
        json={
            "full_name": "Test User",
            "email": email,
            "password": password,
            "org_name": org_name,
            "account_type": account_type,
        },
    )


def test_register_creates_org_with_owner_membership(client, db):
    r = register(client, "founder@example.com", "Founder Logistics")
    assert r.status_code == 200, r.text
    body = r.json()
    assert "access_token" in body

    org = db.query(dbmod.Organisation).filter(
        dbmod.Organisation.name == "Founder Logistics"
    ).one()
    assert org.account_type == "bidder"
    assert org.join_code

    membership = (
        db.query(dbmod.Membership).filter(dbmod.Membership.org_id == org.id).one()
    )
    assert membership.role == "owner"

    me = client.get("/api/auth/me", headers={"Authorization": f"Bearer {body['access_token']}"})
    assert me.status_code == 200


def test_register_rejects_an_unknown_account_type(client, db):
    r = register(client, "bad@example.com", "Bad Co", account_type="admin")
    assert r.status_code in (400, 422)


def test_join_org_requires_the_correct_join_code(client, db):
    register(client, "owner2@example.com", "Joinable Co")
    other = client.post(
        "/api/auth/join-org",
        json={"org_name": "Joinable Co", "join_code": "wrong-code"},
    )
    assert other.status_code == 404


def test_join_org_with_the_right_code(client, db):
    register(client, "owner3@example.com", "Open Co")
    org = db.query(dbmod.Organisation).filter(
        dbmod.Organisation.name == "Open Co"
    ).one()
    joiner = make_user(db, "joiner@example.com")

    from auth import create_access_token

    join_token = create_access_token({"sub": str(joiner.id), "org_id": "0"})
    r = client.post(
        "/api/auth/join-org",
        json={"org_name": "Open Co", "join_code": org.join_code},
        headers={"Authorization": f"Bearer {join_token}"},
    )
    assert r.status_code == 200, r.text
    assert r.json()["access_token"]


def test_switch_org_requires_membership(client, db):
    alice = make_user(db, "alice2@example.com")
    orgA = make_org(db, "Alpha", user=alice)
    orgB = make_org(db, "Beta")

    from auth import create_access_token

    token = create_access_token({"sub": str(alice.id), "org_id": str(orgA.id)})
    headers = {"Authorization": f"Bearer {token}"}

    ok = client.post("/api/auth/switch-org", json={"org_id": orgA.id}, headers=headers)
    assert ok.status_code == 200

    denied = client.post("/api/auth/switch-org", json={"org_id": orgB.id}, headers=headers)
    assert denied.status_code == 403


def test_member_cannot_manage_members(client, db):
    owner = make_user(db, "own@example.com")
    member = make_user(db, "mem@example.com")
    org = make_org(db, "Roles Co", user=owner, role="owner")
    db.add(dbmod.Membership(user_id=member.id, org_id=org.id, role="member"))
    db.commit()

    from auth import create_access_token

    token = create_access_token({"sub": str(member.id), "org_id": str(org.id)})
    headers = {"Authorization": f"Bearer {token}"}
    r = client.get(f"/api/orgs/{org.id}/members", headers=headers)
    assert r.status_code == 403


def test_admin_can_list_members(client, db):
    owner = make_user(db, "own2@example.com")
    admin = make_user(db, "adm@example.com")
    org = make_org(db, "Roles Co 2", user=owner, role="owner")
    db.add(dbmod.Membership(user_id=admin.id, org_id=org.id, role="admin"))
    db.commit()

    from auth import create_access_token

    token = create_access_token({"sub": str(admin.id), "org_id": str(org.id)})
    headers = {"Authorization": f"Bearer {token}"}
    r = client.get(f"/api/orgs/{org.id}/members", headers=headers)
    assert r.status_code == 200
    assert len(r.json()) == 2


def test_rename_org_rejects_a_clashing_name(client, db):
    owner = make_user(db, "ren@example.com")
    org = make_org(db, "Original Name", user=owner, role="owner")
    make_org(db, "Other Name")

    from auth import create_access_token

    token = create_access_token({"sub": str(owner.id), "org_id": str(org.id)})
    headers = {"Authorization": f"Bearer {token}"}

    clash = client.patch(
        f"/api/orgs/{org.id}", json={"name": "Other Name"}, headers=headers
    )
    assert clash.status_code == 409

    ok = client.patch(
        f"/api/orgs/{org.id}", json={"name": "Renamed Co"}, headers=headers
    )
    assert ok.status_code == 200, ok.text
    assert ok.json()["name"] == "Renamed Co"
```

- [ ] **Step 2: Run it to verify it fails**

Run: `python -m pytest tests/test_org_routes.py -v`
Expected: FAIL — `register` returns 422 because `org_name` is not an accepted field

- [ ] **Step 3: Add the schemas**

Add to `main.py`, next to the other auth schemas:

```python
ACCOUNT_TYPES = {"bidder", "issuer"}
ORG_ROLES = {"owner", "admin", "member"}


class RegisterOrg(BaseModel):
    full_name: str
    email: str
    password: str
    org_name: str
    account_type: str = "bidder"


class JoinOrg(BaseModel):
    org_name: str
    join_code: str


class SwitchOrg(BaseModel):
    org_id: int


class MemberOut(BaseModel):
    user_id: int
    email: str
    full_name: str
    role: str
    joined_at: datetime

    class Config:
        from_attributes = True


class OrgOut(BaseModel):
    id: int
    name: str
    account_type: str
    join_code: str
    role: Optional[str] = None
    created_at: datetime

    class Config:
        from_attributes = True
```

- [ ] **Step 4: Rewrite `register` and add the new routes**

Replace the existing `register` at `main.py:769-781` with:

```python
@app.post("/api/auth/register")
def register(payload: RegisterOrg, db: Session = Depends(get_db)):
    account_type = payload.account_type.strip().lower()
    if account_type not in ACCOUNT_TYPES:
        raise HTTPException(status_code=400, detail="account_type must be bidder or issuer")

    if db.query(User).filter(User.email == payload.email.lower()).first():
        raise HTTPException(status_code=400, detail="Email already registered")

    org_name = payload.org_name.strip()
    if not org_name:
        raise HTTPException(status_code=400, detail="Organisation name is required")
    if tenancy.find_org_by_name(db, org_name) is not None:
        raise HTTPException(status_code=409, detail="An organisation with this name already exists")

    user = User(
        email=payload.email.lower(),
        full_name=payload.full_name,
        company_name=org_name,
        hashed_password=hash_password(payload.password),
    )
    db.add(user)
    db.flush()

    org = Organisation(
        name=org_name,
        join_code=tenancy.generate_join_code(),
        account_type=account_type,
    )
    db.add(org)
    db.flush()

    db.add(Membership(user_id=user.id, org_id=org.id, role="owner"))
    db.commit()
    db.refresh(user)
    db.refresh(org)

    token = create_access_token({"sub": str(user.id), "org_id": str(org.id)})
    return {"access_token": token, "user": UserOut.model_validate(user), "org": OrgOut.model_validate(org)}
```

Add these routes directly after it:

```python
@app.post("/api/auth/join-org")
def join_org(
    payload: JoinOrg,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    org = tenancy.find_org_by_name(db, payload.org_name)
    if org is None or org.join_code != payload.join_code.strip():
        raise HTTPException(status_code=404, detail="Organisation not found")

    existing = (
        db.query(Membership)
        .filter(Membership.user_id == user.id, Membership.org_id == org.id)
        .first()
    )
    if existing is None:
        db.add(Membership(user_id=user.id, org_id=org.id, role="member"))
        db.commit()

    token = create_access_token({"sub": str(user.id), "org_id": str(org.id)})
    return {"access_token": token, "user": UserOut.model_validate(user), "org": OrgOut.model_validate(org)}


@app.get("/api/orgs", response_model=List[OrgOut])
def list_my_orgs(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    rows = (
        db.query(Organisation, Membership)
        .join(Membership, Membership.org_id == Organisation.id)
        .filter(Membership.user_id == user.id)
        .order_by(Organisation.name)
        .all()
    )
    out = []
    for org, membership in rows:
        item = OrgOut.model_validate(org)
        item.role = membership.role
        out.append(item)
    return out


@app.post("/api/auth/switch-org")
def switch_org(
    payload: SwitchOrg,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    membership = (
        db.query(Membership)
        .filter(Membership.user_id == user.id, Membership.org_id == payload.org_id)
        .first()
    )
    if membership is None:
        raise HTTPException(status_code=403, detail="You are not a member of this organisation")

    org = db.query(Organisation).filter(Organisation.id == payload.org_id).first()
    token = create_access_token({"sub": str(user.id), "org_id": str(org.id)})
    return {"access_token": token, "user": UserOut.model_validate(user), "org": OrgOut.model_validate(org)}
```

Then the member routes:

```python
@app.get("/api/orgs/{org_id}/members", response_model=List[MemberOut])
def list_members(org_id: int, pair=Depends(require_role("owner", "admin")), db: Session = Depends(get_db)):
    org, _ = pair
    if org.id != org_id:
        raise HTTPException(status_code=404, detail="Organisation not found")
    rows = (
        db.query(Membership, User)
        .join(User, User.id == Membership.user_id)
        .filter(Membership.org_id == org.id)
        .order_by(Membership.created_at)
        .all()
    )
    out = []
    for membership, member_user in rows:
        out.append(
            MemberOut(
                user_id=member_user.id,
                email=member_user.email,
                full_name=member_user.full_name,
                role=membership.role,
                joined_at=membership.created_at,
            )
        )
    return out


class MemberAdd(BaseModel):
    email: str
    role: str = "member"


class MemberRoleUpdate(BaseModel):
    role: str


@app.post("/api/orgs/{org_id}/members", response_model=MemberOut, status_code=201)
def add_member(
    org_id: int,
    payload: MemberAdd,
    pair=Depends(require_role("owner", "admin")),
    db: Session = Depends(get_db),
):
    org, _ = pair
    if org.id != org_id:
        raise HTTPException(status_code=404, detail="Organisation not found")
    role = payload.role.strip().lower()
    if role not in ORG_ROLES or role == "owner":
        raise HTTPException(status_code=400, detail="role must be admin or member")

    member_user = db.query(User).filter(User.email == payload.email.lower()).first()
    if member_user is None:
        raise HTTPException(status_code=404, detail="No user with that email")

    existing = (
        db.query(Membership)
        .filter(Membership.user_id == member_user.id, Membership.org_id == org.id)
        .first()
    )
    if existing is not None:
        raise HTTPException(status_code=409, detail="Already a member")

    membership = Membership(user_id=member_user.id, org_id=org.id, role=role)
    db.add(membership)
    db.commit()
    db.refresh(membership)
    return MemberOut(
        user_id=member_user.id,
        email=member_user.email,
        full_name=member_user.full_name,
        role=membership.role,
        joined_at=membership.created_at,
    )


@app.patch("/api/orgs/{org_id}/members/{user_id}", response_model=MemberOut)
def update_member_role(
    org_id: int,
    user_id: int,
    payload: MemberRoleUpdate,
    pair=Depends(require_role("owner", "admin")),
    db: Session = Depends(get_db),
):
    org, _ = pair
    if org.id != org_id:
        raise HTTPException(status_code=404, detail="Organisation not found")
    role = payload.role.strip().lower()
    if role not in ORG_ROLES:
        raise HTTPException(status_code=400, detail="Invalid role")

    membership = (
        db.query(Membership)
        .filter(Membership.org_id == org.id, Membership.user_id == user_id)
        .first()
    )
    if membership is None:
        raise HTTPException(status_code=404, detail="Member not found")
    if membership.role == "owner" and role != "owner":
        owners = (
            db.query(Membership)
            .filter(Membership.org_id == org.id, Membership.role == "owner")
            .count()
        )
        if owners <= 1:
            raise HTTPException(status_code=400, detail="An organisation must keep at least one owner")

    membership.role = role
    db.commit()
    db.refresh(membership)
    member_user = db.query(User).filter(User.id == user_id).one()
    return MemberOut(
        user_id=member_user.id,
        email=member_user.email,
        full_name=member_user.full_name,
        role=membership.role,
        joined_at=membership.created_at,
    )


@app.delete("/api/orgs/{org_id}/members/{user_id}")
def remove_member(
    org_id: int,
    user_id: int,
    pair=Depends(require_role("owner", "admin")),
    db: Session = Depends(get_db),
):
    org, _ = pair
    if org.id != org_id:
        raise HTTPException(status_code=404, detail="Organisation not found")

    membership = (
        db.query(Membership)
        .filter(Membership.org_id == org.id, Membership.user_id == user_id)
        .first()
    )
    if membership is None:
        raise HTTPException(status_code=404, detail="Member not found")
    if membership.role == "owner":
        owners = (
            db.query(Membership)
            .filter(Membership.org_id == org.id, Membership.role == "owner")
            .count()
        )
        if owners <= 1:
            raise HTTPException(status_code=400, detail="An organisation must keep at least one owner")

    db.delete(membership)
    db.commit()
    return {"deleted": True}


class OrgRename(BaseModel):
    name: str


@app.patch("/api/orgs/{org_id}", response_model=OrgOut)
def rename_org(
    org_id: int,
    payload: OrgRename,
    pair=Depends(require_role("owner", "admin")),
    db: Session = Depends(get_db),
):
    org, membership = pair
    if org.id != org_id:
        raise HTTPException(status_code=404, detail="Organisation not found")

    new_name = payload.name.strip()
    if not new_name:
        raise HTTPException(status_code=400, detail="Organisation name is required")

    clash = tenancy.find_org_by_name(db, new_name)
    if clash is not None and clash.id != org.id:
        raise HTTPException(status_code=409, detail="An organisation with this name already exists")

    org.name = new_name
    db.commit()
    db.refresh(org)
    result = OrgOut.model_validate(org)
    result.role = membership.role
    return result
```

- [ ] **Step 6: Issue an `org_id` from `login` too**

Easy to miss, and it breaks every returning user. `login` signs `{"sub": ...}`
only, so anyone signing in would hold a token with no `org_id` and get a 401
from every org-scoped endpoint. Replace the existing `login`:

```python
@app.post("/api/auth/login", response_model=TokenOut)
def login(payload: UserLogin, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == payload.email.lower()).first()
    if not user or not verify_password(payload.password, user.hashed_password):
        raise HTTPException(status_code=401, detail="Invalid email or password")

    membership = (
        db.query(Membership)
        .filter(Membership.user_id == user.id)
        .order_by(Membership.created_at)
        .first()
    )
    claims = {"sub": str(user.id)}
    if membership is not None:
        claims["org_id"] = str(membership.org_id)

    token = create_access_token(claims)
    return TokenOut(access_token=token, user=UserOut.model_validate(user))
```

- [ ] **Step 7: Add the imports**

At the top of `main.py`, add `tenancy` and the new model names. `main.py:28-30`
already imports from `database`; extend it:

```python
from database import (
    get_db, Base, engine, User, Tender, TenderDocument, ChecklistItem,
    LibraryDocument, Briefing, PricingVersion, Submission, Communication,
    Addendum, ReminderSetting, CompanyProfile, GeneratedDocument,
    Organisation, Membership,
)
import tenancy
```

If that import block is formatted differently in the file, add
`Organisation, Membership` to it and add `import tenancy` on its own line after
`import ai_module`.

Also extend the `auth` import to include the new dependencies:

```python
from auth import (
    hash_password, verify_password, create_access_token, get_current_user,
    get_current_org, require_role,
)
```

And call the migration once at import time, right after `init_db()` runs. Find
the existing startup block and add after it. Print the reason instead of
swallowing it, so a failed backfill is visible in the logs:

```python
try:
    tenancy.ensure_legacy_org(SessionLocal())
except Exception as exc:
    print(f"[startup] legacy org migration skipped: {exc}")
```

- [ ] **Step 8: Run the tests**

Run: `python -m pytest tests/test_org_routes.py -v`
Expected: 22 passed

- [ ] **Step 9: Run the whole suite**

Run: `python -m pytest tests/ -v`
Expected: all pass

- [ ] **Step 10: Verify login issues an org_id**

Run from `mini-services/tender-api`:

```bash
python -c "
import database
db = database.SessionLocal()
u = db.query(database.User).first()
m = db.query(database.Membership).filter(database.Membership.user_id==u.id).first()
print('user:', u.email, '| org:', m.organisation.name, '| role:', m.role)
"
```

Expected: an existing user resolves to `Legacy Workspace` with role `owner`, so
`login` has a membership to sign into the token.

- [ ] **Step 11: Commit**

```bash
git add mini-services/tender-api/main.py tests/test_org_routes.py
git commit -m "feat: add org register, join, switch, rename and member routes"
```

---

### Task 6: Tenant-scope every tender query — the IDOR fix

This is the security-critical task. `main.py` has 23 occurrences of
`filter(Tender.id == tender_id)`, one unscoped `q = db.query(Tender)` in
`list_tenders`, plus a second class of leak this plan originally missed:

**Child resources addressed by their own id.** These endpoints take a *child*
id, not a tender id, so no amount of tender filtering covers them:

```
/api/checklist/{item_id}          PUT, DELETE
/api/briefings/{briefing_id}      PUT, DELETE, certificate DELETE
/api/pricing/{version_id}         DELETE, copy
/api/communications/{comm_id}     DELETE, attachment DELETE
/api/addendums/{addendum_id}      DELETE, ai-analyze
```

Each queries its own table straight by id. Any authenticated user could read or
destroy another org's checklist items, briefings, pricing versions,
communications and addendums. A second helper resolves these via a join:

```python
def _scoped_child(model, child_id: int, org, db: Session):
    row = (
        db.query(model)
        .join(Tender, model.tender_id == Tender.id)
        .filter(model.id == child_id, Tender.org_id == org.id)
        .first()
    )
    if row is None:
        raise HTTPException(status_code=404, detail="Not found")
    return row
```

`get_current_org` returns a `(org, membership)` **tuple**, so each handler
declares the dependency as `org_pair` and unpacks it on the first line:

```python
@app.put("/api/checklist/{item_id}")
def update_checklist_item(
    item_id: int,
    payload: ChecklistItemUpdate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
    org_pair=Depends(get_current_org),
):
    org, _membership = org_pair
    _ = _scoped_child(ChecklistItem, item_id, org, db)
```

Three aggregate reads also needed scoping, because they bypass the tender
helper entirely: `dashboard()`, `export_tenders()` (xlsx, not csv) and
`get_deadlines()`, plus `_build_full_system_context()` which feeds the AI
assistant — unscoped, it would hand every tenant's tenders to the model.

**Files:**
- Modify: `mini-services/tender-api/main.py`
- Test: `tests/test_tender_isolation.py`

**Interfaces:**
- Consumes: `get_current_org` from `auth`
- Produces: every tender-scoped endpoint resolves its tender through the active org

- [ ] **Step 1: Write the failing test**

Create `tests/test_tender_isolation.py`:

```python
import database as dbmod
from tests.conftest import make_org, make_user, auth_headers


def make_tender(db, org, reference="T-1", title="Secret tender"):
    tender = dbmod.Tender(
        reference_number=reference,
        title=title,
        client_company="Client",
        org_id=org.id,
    )
    db.add(tender)
    db.commit()
    db.refresh(tender)
    return tender


def two_tenants(db):
    alice = make_user(db, "alice@example.com")
    orgA = make_org(db, "Acme", account_type="bidder", user=alice)
    bob = make_user(db, "bob@example.com")
    orgB = make_org(db, "Globex", account_type="issuer", user=bob)
    return alice, orgA, bob, orgB


def test_list_tenders_only_returns_the_active_org(db, client):
    alice, orgA, bob, orgB = two_tenants(db)
    make_tender(db, orgA, "A-1", "Alice tender")
    make_tender(db, orgB, "B-1", "Bob tender")

    r = client.get("/api/tenders", headers=auth_headers(alice, orgA))
    assert r.status_code == 200, r.text
    refs = {t["reference_number"] for t in r.json()["items"]}
    assert refs == {"A-1"}


def test_get_tender_from_another_org_is_404_not_403(db, client):
    alice, orgA, bob, orgB = two_tenants(db)
    bob_tender = make_tender(db, orgB, "B-1", "Bob tender")

    r = client.get(f"/api/tenders/{bob_tender.id}", headers=auth_headers(alice, orgA))
    assert r.status_code == 404


def test_update_tender_in_another_org_is_refused(db, client):
    alice, orgA, bob, orgB = two_tenants(db)
    bob_tender = make_tender(db, orgB, "B-1", "Bob tender")

    r = client.put(
        f"/api/tenders/{bob_tender.id}",
        json={"title": "Hijacked"},
        headers=auth_headers(alice, orgA),
    )
    assert r.status_code == 404

    db.refresh(bob_tender)
    assert bob_tender.title == "Bob tender"


def test_delete_tender_in_another_org_is_refused(db, client):
    alice, orgA, bob, orgB = two_tenants(db)
    bob_tender = make_tender(db, orgB, "B-1", "Bob tender")

    r = client.delete(f"/api/tenders/{bob_tender.id}", headers=auth_headers(alice, orgA))
    assert r.status_code == 404
    assert db.query(dbmod.Tender).filter(dbmod.Tender.id == bob_tender.id).count() == 1


def test_tender_created_in_another_org_is_invisible(db, client):
    alice, orgA, _, orgB = two_tenants(db)
    headers = auth_headers(alice, orgA)

    created = client.post(
        "/api/tenders",
        json={
            "reference_number": "A-9",
            "title": "Mine",
            "client_company": "Client",
        },
        headers=headers,
    )
    assert created.status_code in (200, 201), created.text
    tender_id = created.json()["id"]

    visible = client.get("/api/tenders", headers=headers)
    assert {t["reference_number"] for t in visible.json()["items"]} == {"A-9"}

    # And it is not reachable from the other org either.
    from tests.conftest import auth_headers as ah

    other = client.get(f"/api/tenders/{tender_id}", headers=ah(alice, orgB))
    assert other.status_code == 403  # alice is not a member of orgB


def test_duplicate_reference_in_another_org_is_allowed(db, client):
    alice, orgA, bob, orgB = two_tenants(db)
    make_tender(db, orgA, "SHARED-1", "Alice")
    r = client.post(
        "/api/tenders",
        json={"reference_number": "SHARED-1", "title": "Bob copy", "client_company": "C"},
        headers=auth_headers(bob, orgB),
    )
    assert r.status_code in (200, 201), r.text
```

- [ ] **Step 2: Run it to verify it fails**

Run: `python -m pytest tests/test_tender_isolation.py -v`
Expected: FAIL — `test_list_tenders_only_returns_the_active_org` sees both
tenders, and `test_get_tender_from_another_org_is_404_not_403` returns 200

- [ ] **Step 3: Add a scoped lookup helper**

Add near the other helpers in `main.py` (`_parse_time` is at ~line 466):

```python
def _scoped_tender(tender_id: int, org, db: Session):
    """Fetch a tender belonging to the active org.

    Returns 404 — not 403 — for another org's tender so IDs cannot be enumerated.
    """
    tender = (
        db.query(Tender)
        .filter(Tender.id == tender_id, Tender.org_id == org.id)
        .first()
    )
    if tender is None:
        raise HTTPException(status_code=404, detail="Tender not found")
    return tender
```

- [ ] **Step 4: Scope `list_tenders`**

At `main.py:884`, replace `q = db.query(Tender)` with:

```python
    q = db.query(Tender).filter(Tender.org_id == current_org.id)
```

and add `current_org` to that endpoint's signature. The signature block at
`main.py:878-882` currently ends with `user: User = Depends(get_current_user),`.
Add the org dependency alongside it:

```python
    current_org, _membership = Depends(get_current_org),
```

Match the surrounding style — declare it as
`pair=Depends(get_current_org)` then unpack, if that is how neighbouring
endpoints read:

```python
    pair=Depends(get_current_org),
```

- [ ] **Step 5: Scope every tender lookup**

There are 23 occurrences of this exact line:

```python
    tender = db.query(Tender).filter(Tender.id == tender_id).first()
```

Replace **all** of them with the helper, so each becomes:

```python
    tender = _scoped_tender(tender_id, org, db)
```

Then add the org dependency to each of those endpoints' signatures. Any endpoint
that only had `user: User = Depends(get_current_user)` gains
`org, _membership = Depends(get_current_org),`.

To find every site:

Run: `Select-String -Path mini-services/tender-api/main.py -Pattern "filter\(Tender\.id == tender_id\)"`
Expected: 0 matches after the replacement

Run: `Select-String -Path mini-services/tender-api/main.py -Pattern "_scoped_tender"`
Expected: 23 matches

Also handle `main.py:693` (`all_tenders = db.query(Tender).order_by(...)`) used by
a helper, and any other bare `db.query(Tender)`:

```python
    q = db.query(Tender).filter(Tender.org_id == org.id)
```

- [ ] **Step 6: Set `org_id` on tender creation**

In the `create_tender` handler, add `org_id` to the `Tender(...)` construction:

```python
    tender = Tender(
        org_id=org.id,
        reference_number=payload.reference_number,
        ...
    )
```

- [ ] **Step 7: Run the isolation tests**

Run: `python -m pytest tests/test_tender_isolation.py -v`
Expected: 6 passed

- [ ] **Step 8: Run the whole suite**

Run: `python -m pytest tests/ -v`
Expected: all pass

- [ ] **Step 9: Verify no unscoped tender query remains**

Run: `Select-String -Path mini-services/tender-api/main.py -Pattern "db\.query\(Tender\)\.order_by|q = db\.query\(Tender\)$"`
Expected: no output

- [ ] **Step 10: Commit**

```bash
git add mini-services/tender-api/main.py tests/test_tender_isolation.py
git commit -m "fix: scope every tender query to the active organisation (IDOR)"
```

---

### Task 7: Org-scope the library and move company profile to org

`LibraryDocument` is currently global — any user sees every org's compliance
documents. `CompanyProfile` is per-`user_id`, so two colleagues in one company
get different letterheads.

**Files:**
- Modify: `mini-services/tender-api/main.py`
- Test: `tests/test_library_isolation.py`

**Interfaces:**
- Consumes: `get_current_org`, `LibraryDocument.org_id`, `CompanyProfile.org_id`
- Produces: library and company profile scoped to the active org

- [ ] **Step 1: Write the failing test**

Create `tests/test_library_isolation.py`:

```python
import database as dbmod
from tests.conftest import auth_headers, make_org, make_user


def test_library_documents_are_scoped_to_the_org(db, client):
    alice = make_user(db, "alice@example.com")
    orgA = make_org(db, "Acme", user=alice)
    bob = make_user(db, "bob@example.com")
    orgB = make_org(db, "Globex", user=bob)

    db.add(dbmod.LibraryDocument(name="Acme Tax", category="SARS", filename="a.txt", file_path="a.txt", org_id=orgA.id))
    db.add(dbmod.LibraryDocument(name="Globex Tax", category="SARS", filename="b.txt", file_path="b.txt", org_id=orgB.id))
    db.commit()

    r = client.get("/api/library", headers=auth_headers(alice, orgA))
    assert r.status_code == 200, r.text
    names = {d["name"] for d in r.json()}
    assert names == {"Acme Tax"}


def test_uploading_a_library_document_stamps_the_org(db, client):
    alice = make_user(db, "alice2@example.com")
    orgA = make_org(db, "Acme 2", user=alice)

    r = client.post(
        "/api/library",
        data={"name": "Uploaded Cert", "category": "PSIRA"},
        files={"file": ("cert.txt", b"hello", "text/plain")},
        headers=auth_headers(alice, orgA),
    )
    assert r.status_code in (200, 201), r.text
    doc = db.query(dbmod.LibraryDocument).filter(
        dbmod.LibraryDocument.name == "Uploaded Cert"
    ).one()
    assert doc.org_id == orgA.id


def test_company_profile_is_shared_within_the_org(db, client):
    alice = make_user(db, "alice3@example.com")
    orgA = make_org(db, "Acme 3", user=alice, role="owner")
    bob = make_user(db, "bob3@example.com")
    db.add(dbmod.Membership(user_id=bob.id, org_id=orgA.id, role="member"))
    db.commit()

    alice_headers = auth_headers(alice, orgA)
    r = client.put(
        "/api/company-profile",
        json={"company_name": "Acme Shared"},
        headers=alice_headers,
    )
    assert r.status_code == 200, r.text

    bob_headers = auth_headers(bob, orgA)
    seen = client.get("/api/company-profile", headers=bob_headers)
    assert seen.status_code == 200, seen.text
    assert seen.json()["company_name"] == "Acme Shared"
```

- [ ] **Step 2: Run it to verify it fails**

Run: `python -m pytest tests/test_library_isolation.py -v`
Expected: FAIL — the library returns both orgs' documents

- [ ] **Step 3: Scope the library queries**

Every `db.query(LibraryDocument)` in `main.py` gains the org filter. The list
handler at `main.py:668` becomes:

```python
    docs = db.query(LibraryDocument).filter(LibraryDocument.org_id == org.id).order_by(LibraryDocument.category, LibraryDocument.name).all()
```

For the other sites, add `.filter(LibraryDocument.org_id == org.id)` after
`.query(LibraryDocument)`. For single-document lookups, use:

```python
    doc = (
        db.query(LibraryDocument)
        .filter(LibraryDocument.id == doc_id, LibraryDocument.org_id == org.id)
        .first()
    )
    if doc is None:
        raise HTTPException(status_code=404, detail="Document not found")
```

Stamp `org_id` on upload:

```python
    doc = LibraryDocument(..., org_id=org.id)
```

Add `org, _membership = Depends(get_current_org),` to each library endpoint
signature.

Run: `Select-String -Path mini-services/tender-api/main.py -Pattern "db\.query\(LibraryDocument\)\.(filter|count|order_by)"`
Expected: every match now includes `org_id`

- [ ] **Step 4: Move company profile from user to org**

Replace every `db.query(CompanyProfile).filter(CompanyProfile.user_id == user.id).first()`
with:

```python
    profile = db.query(CompanyProfile).filter(CompanyProfile.org_id == org.id).first()
```

Set `org_id` when creating the profile:

```python
    profile = CompanyProfile(user_id=user.id, org_id=org.id, company_name=payload.company_name, ...)
```

Add the org dependency to each company-profile endpoint.

- [ ] **Step 5: Run the tests**

Run: `python -m pytest tests/test_library_isolation.py -v`
Expected: 3 passed

- [ ] **Step 6: Run the whole suite**

Run: `python -m pytest tests/ -v`
Expected: all pass

- [ ] **Step 7: Commit**

```bash
git add mini-services/tender-api/main.py tests/test_library_isolation.py
git commit -m "feat: scope library documents to org and share company profile per org"
```

---

### Task 8: Frontend auth context carries the active organisation

**Files:**
- Modify: `src/lib/api.ts`
- Modify: `src/lib/auth-context.tsx`
- Create: `src/lib/org-context.tsx`

**Interfaces:**
- Consumes: the Task 5 routes
- Produces:
  - `api.registerOrg(...)`, `api.joinOrg(...)`, `api.switchOrg(orgId)`, `api.listOrgs()`
  - `useOrg()` → `{ orgs, activeOrg, setActiveOrg, switchOrg, loading, role }`

- [ ] **Step 1: Export `setToken`**

`src/lib/api.ts` currently declares `function setToken(...)` without `export`, so
nothing outside the module can rotate the token after an org switch. Change the
declaration to:

```typescript
export function setToken(token: string | null) {
```

Leave the body unchanged.

- [ ] **Step 2: Add the API methods**

In `src/lib/api.ts`, after `async me()`:

```typescript
  async registerOrg(payload: {
    full_name: string;
    email: string;
    password: string;
    org_name: string;
    account_type: "bidder" | "issuer";
  }) {
    return request<{ access_token: string; user: any; org: any }>("/auth/register", {
      method: "POST",
      body: payload,
    });
  },

  async joinOrg(org_name: string, join_code: string) {
    return request<{ access_token: string; user: any; org: any }>("/auth/join-org", {
      method: "POST",
      body: { org_name, join_code },
    });
  },

  async listOrgs() {
    return request<any[]>("/orgs");
  },

  async switchOrg(org_id: number) {
    return request<{ access_token: string; user: any; org: any }>("/auth/switch-org", {
      method: "POST",
      body: { org_id },
    });
  },
```

- [ ] **Step 3: Create `src/lib/org-context.tsx`**

```typescript
"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { api, setToken } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";

export interface OrgSummary {
  id: number;
  name: string;
  account_type: "bidder" | "issuer";
  join_code: string;
  role: string | null;
  created_at: string;
}

interface OrgContextValue {
  orgs: OrgSummary[];
  activeOrg: OrgSummary | null;
  role: string | null;
  loading: boolean;
  error: string | null;
  switchOrg: (orgId: number) => Promise<void>;
  refresh: () => Promise<void>;
}

const OrgContext = createContext<OrgContextValue>({
  orgs: [],
  activeOrg: null,
  role: null,
  loading: true,
  error: null,
  switchOrg: async () => {},
  refresh: async () => {},
});

export function OrgProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [orgs, setOrgs] = useState<OrgSummary[]>([]);
  const [activeOrg, setActiveOrg] = useState<OrgSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!user) {
      setOrgs([]);
      setActiveOrg(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const list = await api.listOrgs();
      setOrgs(list);
      setActiveOrg(list.length > 0 ? list[0] : null);
    } catch (e: any) {
      setError(e?.message || "Could not load organisations");
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const switchOrg = useCallback(
    async (orgId: number) => {
      const res = await api.switchOrg(orgId);
      setToken(res.access_token);
      window.location.reload();
    },
    []
  );

  return (
    <OrgContext.Provider
      value={{
        orgs,
        activeOrg,
        role: activeOrg?.role ?? null,
        loading,
        error,
        switchOrg,
        refresh,
      }}
    >
      {children}
    </OrgContext.Provider>
  );
}

export function useOrg() {
  return useContext(OrgContext);
}

export function orgHomePath(accountType: string | null | undefined): string {
  return accountType === "issuer" ? "/issuer" : "/bidder";
}
```

The page reload after `switchOrg` is deliberate: the active org changes which
tabs exist and which tenders are visible, so remounting avoids rendering stale
org-scoped data.

- [ ] **Step 4: Type-check**

Run: `npx.cmd tsc --noEmit`
Expected: no new errors mentioning `api.ts` or `org-context.tsx`

- [ ] **Step 5: Commit**

```bash
git add src/lib/api.ts src/lib/org-context.tsx
git commit -m "feat: add org client methods and org context"
```

---

### Task 9: Registration captures organisation and account type

**Files:**
- Modify: `src/components/auth-page.tsx`

**Interfaces:**
- Consumes: `api.registerOrg`, `api.joinOrg`, `orgHomePath` from Task 8
- Produces: registration that creates an org and routes to `/bidder` or `/issuer`

- [ ] **Step 1: Add the step to the sign-up form**

Add a third step to the existing mode state machine. The current component has
`mode` (`"signin" | `"signup"`); add `signupStep` (`0 | 1 | 2`) and new fields
`orgName`, `accountType`, `joinCode`, `joinMode`.

Add the account-type selector as a two-card radio group inside step 1 of sign-up,
below the existing fields and above the submit button:

```typescript
{accountType === "bidder" ? (
  <Building2 className="h-4 w-4 text-emerald-600" />
) : (
  <Briefcase className="h-4 w-4 text-emerald-600" />
)}
```

with copy for each:

- bidder — "Apply for tenders" / "Find opportunities and submit bids"
- issuer — "Create & manage tenders" / "Publish tenders and evaluate bids"

Add a toggle above the card for joining an existing organisation instead:

```typescript
<button
  type="button"
  onClick={() => setJoinMode((v) => !v)}
  className="text-xs text-primary hover:underline"
>
  {joinMode ? "Create a new organisation instead" : "Join an existing organisation"}
</button>
```

When `joinMode` is true, show organisation name + join code inputs instead of the
account-type cards.

- [ ] **Step 2: Wire the submit handler**

Replace the sign-up submit body with:

```typescript
if (joinMode) {
  const res = await api.joinOrg(orgName.trim(), joinCode.trim());
  setToken(res.access_token);
  window.location.href = orgHomePath(res.org?.account_type);
  return;
}

const res = await api.registerOrg({
  full_name: form.fullName,
  email: form.email,
  password: form.password,
  org_name: orgName.trim(),
  account_type: accountType,
});
setToken(res.access_token);
window.location.href = orgHomePath(res.org?.account_type);
```

Validate before calling: `orgName.trim()` non-empty for both paths, and
`joinCode.trim()` non-empty when `joinMode`.

- [ ] **Step 3: Lint and type-check**

Run: `npx.cmd eslint src/components/auth-page.tsx`
Expected: no errors

Run: `npx.cmd tsc --noEmit`
Expected: no new errors in `auth-page.tsx`

- [ ] **Step 4: Commit**

```bash
git add src/components/auth-page.tsx
git commit -m "feat: capture organisation and account type at registration"
```

---

### Task 10: Shared shell with role-filtered nav and an org switcher

**Files:**
- Create: `src/components/dashboard/shell.tsx`

**Interfaces:**
- Consumes: `useOrg`, `useAuth`, the existing tab components
- Produces: `DashboardShell` that renders only the tabs valid for the active org's `account_type`, with a role guard and an org switcher

- [ ] **Step 1: Split the nav manifest by account type**

In the new `shell.tsx`, define two manifests. Reuse the icons already imported in
`dashboard-shell.tsx` and add `Users`, `Gavel`, `Building2`, `Search`:

```typescript
const BIDDER_NAV: NavItem[] = [
  { id: "dashboard", label: "Dashboard", icon: LayoutDashboard, description: "Overview & alerts" },
  { id: "discover", label: "Discover Tenders", icon: Radar, description: "Browse open tenders" },
  { id: "tenders", label: "My Tenders", icon: FileStack, description: "Tenders we bid on" },
  { id: "preparation", label: "Preparation", icon: ClipboardCheck, description: "Completion tracking" },
  { id: "pricing", label: "Pricing", icon: Calculator, description: "Bid pricing sheets" },
  { id: "submissions", label: "Submissions", icon: Send, description: "Submitted bids" },
  { id: "deadlines", label: "Deadlines", icon: CalendarClock, description: "Track & remind" },
  { id: "briefings", label: "Briefings", icon: MapPin, description: "Sessions & inspections" },
  { id: "clarifications", label: "Clarifications", icon: MessageSquare, description: "Q&A log" },
  { id: "addendums", label: "Addendums", icon: FileDiff, description: "Tender changes" },
  { id: "reader", label: "Document Reader", icon: ScanText, description: "Read & extract" },
  { id: "library", label: "Compliance Library", icon: FolderCheck, description: "Company documents" },
  { id: "company", label: "Company Profile", icon: Building, description: "Branding & letterhead" },
  { id: "assistant", label: "AI Assistant", icon: Bot, description: "Ask about tenders" },
];

const ISSUER_NAV: NavItem[] = [
  { id: "dashboard", label: "Dashboard", icon: LayoutDashboard, description: "Portfolio overview" },
  { id: "tenders", label: "Tenders", icon: FileStack, description: "Publish & manage" },
  { id: "bidders", label: "Bid Evaluation", icon: Users, description: "Review & score bids" },
  { id: "briefings", label: "Briefings", icon: MapPin, description: "Compulsory sessions" },
  { id: "deadlines", label: "Deadlines", icon: CalendarClock, description: "Closing dates" },
  { id: "clarifications", label: "Clarifications", icon: MessageSquare, description: "Q&A log" },
  { id: "addendums", label: "Addendums", icon: FileDiff, description: "Issue changes" },
  { id: "reader", label: "Document Reader", icon: ScanText, description: "Read & extract" },
  { id: "library", label: "Compliance Library", icon: FolderCheck, description: "Company documents" },
  { id: "company", label: "Company Profile", icon: Building, description: "Branding & letterhead" },
  { id: "members", label: "Members", icon: User2, description: "Team & permissions" },
  { id: "assistant", label: "AI Assistant", icon: Bot, description: "Ask about tenders" },
];
```

- [ ] **Step 2: Add the members tab to the store union**

In `src/lib/dashboard-store.ts`, add `| "members"` to `DashboardTab`.

- [ ] **Step 3: Guard rendering by account type**

In the shell, derive the allowed manifest and clamp the active tab:

```typescript
const nav = activeOrg?.account_type === "issuer" ? ISSUER_NAV : BIDDER_NAV;
const allowedIds = new Set(nav.map((n) => n.id));

useEffect(() => {
  if (!loading && activeOrg && !allowedIds.has(activeTab)) {
    setTab("dashboard");
  }
}, [activeOrg, loading, activeTab, allowedIds]);
```

That effect resets when a stale tab is deep-linked across roles.

- [ ] **Step 4: Add the org switcher**

In the header, next to the user menu:

```typescript
{orgs.length > 1 && (
  <DropdownMenu>
    <DropdownMenuTrigger asChild>
      <Button variant="outline" className="gap-2">
        <Building2 className="h-4 w-4" />
        <span className="max-w-[160px] truncate">{activeOrg?.name}</span>
        <ChevronDown className="h-3.5 w-3.5" />
      </Button>
    </DropdownMenuTrigger>
    <DropdownMenuContent align="end" className="w-64">
      <DropdownMenuLabel>Switch organisation</DropdownMenuLabel>
      {orgs.map((o) => (
        <DropdownMenuItem key={o.id} onClick={() => o.id !== activeOrg?.id && switchOrg(o.id)}>
          <div className="flex flex-col">
            <span className="text-sm font-medium truncate">{o.name}</span>
            <span className="text-xs text-muted-foreground">
              {o.account_type === "issuer" ? "Issuer" : "Bidder"} · {o.role}
            </span>
          </div>
        </DropdownMenuItem>
      ))}
      <DropdownMenuSeparator />
      <DropdownMenuItem onClick={() => setShowJoinDialog(true)}>
        <Plus className="h-4 w-4 mr-2" />
        Join another organisation
      </DropdownMenuItem>
    </DropdownMenuContent>
  </DropdownMenu>
)}
```

Show the account-type badge next to the org name so it is always obvious which UI
the user is in.

- [ ] **Step 5: Replace the old shell's body**

Delete `src/components/dashboard/dashboard-shell.tsx` and move its content into
`shell.tsx`, replacing the fixed `NAV_ITEMS` with the derived `nav` and wrapping
the tree in `OrgProvider` where `page.tsx` mounts it.

Update `src/app/page.tsx` to mount the new shell:

```typescript
import { DashboardShell } from "@/components/dashboard/shell";
```

- [ ] **Step 6: Lint and type-check**

Run: `npx.cmd eslint src/components/dashboard/shell.tsx src/app/page.tsx`
Expected: no errors

Run: `npx.cmd tsc --noEmit`
Expected: no new errors

- [ ] **Step 7: Commit**

```bash
git add src/components/dashboard/shell.tsx src/components/dashboard/dashboard-shell.tsx src/lib/dashboard-store.ts src/app/page.tsx
git commit -m "feat: role-filtered shell with org switcher"
```

---

### Task 11: Stage 1 verification

**Files:** none

**Interfaces:** verifies Stages 1 Tasks 1-10

- [ ] **Step 1: Run the full backend suite**

Run: `python -m pytest tests/ -v`
Expected: all pass, no warnings about unclosed sessions

- [ ] **Step 2: Confirm the IDOR is closed**

Run: `python -m pytest tests/test_tender_isolation.py -v`
Expected: 6 passed

- [ ] **Step 3: Confirm no unscoped tender query remains**

Run: `Select-String -Path mini-services/tender-api/main.py -Pattern "filter\(Tender\.id == tender_id\)"`
Expected: no output

- [ ] **Step 4: Build the frontend**

Run: `npx.cmd next build`
Expected: build succeeds

- [ ] **Step 5: Smoke-test both roles**

Start the backend and frontend:

```bash
cd mini-services/tender-api; python -m uvicorn main:app --host 127.0.0.1 --port 8000
```

```bash
npx.cmd next dev -p 3000
```

Manual checks:

1. Register with account type **bidder** → lands on `/bidder`, nav has no "Bid Evaluation"
2. Log out, register with account type **issuer** → lands on `/issuer`, nav has "Bid Evaluation" and "Members"
3. As a member-role user, "Members" is visible but the API returns 403
4. With two orgs on one account, the switcher changes the active org and the nav

- [ ] **Step 6: Confirm the legacy migration ran**

Run: `python -c "import database; db=database.SessionLocal(); from database import Organisation; print([(o.id,o.name,o.account_type) for o in db.query(Organisation).all()])"` from `mini-services/tender-api`
Expected: includes `('Legacy Workspace', 'bidder')`

- [ ] **Step 7: Commit any fixes**

```bash
git add -A
git commit -m "fix: address Stage 1 verification findings"
```

---

## Not in this plan

Deferred to Stage 2 (`TenderRequirement`, `Bid`, `BidDocument`, the marketplace
projection and its endpoints) and Stage 3 (bulk upload, AI compliance, AI top
bidder, issuer evaluation UI, analytics), per spec §16.

The `bidders-tab.tsx` placeholder created in an earlier change is removed by
Task 10 and replaced by the Stage 3 issuer evaluation view.
