"""
Submission readiness.

Before a bidder can send a bid we need certainty about three things:

  1. every document the tender requires is actually in hand,
  2. no compliance document has expired (or expires before the bid closes),
  3. the tender has not closed and the submission is allowed.

This module answers those questions deterministically from the bidder's own
data — no AI call — so the answer is instant, free, and never guesses. It also
decides whether the tender came from an issuer inside this system (submit
directly) or from outside (export a bundle).
"""
import io
import os
import zipfile
from datetime import date, datetime, timedelta
from typing import Any, Dict, List, Optional

import ai_module

# A compliance certificate must stay valid until the bid is submitted, so we
# require at least this many days of validity beyond the closing date.
MIN_CERTIFICATE_VALIDITY_DAYS = 7

STATUS_PASS = "pass"
STATUS_FAIL = "fail"
STATUS_WARN = "warn"


def _check(key: str, label: str, status: str, detail: str,
           blocking: bool = True, items: Optional[List[str]] = None) -> Dict[str, Any]:
    return {
        "key": key,
        "label": label,
        "status": status,
        "detail": detail,
        "blocking": blocking,
        "items": items or [],
    }


def resolve_issued_tender(db, tender) -> Optional[Any]:
    """Find the matching IssuedTender if this tender came from this system."""
    try:
        from database import IssuedTender
    except Exception:
        return None

    issued_id = getattr(tender, "issued_tender_id", None)
    if issued_id:
        return db.query(IssuedTender).filter(IssuedTender.id == issued_id).first()

    if not tender.reference_number:
        return None
    ref = str(tender.reference_number).strip().lower()
    if not ref:
        return None
    # Reference numbers are the one thing both sides always record.
    candidates = (
        db.query(IssuedTender)
        .filter(IssuedTender.reference_number.isnot(None))
        .all()
    )
    for it in candidates:
        if str(it.reference_number or "").strip().lower() == ref:
            try:
                tender.issued_tender_id = it.id
                db.commit()
            except Exception:
                db.rollback()
            return it
    return None


def _tender_documents(tender) -> List[Dict[str, Any]]:
    out = []
    for d in getattr(tender, "documents", []) or []:
        out.append({
            "id": d.id,
            "filename": d.filename,
            "original_filename": getattr(d, "original_filename", d.filename),
            "file_path": d.file_path,
            "file_type": d.file_type,
            "size": getattr(d, "file_size", None),
            "is_primary": bool(getattr(d, "is_primary", False)),
        })
    return out


