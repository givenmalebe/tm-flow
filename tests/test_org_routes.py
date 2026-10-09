import database as dbmod
from auth import create_access_token
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


def bearer(user, org):
    return {"Authorization": f"Bearer {create_access_token({'sub': str(user.id), 'org_id': str(org.id)})}"}


def test_register_creates_org_with_owner_membership(client, db):
    r = register(client, "founder@example.com", "Founder Logistics")
    assert r.status_code == 200, r.text
    assert "access_token" in r.json()

    org = (
        db.query(dbmod.Organisation)
        .filter(dbmod.Organisation.name == "Founder Logistics")
        .one()
    )
    assert org.account_type == "bidder"
    assert org.join_code

    membership = (
        db.query(dbmod.Membership).filter(dbmod.Membership.org_id == org.id).one()
    )
    assert membership.role == "owner"


def test_register_accepts_an_issuer_org(client, db):
    r = register(client, "issuer@example.com", "City Council", account_type="issuer")
    assert r.status_code == 200, r.text
    assert r.json()["org"]["account_type"] == "issuer"


def test_register_rejects_an_unknown_account_type(client, db):
    r = register(client, "bad@example.com", "Bad Co", account_type="admin")
    assert r.status_code == 400


def test_register_rejects_a_duplicate_org_name(client, db):
    assert register(client, "one@example.com", "Shared Name").status_code == 200
    r = register(client, "two@example.com", "shared name")
    assert r.status_code == 409


def test_register_rejects_a_duplicate_email(client, db):
    assert register(client, "dup@example.com", "Co One").status_code == 200
    r = register(client, "DUP@example.com", "Co Two")
    assert r.status_code == 400


def test_join_org_requires_the_correct_join_code(client, db):
    register(client, "owner2@example.com", "Joinable Co")
    stranger = make_user(db, "stranger@example.com")
    any_token = {"Authorization": f"Bearer {create_access_token({'sub': str(stranger.id)})}"}

    wrong = client.post(
        "/api/auth/join-org",
        json={"org_name": "Joinable Co", "join_code": "wrong-code"},
        headers=any_token,
    )
    assert wrong.status_code == 404


def test_join_unknown_org_is_indistinguishable_from_a_wrong_code(client, db):
    register(client, "owner3@example.com", "Real Co")
    stranger = make_user(db, "stranger2@example.com")
    any_token = {"Authorization": f"Bearer {create_access_token({'sub': str(stranger.id)})}"}

    unknown = client.post(
        "/api/auth/join-org",
        json={"org_name": "No Such Org", "join_code": "whatever"},
        headers=any_token,
    )
    wrong_code = client.post(
        "/api/auth/join-org",
        json={"org_name": "Real Co", "join_code": "whatever"},
        headers=any_token,
    )
    assert unknown.status_code == wrong_code.status_code == 404


