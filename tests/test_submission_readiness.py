"""Submission readiness: the gate that decides whether a bid can be sent.

These checks are the difference between "looks ready" and "is actually ready",
so each one is pinned here: every required document held, no expired
certificates, checklist complete, tender still open, and the right submit
route chosen for an in-system versus external issuer.
"""
import io
import os
import zipfile
from datetime import date, timedelta

import submission as sub

from tests.conftest import make_company, make_tender, make_user


TODAY = date.today()


def _lib(cat, name=None, expiry=None, status="Active"):
    return {
        "id": abs(hash(cat)) % 10000, "name": name or f"{cat} certificate",
        "category": cat, "expiry_date": expiry, "status": status,
        "file_path": f"{cat.lower()}.pdf", "filename": f"{cat.lower()}.pdf",
    }


REQUIRED_CATEGORIES = ["CIPC", "B-BBEE", "SARS", "PSIRA"]


def _add_checklist(db, tender, user, categories=None, complete=True):
    """The compliance items a bid must satisfy (mirrors the default checklist)."""
    from database import ChecklistItem

    for cat in (categories if categories is not None else REQUIRED_CATEGORIES):
        db.add(ChecklistItem(
            tender_id=tender.id, name=f"{cat} documents", category="Compliance",
            mandatory=True, description=f"Valid {cat} certificate",
            library_category=cat,
            status="Complete" if complete else "Outstanding",
        ))
    db.commit()
    db.refresh(tender)
    return tender


def _add_tender_doc(db, tender, user):
    from database import TenderDocument

    db.add(TenderDocument(
        tender_id=tender.id, filename="tender.pdf", original_filename="tender.pdf",
        file_path="tender.pdf", file_type="pdf",
    ))
    db.commit()
    db.refresh(tender)
    return tender


def test_not_ready_when_required_documents_are_missing(db):
    alice = make_user(db, "s1@example.com", company_name="Acme")
    make_company(db, "Acme", alice)
    t = make_tender(db, alice, ref="R-1", title="Cleaning", closing_date=TODAY + timedelta(days=20))
    _add_checklist(db, t, alice)
    _add_tender_doc(db, t, alice)

    # No library documents at all -> every compliance item is missing.
    res = sub.build_submission_readiness(db, t, [], [])

    assert res["ready_to_submit"] is False
    assert res["score"] < 100
    failed = [c for c in res["checks"] if c["key"] == "required_documents"][0]
    assert failed["status"] == "fail"
    assert "CIPC documents" in failed["items"]


def test_ready_when_everything_is_in_place(db):
    alice = make_user(db, "s2@example.com", company_name="Acme")
    make_company(db, "Acme", alice)
    t = make_tender(db, alice, ref="R-2", title="Cleaning",
                    closing_date=TODAY + timedelta(days=20))
    _add_checklist(db, t, alice)
    _add_tender_doc(db, t, alice)

    library = [_lib(cat, name=f"{cat} documents") for cat in REQUIRED_CATEGORIES]
    res = sub.build_submission_readiness(db, t, library, [])

    assert res["ready_to_submit"] is True, res["blocking_issues"]
    assert res["score"] == 100
    assert all(c["status"] == "pass" for c in res["checks"])


def test_incomplete_checklist_blocks_submission(db):
    alice = make_user(db, "s10@example.com", company_name="Acme")
    make_company(db, "Acme", alice)
    t = make_tender(db, alice, ref="R-10", closing_date=TODAY + timedelta(days=20))
    _add_checklist(db, t, alice, complete=False)
    _add_tender_doc(db, t, alice)
    library = [_lib(cat, name=f"{cat} documents") for cat in REQUIRED_CATEGORIES]

    res = sub.build_submission_readiness(db, t, library, [])
    cl = [c for c in res["checks"] if c["key"] == "checklist"][0]
    assert cl["status"] == "fail"
    assert res["ready_to_submit"] is False


def test_expired_certificate_blocks_submission(db):
    alice = make_user(db, "s3@example.com", company_name="Acme")
    make_company(db, "Acme", alice)
    t = make_tender(db, alice, ref="R-3", closing_date=TODAY + timedelta(days=10))
    _add_checklist(db, t, alice)
    _add_tender_doc(db, t, alice)

    library = [
        _lib(cat, name=f"{cat} documents",
             expiry=(TODAY - timedelta(days=5)).isoformat(), status="Expired")
        if cat == "CIPC" else _lib(cat, name=f"{cat} documents")
        for cat in REQUIRED_CATEGORIES
    ]

    res = sub.build_submission_readiness(db, t, library, [])

    cert = [c for c in res["checks"] if c["key"] == "certificate_validity"][0]
    assert cert["status"] == "fail"
    assert res["ready_to_submit"] is False