def build_submission_readiness(
    db,
    tender,
    library_docs: List[Dict[str, Any]],
    generated_docs: List[Dict[str, Any]],
) -> Dict[str, Any]:
    """Full, deterministic submission-readiness assessment for one tender."""
    today = date.today()
    checks: List[Dict[str, Any]] = []
    issued = resolve_issued_tender(db, tender)

    checklist = [
        {
            "name": c.name, "status": c.status, "category": c.category,
            "mandatory": c.mandatory, "description": c.description,
            "library_category": c.library_category,
            "linked_library_doc_id": c.linked_library_doc_id,
        }
        for c in tender.checklist_items
    ]
    pack = ai_module.build_document_pack(checklist, library_docs, generated_docs, [])

    # ---- 1. Tender documents uploaded -------------------------------------
    tender_docs = _tender_documents(tender)
    if not tender_docs:
        checks.append(_check(
            "tender_document", "Tender document", STATUS_FAIL,
            "No tender document has been uploaded, so the requirements cannot be verified.",
        ))
    else:
        checks.append(_check(
            "tender_document", "Tender document", STATUS_PASS,
            f"{len(tender_docs)} tender document(s) on file.",
        ))

    # ---- 2. Every required document in hand -------------------------------
    outstanding = [p for p in pack if p.get("status") in ("missing", "expired")]
    if not outstanding:
        checks.append(_check(
            "required_documents", "All required documents in hand", STATUS_PASS,
            "Every document this tender requires is available.",
        ))
    else:
        missing = [p["title"] for p in outstanding if p["status"] == "missing"]
        expired = [p["title"] for p in outstanding if p["status"] == "expired"]
        checks.append(_check(
            "required_documents", "All required documents in hand", STATUS_FAIL,
            f"{len(outstanding)} document(s) still outstanding.",
            items=missing + expired,
        ))

    # ---- 3. Certificate validity ------------------------------------------
    closing = tender.closing_date
    # Certificates must be valid through submission, so use the later of
    # closing date and today as the bar they have to clear.
    validity_bar = max([d for d in (closing, today) if d is not None], default=today)
    expiring, invalid = [], []
    for d in library_docs:
        if not d.get("expiry_date"):
            continue
        try:
            exp = datetime.strptime(str(d["expiry_date"])[:10], "%Y-%m-%d").date()
        except ValueError:
            continue
        days = (exp - validity_bar).days
        if days < 0:
            invalid.append(f"{d.get('name')} (expired {exp.isoformat()})")
        elif days <= 30:
            expiring.append(f"{d.get('name')} (expires in {days} day(s))")

    if invalid:
        checks.append(_check(
            "certificate_validity", "No expired certificates", STATUS_FAIL,
            f"{len(invalid)} certificate(s) have expired.",
            items=invalid,
        ))
    elif expiring:
        checks.append(_check(
            "certificate_validity", "No expired certificates", STATUS_WARN,
            f"{len(expiring)} certificate(s) expire soon - confirm they will still be valid on submission.",
            blocking=False, items=expiring,
        ))
    else:
        checks.append(_check(
            "certificate_validity", "No expired certificates", STATUS_PASS,
            "All dated certificates are valid beyond the closing date.",
        ))

    # ---- 4. Checklist completed ------------------------------------------
    if not checklist:
        checks.append(_check(
            "checklist", "Checklist completed", STATUS_WARN,
            "No checklist has been generated for this tender yet.",
            blocking=False,
        ))
    else:
        incomplete = [c["name"] for c in checklist if str(c.get("status", "")).lower() != "complete"]
        if incomplete:
            checks.append(_check(
                "checklist", "Checklist completed", STATUS_FAIL,
                f"{len(incomplete)} checklist item(s) not marked complete.",
                items=incomplete[:20],
            ))
        else:
            checks.append(_check(
                "checklist", "Checklist completed", STATUS_PASS,
                f"All {len(checklist)} checklist item(s) are complete.",
            ))

    # ---- 5. Submission still open ----------------------------------------
    if tender.closing_date and tender.closing_date < today:
        checks.append(_check(
            "closing_date", "Tender still open", STATUS_FAIL,
            f"The closing date ({tender.closing_date.isoformat()}) has passed.",
        ))
    elif tender.closing_date and (tender.closing_date - today).days <= 3:
        checks.append(_check(
            "closing_date", "Tender still open", STATUS_WARN,
            f"Closes in {(tender.closing_date - today).days} day(s) - submit now.",
            blocking=False,
        ))
    elif not tender.closing_date:
        checks.append(_check(
            "closing_date", "Tender still open", STATUS_WARN,
            "No closing date recorded for this tender.",
            blocking=False,
        ))
    else:
        checks.append(_check(
            "closing_date", "Tender still open", STATUS_PASS,
            f"Open for {(tender.closing_date - today).days} more day(s).",
        ))

    # ---- 6. Submission details -------------------------------------------
    sub = getattr(tender, "submission", None)
    if sub is not None:
        checks.append(_check(
            "already_submitted", "Not yet submitted", STATUS_FAIL,
            "This tender has already been submitted.",
        ))
    else:
        checks.append(_check(
            "already_submitted", "Not yet submitted", STATUS_PASS,
            "This tender has not been submitted yet.",
        ))

    blocking_failures = [c for c in checks if c["status"] == STATUS_FAIL and c["blocking"]]
    warnings = [c for c in checks if c["status"] == STATUS_WARN]

    passed = sum(1 for c in checks if c["status"] == STATUS_PASS)
    score = round(100 * passed / len(checks)) if checks else 0
    # Anything blocking keeps the score below 100 no matter how many pass.
    ready = not blocking_failures

    issuer_name = None
    if issued is not None:
        try:
            from database import IssuerCompany
            ic = db.query(IssuerCompany).filter(IssuerCompany.id == issued.company_id).first()
            issuer_name = ic.name if ic else None
        except Exception:
            issuer_name = None

    return {
        "tender_id": tender.id,
        "score": score,
        "ready_to_submit": ready,
        "checks": checks,
        "blocking_issues": [c["label"] for c in blocking_failures],
        "warnings": [c["label"] for c in warnings],
        "source": "system" if issued else "external",
        "issued_tender_id": issued.id if issued else None,
        "issued_tender_title": issued.title if issued else None,
        "issuer_company": issuer_name,
        "already_submitted": sub is not None,
        "documents": {
            "library": library_docs,
            "generated": generated_docs,
            "tender": tender_docs,
        },
        "pack": pack,
    }


