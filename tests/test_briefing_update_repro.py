import database as dbmod
from tests.conftest import auth_headers, make_org, make_user


def _setup(db):
    alice = make_user(db, "alice@example.com")
    orgA = make_org(db, "Acme", account_type="bidder", user=alice)
    return alice, orgA


def test_update_briefing_with_a_date_string(client, db):
    alice, orgA = _setup(db)
    tender = dbmod.Tender(
        reference_number="B-1",
        title="T",
        client_company="C",
        org_id=orgA.id,
    )
    db.add(tender)
    db.commit()
    db.refresh(tender)
    briefing = dbmod.Briefing(tender_id=tender.id, date=dbmod.date.today())
    db.add(briefing)
    db.commit()
    db.refresh(briefing)

    r = client.put(
        f"/api/briefings/{briefing.id}",
        json={"date": "2030-01-01", "briefing_type": "Site Inspection"},
        headers=auth_headers(alice, orgA),
    )
    assert r.status_code == 200, f"got {r.status_code}: {r.text}"
    assert r.json()["date"] == "2030-01-01"
    assert r.json()["briefing_type"] == "Site Inspection"
