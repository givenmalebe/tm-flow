"""Submitting a bid to an issuer that publishes on this platform.

The bidder-side tender and the issuer-side tender were separate silos; this
pins that a bid is routed to the right issuer, that submission is refused until
the readiness gate passes, and that a repeat submission is blocked.
"""
import io
import json
import zipfile

import submission as sub
from tests.conftest import make_company, make_tender, make_user

from datetime import date, timedelta


def _seed(db, user, email="ready@example.com", complete=True):
    """A bidder whose tender passes every readiness gate."""
    from database import ChecklistItem, LibraryDocument, TenderDocument

    alice = make_user(db, email, company_name="Sparkle Cleaning Co")
    make_company(db, "Sparkle Cleaning Co", alice)
    t = make_tender(db, alice, ref="SYS-77", title="Cleaning",
                    closing_date=date.today() + timedelta(days=20))
    db.add(TenderDocument(tender_id=t.id, filename="t.pdf",
                          original_filename="t.pdf", file_path="t.pdf", file_type="pdf"))
    for cat in ["CIPC", "B-BBEE", "SARS", "PSIRA", "COIDA"]:
        db.add(ChecklistItem(
            tender_id=t.id, name=f"{cat} documents", category="Compliance",
            mandatory=True, description=f"Valid {cat}",
            library_category=cat,
            status="Complete" if complete else "Outstanding",
        ))
        # The certificate must actually exist in the bidder's library.
        db.add(LibraryDocument(
            name=f"{cat} documents", category=cat, filename=f"{cat.lower()}.pdf",
            file_path=f"{cat.lower()}.pdf", file_type="pdf", created_by=alice.id,
        ))
    db.commit()
    db.refresh(t)
    return alice, t


def _library():
    return [
        {"id": i + 1, "name": f"{cat} documents", "category": cat,
         "filename": f"{cat.lower()}.pdf", "file_path": f"{cat.lower()}.pdf",
         "expiry_date": None, "status": "Active"}
        for i, cat in enumerate(["CIPC", "B-BBEE", "SARS", "PSIRA", "COIDA"])
    ]


def test_submit_blocked_until_ready(db, client, act_as):
    # Seeded with an incomplete checklist, so the gate must refuse.
    alice, t = _seed(db, make_user(db, "s1@example.com", company_name="Acme"), complete=False)
    act_as(alice)

    res = client.post(f"/api/tenders/{t.id}/submit", json={})
    assert res.status_code == 409
    detail = res.json()["detail"]
    assert "not ready" in detail["message"]
    assert detail["score"] < 100
    assert detail["blocking_issues"]


def test_ready_for_an_external_tender(db, client, act_as):
    alice, t = _seed(db, make_user(db, "s2@example.com", company_name="Acme"))
    act_as(alice)

    res = client.get(f"/api/tenders/{t.id}/submission-readiness")
    body = res.json()
    assert res.status_code == 200
    assert body["ready_to_submit"] is True, body["blocking_issues"]
    assert body["score"] == 100
    assert body["source"] == "external"

    # External tenders cannot be submitted here - the bundle is the route.
    res2 = client.post(f"/api/tenders/{t.id}/submit", json={})
    assert res2.status_code == 409
    assert "bundle" in res2.json()["detail"]["message"].lower()


def test_bundle_downloads_as_zip(db, client, act_as):
    alice, t = _seed(db, make_user(db, "s3@example.com", company_name="Acme"))
    act_as(alice)

    res = client.get(f"/api/tenders/{t.id}/submission-bundle.zip")
    assert res.status_code == 200
    assert res.headers["content-type"].startswith("application/zip")
    zf = zipfile.ZipFile(io.BytesIO(res.content))
    assert "0_MANIFEST.txt" in zf.namelist()
    assert "Ready to submit  : YES" in zf.read("0_MANIFEST.txt").decode()


def test_submit_to_issuer_on_this_platform(db, client, act_as):
    from database import IssuerCompany, IssuedTender

    alice, t = _seed(db, make_user(db, "s4@example.com", company_name="Acme"))

    issuer = IssuerCompany(name="City Council")
    db.add(issuer)
    db.flush()
    issued = IssuedTender(
        company_id=issuer.id, reference_number="SYS-77",
        title="Office cleaning contract",
        closing_date=date.today() + timedelta(days=20),
    )
    db.add(issued)
    db.commit()
    act_as(alice)

    readiness = client.get(f"/api/tenders/{t.id}/submission-readiness").json()
    assert readiness["source"] == "system"
    assert readiness["issued_tender_id"] == issued.id
    assert readiness["issuer_company"] == "City Council"

    res = client.post(f"/api/tenders/{t.id}/submit", json={"total_amount": 250000})
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["submitted"] is True
    assert body["issuer"] == "City Council"
    assert body["status"] == "Pending"
    assert body["documents_attached"] >= 0

    # The bidder's tender is now marked as submitted.
    after = client.get(f"/api/tenders/{t.id}/submission-readiness").json()
    assert after["already_submitted"] is True
    assert after["ready_to_submit"] is False

    # A second submission by the same bidder is refused.
    again = client.post(f"/api/tenders/{t.id}/submit", json={})
    assert again.status_code == 409


def test_overview_lists_every_live_tender(db, client, act_as):
    alice, t = _seed(db, make_user(db, "s5@example.com", company_name="Acme"))
    act_as(alice)

    res = client.get("/api/ai/submission-readiness")
    assert res.status_code == 200
    body = res.json()
    assert len(body["items"]) == 1
    item = body["items"][0]
    assert item["tender_id"] == t.id
    assert item["reference_number"] == "SYS-77"
    assert "score" in item and "checks" in item