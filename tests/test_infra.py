"""Smoke test: the rebuilt fixture wiring (db, client, act_as) works end-to-end."""
from datetime import date, timedelta

from tests.conftest import make_company, make_tender, make_user


def test_infra_sees_only_the_callers_company(db, client, act_as):
    alice = make_user(db, "alice@example.com", company_name="Acme")
    make_company(db, "Acme", alice)
    make_tender(db, alice, "A-1", "Alice tender",
               closing_date=date.today() + timedelta(days=5))

    bob = make_user(db, "bob@example.com", company_name="Globex")
    make_company(db, "Globex", bob)
    make_tender(db, bob, "B-1", "Bob tender")

    act_as(alice)
    r = client.get("/api/tenders")
    assert r.status_code == 200, r.text
    refs = {t["reference_number"] for t in r.json()["items"]}
    assert refs == {"A-1"}

    act_as(bob)
    r = client.get("/api/tenders")
    assert r.status_code == 200
    refs = {t["reference_number"] for t in r.json()["items"]}
    assert refs == {"B-1"}


def test_infra_without_act_as_is_401(db, client):
    r = client.get("/api/tenders")
    assert r.status_code == 401