# ---------------- Export bundle ----------------

def _safe_name(name: str) -> str:
    keep = "".join(c if c.isalnum() or c in " ._-()" else "_" for c in str(name or "file"))
    return (keep.strip() or "file")[:120]


def build_submission_bundle(
    readiness: Dict[str, Any],
    upload_dir: str,
    generated_contents: Dict[int, str],
    tender_reference: str,
    company_name: str,
) -> bytes:
    """Zip every file the bid needs, plus a manifest and the readiness report.

    Used when the tender was NOT issued through this system: the bidder gets a
    complete, ready-to-send pack instead of an in-app submission.
    """
    buf = io.BytesIO()
    ref = _safe_name(tender_reference or "tender")

    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
        used = set()

        def _unique(name: str) -> str:
            base, ext = os.path.splitext(name)
            candidate = name
            n = 1
            while candidate.lower() in used:
                n += 1
                candidate = f"{base} ({n}){ext}"
            used.add(candidate.lower())
            return candidate

        # 1. Compliance certificates from the library.
        for d in readiness.get("documents", {}).get("library", []):
            path = d.get("file_path")
            if not path:
                continue
            full = os.path.join(upload_dir, path)
            if os.path.isfile(full):
                # Prefer the real filename so the archive keeps file extensions.
                label = d.get("filename") or d.get("name") or os.path.basename(path)
                zf.write(full, _unique(f"1_compliance/{_safe_name(label)}"))

        # 2. Tender document, for reference.
        for d in readiness.get("documents", {}).get("tender", []):
            path = d.get("file_path")
            if not path:
                continue
            full = os.path.join(upload_dir, path)
            if os.path.isfile(full):
                zf.write(full, _unique(f"2_tender_document/{_safe_name(d.get('original_filename') or path)}"))

        # 3. Documents the AI wrote for this bid.
        for g in readiness.get("documents", {}).get("generated", []):
            content = generated_contents.get(g.get("id"))
            if not content:
                continue
            name = _safe_name(g.get("title") or g.get("doc_type") or "document")
            if not name.lower().endswith(".txt"):
                name += ".txt"
            zf.writestr(_unique(f"3_bid_documents/{name}"), content)

        # 4. A manifest the bidder can check at a glance.
        lines = [
            "SUBMISSION BUNDLE",
            "=" * 60,
            f"Tender reference : {tender_reference}",
            f"Prepared for     : {company_name}",
            f"Prepared on      : {datetime.utcnow().strftime('%Y-%m-%d %H:%M')} UTC",
            f"Readiness score  : {readiness.get('score')}%",
            f"Ready to submit  : {'YES' if readiness.get('ready_to_submit') else 'NO'}",
            "",
            "CHECKS",
            "-" * 60,
        ]
        for c in readiness.get("checks", []):
            mark = {"pass": "[ OK ]", "warn": "[WARN]", "fail": "[FAIL]"}.get(c["status"], "[????]")
            lines.append(f"{mark} {c['label']} - {c['detail']}")
            for item in c.get("items", []):
                lines.append(f"         - {item}")
        lines += ["", "DOCUMENTS IN THIS BUNDLE", "-" * 60]
        for d in readiness.get("documents", {}).get("library", []):
            lines.append(f"  compliance : {d.get('name')} [{d.get('status')}]")
        for g in readiness.get("documents", {}).get("generated", []):
            lines.append(f"  written    : {g.get('title')}")
        lines += ["", f"Submit this bundle to the issuing authority as instructed for {ref}."]
        zf.writestr("0_MANIFEST.txt", "\n".join(lines))

    return buf.getvalue()