def test_certificate_expiring_soon_is_a_warning_not_a_blocker(db):
    alice = make_user(db, "s4@example.com", company_name="Acme")
    make_company(db, "Acme", alice)
    t = make_tender(db, alice, ref="R-4", closing_date=TODAY + timedelta(days=2))
    library = [{"id": 1, "name": "B-BBEE", "category": "B-BBEE",
                "expiry_date": (TODAY + timedelta(days=10)).isoformat(),
                "status": "Expiring Soon", "file_path": "b.pdf", "filename": "b.pdf"}]
    res = sub.build_submission_readiness(db, t, library, [])
    cert = [c for c in res["checks"] if c["key"] == "certificate_validity"][0]
    assert cert["status"] == "warn"
    assert cert["blocking"] is False


def test_closed_tender_cannot_be_submitted(db):
    alice = make_user(db, "s5@example.com", company_name="Acme")
    make_company(db, "Acme", alice)
    t = make_tender(db, alice, ref="R-5", closing_date=TODAY - timedelta(days=2))
    res = sub.build_submission_readiness(db, t, [], [])
    closing = [c for c in res["checks"] if c["key"] == "closing_date"][0]
    assert closing["status"] == "fail"
    assert res["ready_to_submit"] is False


def test_missing_tender_document_is_flagged(db):
    alice = make_user(db, "s6@example.com", company_name="Acme")
    make_company(db, "Acme", alice)
    t = make_tender(db, alice, ref="R-6", closing_date=TODAY + timedelta(days=30))
    res = sub.build_submission_readiness(db, t, [], [])
    td = [c for c in res["checks"] if c["key"] == "tender_document"][0]
    assert td["status"] == "fail"


def test_external_tender_is_routed_to_the_bundle(db):
    alice = make_user(db, "s7@example.com", company_name="Acme")
    make_company(db, "Acme", alice)
    t = make_tender(db, alice, ref="NOT-IN-SYSTEM", closing_date=TODAY + timedelta(days=30))
    res = sub.build_submission_readiness(db, t, [], [])
    assert res["source"] == "external"
    assert res["issued_tender_id"] is None


def test_tender_from_this_system_is_detected_by_reference(db):
    from database import IssuerCompany, IssuedTender

    alice = make_user(db, "s8@example.com", company_name="Acme")
    make_company(db, "Acme", alice)

    issuer = IssuerCompany(name="City Council", created_by=None)
    db.add(issuer)
    db.flush()
    issued = IssuedTender(
        company_id=issuer.id, reference_number="SYS-9", title="Cleaning contract",
        closing_date=TODAY + timedelta(days=10),
    )
    db.add(issued)
    db.commit()

    t = make_tender(db, alice, ref="SYS-9", title="Cleaning contract",
                    closing_date=TODAY + timedelta(days=10))
    res = sub.build_submission_readiness(db, t, [], [])

    assert res["source"] == "system"
    assert res["issued_tender_id"] == issued.id
    assert res["issuer_company"] == "City Council"
    # The link is remembered so we do not have to match again.
    assert t.issued_tender_id == issued.id


def test_bundle_contains_manifest_certificates_and_written_docs(db, tmp_path):
    alice = make_user(db, "s9@example.com", company_name="Acme")
    make_company(db, "Acme", alice)
    t = make_tender(db, alice, ref="B-1", closing_date=TODAY + timedelta(days=15))

    # A real file on disk so it can be zipped.
    cert = tmp_path / "bbbee.pdf"
    cert.write_bytes(b"%PDF-1.4 fake certificate")

    readiness = {
        "score": 100, "ready_to_submit": True,
        "checks": [{"label": "All required documents in hand", "status": "pass",
                    "detail": "ok", "items": []}],
        "documents": {
            "library": [{"id": 1, "name": "B-BBEE Level 2", "category": "B-BBEE",
                         "status": "Active", "file_path": "bbbee.pdf", "filename": "bbbee.pdf"}],
            "tender": [],
            "generated": [{"id": 5, "title": "Method Statement", "doc_type": "method_statement"}],
        },
    }
    data = sub.build_submission_bundle(
        readiness, str(tmp_path), {5: "METHOD STATEMENT CONTENT"},
        "B-1", "Acme",
    )

    zf = zipfile.ZipFile(io.BytesIO(data))
    names = zf.namelist()
    assert "0_MANIFEST.txt" in names
    assert any(n.endswith("bbbee.pdf") for n in names)
    written = [n for n in names if n.startswith("3_bid_documents/")]
    assert written, names
    assert "METHOD STATEMENT CONTENT" in zf.read(written[0]).decode("utf-8")
    manifest = zf.read("0_MANIFEST.txt").decode("utf-8")
    assert "B-1" in manifest
    assert "Ready to submit  : YES" in manifest