def test_join_org_with_the_right_code(client, db):
    register(client, "owner4@example.com", "Open Co")
    org = (
        db.query(dbmod.Organisation)
        .filter(dbmod.Organisation.name == "Open Co")
        .one()
    )
    joiner = make_user(db, "joiner@example.com")
    token = create_access_token({"sub": str(joiner.id), "org_id": "0"})

    r = client.post(
        "/api/auth/join-org",
        json={"org_name": "Open Co", "join_code": org.join_code},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert r.status_code == 200, r.text
    assert r.json()["access_token"]

    membership = (
        db.query(dbmod.Membership)
        .filter(
            dbmod.Membership.user_id == joiner.id,
            dbmod.Membership.org_id == org.id,
        )
        .one()
    )
    assert membership.role == "member"


def test_join_org_twice_is_not_a_duplicate(client, db):
    register(client, "owner5@example.com", "Twice Co")
    org = (
        db.query(dbmod.Organisation)
        .filter(dbmod.Organisation.name == "Twice Co")
        .one()
    )
    joiner = make_user(db, "joiner2@example.com")
    token = create_access_token({"sub": str(joiner.id), "org_id": "0"})
    headers = {"Authorization": f"Bearer {token}"}

    for _ in range(2):
        r = client.post(
            "/api/auth/join-org",
            json={"org_name": "Twice Co", "join_code": org.join_code},
            headers=headers,
        )
        assert r.status_code == 200, r.text

    count = (
        db.query(dbmod.Membership)
        .filter(
            dbmod.Membership.user_id == joiner.id,
            dbmod.Membership.org_id == org.id,
        )
        .count()
    )
    assert count == 1


def test_list_orgs_returns_only_memberships(client, db):
    alice = make_user(db, "alice2@example.com")
    orgA = make_org(db, "Alpha", user=alice)
    make_org(db, "Beta")

    r = client.get("/api/orgs", headers=bearer(alice, orgA))
    assert r.status_code == 200, r.text
    assert [o["name"] for o in r.json()] == ["Alpha"]
    assert r.json()[0]["role"] == "owner"


def test_switch_org_requires_membership(client, db):
    alice = make_user(db, "alice3@example.com")
    orgA = make_org(db, "Alpha", user=alice)
    orgB = make_org(db, "Beta")

    headers = bearer(alice, orgA)
    ok = client.post("/api/auth/switch-org", json={"org_id": orgA.id}, headers=headers)
    assert ok.status_code == 200

    denied = client.post(
        "/api/auth/switch-org", json={"org_id": orgB.id}, headers=headers
    )
    assert denied.status_code == 403


def test_member_cannot_list_members(client, db):
    owner = make_user(db, "own@example.com")
    member = make_user(db, "mem@example.com")
    org = make_org(db, "Roles Co", user=owner, role="owner")
    db.add(dbmod.Membership(user_id=member.id, org_id=org.id, role="member"))
    db.commit()

    r = client.get(f"/api/orgs/{org.id}/members", headers=bearer(member, org))
    assert r.status_code == 403


def test_admin_can_list_members(client, db):
    owner = make_user(db, "own2@example.com")
    admin = make_user(db, "adm@example.com")
    org = make_org(db, "Roles Co 2", user=owner, role="owner")
    db.add(dbmod.Membership(user_id=admin.id, org_id=org.id, role="admin"))
    db.commit()

    r = client.get(f"/api/orgs/{org.id}/members", headers=bearer(admin, org))
    assert r.status_code == 200, r.text
    assert len(r.json()) == 2


def test_admin_can_add_a_member_by_email(client, db):
    owner = make_user(db, "own3@example.com")
    admin = make_user(db, "adm2@example.com")
    newcomer = make_user(db, "newcomer@example.com")
    org = make_org(db, "Roles Co 3", user=owner, role="owner")
    db.add(dbmod.Membership(user_id=admin.id, org_id=org.id, role="admin"))
    db.commit()

    r = client.post(
        f"/api/orgs/{org.id}/members",
        json={"email": "newcomer@example.com", "role": "member"},
        headers=bearer(admin, org),
    )
    assert r.status_code == 201, r.text
    assert (
        db.query(dbmod.Membership)
        .filter(
            dbmod.Membership.user_id == newcomer.id,
            dbmod.Membership.org_id == org.id,
        )
        .count()
        == 1
    )


def test_cannot_add_a_member_with_an_email_that_has_no_account(client, db):
    owner = make_user(db, "own4@example.com")
    org = make_org(db, "Roles Co 4", user=owner, role="owner")

    r = client.post(
        f"/api/orgs/{org.id}/members",
        json={"email": "ghost@example.com", "role": "member"},
        headers=bearer(owner, org),
    )
    assert r.status_code == 404


def test_cannot_grant_the_owner_role_by_adding_a_member(client, db):
    owner = make_user(db, "own5@example.com")
    other = make_user(db, "other5@example.com")
    org = make_org(db, "Roles Co 5", user=owner, role="owner")

    r = client.post(
        f"/api/orgs/{org.id}/members",
        json={"email": "other5@example.com", "role": "owner"},
        headers=bearer(owner, org),
    )
    assert r.status_code == 400


def test_the_last_owner_cannot_be_demoted(client, db):
    owner = make_user(db, "solo@example.com")
    org = make_org(db, "Solo Co", user=owner, role="owner")

    r = client.patch(
        f"/api/orgs/{org.id}/members/{owner.id}",
        json={"role": "member"},
        headers=bearer(owner, org),
    )
    assert r.status_code == 400


def test_the_last_owner_cannot_be_removed(client, db):
    owner = make_user(db, "solo2@example.com")
    org = make_org(db, "Solo Co 2", user=owner, role="owner")

    r = client.delete(
        f"/api/orgs/{org.id}/members/{owner.id}", headers=bearer(owner, org)
    )
    assert r.status_code == 400


def test_a_member_can_be_removed(client, db):
    owner = make_user(db, "own6@example.com")
    member = make_user(db, "mem6@example.com")
    org = make_org(db, "Roles Co 6", user=owner, role="owner")
    db.add(dbmod.Membership(user_id=member.id, org_id=org.id, role="member"))
    db.commit()

    r = client.delete(
        f"/api/orgs/{org.id}/members/{member.id}", headers=bearer(owner, org)
    )
    assert r.status_code == 200, r.text
    assert (
        db.query(dbmod.Membership)
        .filter(
            dbmod.Membership.user_id == member.id,
            dbmod.Membership.org_id == org.id,
        )
        .count()
        == 0
    )


def test_rename_org_rejects_a_clashing_name(client, db):
    owner = make_user(db, "ren@example.com")
    org = make_org(db, "Original Name", user=owner, role="owner")
    make_org(db, "Other Name")

    clash = client.patch(
        f"/api/orgs/{org.id}", json={"name": "Other Name"}, headers=bearer(owner, org)
    )
    assert clash.status_code == 409

    ok = client.patch(
        f"/api/orgs/{org.id}", json={"name": "Renamed Co"}, headers=bearer(owner, org)
    )
    assert ok.status_code == 200, ok.text
    assert ok.json()["name"] == "Renamed Co"


def test_rename_org_allows_keeping_its_own_name(client, db):
    owner = make_user(db, "ren2@example.com")
    org = make_org(db, "Same Name", user=owner, role="owner")

    r = client.patch(
        f"/api/orgs/{org.id}", json={"name": "Same Name"}, headers=bearer(owner, org)
    )
    assert r.status_code == 200, r.text


def test_member_cannot_rename_the_org(client, db):
    owner = make_user(db, "own7@example.com")
    member = make_user(db, "mem7@example.com")
    org = make_org(db, "Roles Co 7", user=owner, role="owner")
    db.add(dbmod.Membership(user_id=member.id, org_id=org.id, role="member"))
    db.commit()

    r = client.patch(
        f"/api/orgs/{org.id}", json={"name": "Hijacked"}, headers=bearer(member, org)
    )
    assert r.status_code == 403
