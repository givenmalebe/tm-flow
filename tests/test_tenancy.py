import pytest
from fastapi import FastAPI, Depends
from fastapi.testclient import TestClient

from auth import create_access_token, get_current_org, require_role
from tests.conftest import make_org, make_user


def _probe_app():
    app = FastAPI()

    @app.get("/probe")
    def probe(pair=Depends(get_current_org)):
        org, membership = pair
        return {
            "org_id": org.id,
            "role": membership.role,
            "account_type": org.account_type,
        }

    return app


def test_valid_membership_resolves_the_org(db):
    user = make_user(db, "owner@example.com")
    org = make_org(db, "Owner Org", user=user, role="owner")
    token = create_access_token({"sub": str(user.id), "org_id": str(org.id)})

    with TestClient(_probe_app()) as c:
        r = c.get("/probe", headers={"Authorization": f"Bearer {token}"})

    assert r.status_code == 200, r.text
    assert r.json()["org_id"] == org.id
    assert r.json()["role"] == "owner"
    assert r.json()["account_type"] == "bidder"


def test_token_pointing_at_a_foreign_org_is_rejected(db):
    """The org_id in the token is a pointer, not authority."""
    mallory = make_user(db, "mallory@example.com")
    victim_org = make_org(db, "Victim Corp")
    token = create_access_token({"sub": str(mallory.id), "org_id": str(victim_org.id)})

    with TestClient(_probe_app()) as c:
        r = c.get("/probe", headers={"Authorization": f"Bearer {token}"})

    assert r.status_code == 403


def test_token_without_org_id_is_rejected(db):
    """A pre-tenancy token is malformed for org-scoped endpoints -> 401, not 403.

    403 is reserved for a valid token whose org the user is not a member of.
    """
    user = make_user(db, "noorg@example.com")
    token = create_access_token({"sub": str(user.id)})

    with TestClient(_probe_app()) as c:
        r = c.get("/probe", headers={"Authorization": f"Bearer {token}"})

    assert r.status_code == 401


def test_unauthenticated_request_is_401(db):
    with TestClient(_probe_app()) as c:
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

    with TestClient(app) as c:
        r = c.delete("/orgs/1", headers={"Authorization": f"Bearer {token}"})
    assert r.status_code == 403


def test_require_role_allows_a_listed_role(db):
    admin = make_user(db, "admin@example.com")
    org = make_org(db, "Admin Org", user=admin, role="admin")
    token = create_access_token({"sub": str(admin.id), "org_id": str(org.id)})

    app = FastAPI()

    @app.delete("/orgs/1")
    def delete_org(pair=Depends(require_role("owner", "admin"))):
        return {"deleted": True}

    with TestClient(app) as c:
        r = c.delete("/orgs/1", headers={"Authorization": f"Bearer {token}"})
    assert r.status_code == 200
