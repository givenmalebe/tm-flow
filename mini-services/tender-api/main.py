"""
TM Flow - Main FastAPI Application
Tender Management System API
"""
import os
import json
import shutil
import uuid
import threading
from datetime import datetime, date, timedelta
from typing import List, Optional, Any
from pathlib import Path

from fastapi import FastAPI, Depends, HTTPException, Request, UploadFile, File, Form, Query, Header
from fastapi.responses import Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, EmailStr, Field
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import or_, and_, desc, asc

from database import (
    Base, engine, get_db, init_db, SessionLocal,
    User, Tender, TenderDocument, ChecklistItem, LibraryDocument,
    Briefing, PricingVersion, Submission, Communication, Addendum, ReminderSetting,
    CompanyProfile, GeneratedDocument,
    IssuerCompany, CompanyMember, IssuedTender, Bid, BidDocument,
    BidderCompany, BidderMember
)
from auth import get_current_user
import ai_module

# Initialize DB on import
init_db()

# Upload directory
UPLOAD_DIR = os.environ.get(
    "UPLOAD_DIR", os.path.join(os.environ.get("DATA_DIR", os.path.dirname(__file__)), "uploads")
)
os.makedirs(UPLOAD_DIR, exist_ok=True)
os.makedirs(UPLOAD_DIR, exist_ok=True)

app = FastAPI(title="TM Flow API", version="1.0.0")

# CORS - allow the Next.js frontend (and preview origin)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Serve uploaded files
# Uploaded documents are served from Firebase Storage (see fire_store), falling
# back to the container disk for anything still stored locally.
@app.get("/uploads/{file_path:path}")
def serve_upload(file_path: str):
    found = _read_uploaded(file_path)
    if not found:
        raise HTTPException(status_code=404, detail="File not found")
    content, ctype = found
    return Response(content=content, media_type=ctype)

# Available tender statuses
TENDER_STATUSES = [
    "New Opportunity", "Under Review", "Interested", "Not Interested",
    "Preparing", "Documents Outstanding", "Pricing in Progress",
    "Awaiting Information", "Ready for Submission", "Submitted",
    "Clarification Requested", "Clarification Submitted", "Shortlisted",
    "Interview/Presentation", "Negotiation", "Awarded", "Unsuccessful",
    "Cancelled", "Withdrawn", "Expired",
]

CHECKLIST_CATEGORIES = [
    "Company profile", "CIPC documents", "SARS documents",
    "B-BBEE certificate/affidavit", "PSIRA documents", "COIDA",
    "Financial statements", "References", "Organogram", "Methodology",
    "Risk assessment", "SOPs", "POPIA documents", "Signed declarations",
    "Pricing schedule", "Technical proposal", "Forms required by the client",
    "Other tender-specific documents",
]

LIBRARY_CATEGORIES = [
    "CIPC", "SARS", "B-BBEE", "PSIRA", "COIDA", "Financial statements",
    "Company profile", "References", "Policies", "Certificates",
    "Insurance documents", "Organograms", "Standard declarations",
    "Standard methodologies", "Standard SOPs", "Other",
]


# ---------------------- Pydantic Schemas ----------------------

class UserCreate(BaseModel):
    email: EmailStr
    full_name: str
    company_name: Optional[str] = None
    account_type: Optional[str] = "applicant"  # applicant / issuer
    password: str = Field(min_length=6)


class UserLogin(BaseModel):
    email: EmailStr
    password: str


class UserOut(BaseModel):
    id: int
    email: str
    full_name: str
    company_name: Optional[str]
    role: str
    account_type: str = "applicant"
    onboarding_completed: bool = False
    class Config:
        from_attributes = True


class TokenOut(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserOut


# ---- Tender ----
class TenderBase(BaseModel):
    reference_number: str
    title: str
    client_company: str
    description: Optional[str] = None
    scope_of_work: Optional[str] = None
    category: Optional[str] = None
    location_site: Optional[str] = None
    issue_date: Optional[date] = None
    closing_date: Optional[date] = None
    closing_time: Optional[str] = None  # "HH:MM"
    validity_period: Optional[str] = None
    estimated_value: Optional[float] = None
    contract_period: Optional[str] = None
    status: str = "New Opportunity"
    contact_person: Optional[str] = None
    contact_email: Optional[str] = None
    contact_telephone: Optional[str] = None
    submission_method: Optional[str] = None
    person_responsible: Optional[str] = None
    notes: Optional[str] = None
    outcome: Optional[str] = None
    unsuccessful_reason: Optional[str] = None


class TenderCreate(TenderBase):
    pass


class TenderUpdate(BaseModel):
    reference_number: Optional[str] = None
    title: Optional[str] = None
    client_company: Optional[str] = None
    description: Optional[str] = None
    scope_of_work: Optional[str] = None
    category: Optional[str] = None
    location_site: Optional[str] = None
    issue_date: Optional[date] = None
    closing_date: Optional[date] = None
    closing_time: Optional[str] = None
    validity_period: Optional[str] = None
    estimated_value: Optional[float] = None
    contract_period: Optional[str] = None
    status: Optional[str] = None
    contact_person: Optional[str] = None
    contact_email: Optional[str] = None
    contact_telephone: Optional[str] = None
    submission_method: Optional[str] = None
    person_responsible: Optional[str] = None
    notes: Optional[str] = None
    outcome: Optional[str] = None
    unsuccessful_reason: Optional[str] = None


class TenderOut(TenderBase):
    id: int
    created_at: datetime
    updated_at: Optional[datetime] = None
    ai_extracted_info: Optional[Any] = None
    ai_summary: Optional[str] = None
    documents: List[Any] = []
    checklist_items: List[Any] = []
    briefings: List[Any] = []
    pricing_versions: List[Any] = []
    submission: Optional[Any] = None
    communications: List[Any] = []
    addendums: List[Any] = []

    class Config:
        from_attributes = True


# ---- Checklist ----
class ChecklistItemBase(BaseModel):
    name: str
    description: Optional[str] = None
    status: str = "Outstanding"
    linked_library_doc_id: Optional[int] = None
    notes: Optional[str] = None


class ChecklistItemCreate(ChecklistItemBase):
    tender_id: int


class ChecklistItemUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    category: Optional[str] = None
    mandatory: Optional[bool] = None
    library_category: Optional[str] = None
    status: Optional[str] = None
    linked_library_doc_id: Optional[int] = None
    notes: Optional[str] = None


# ---- Library Document ----
class LibraryDocumentBase(BaseModel):
    name: str
    category: str
    description: Optional[str] = None
    issue_date: Optional[date] = None
    expiry_date: Optional[date] = None
    notes: Optional[str] = None


class LibraryDocumentOut(LibraryDocumentBase):
    id: int
    filename: str
    file_size: Optional[int] = None
    uploaded_at: datetime
    class Config:
        from_attributes = True


# ---- Briefing ----
class BriefingBase(BaseModel):
    briefing_type: str = "Briefing"
    date: date
    time: Optional[str] = None
    location: Optional[str] = None
    contact_person: Optional[str] = None
    attendance_required: bool = True
    attendance_confirmed: bool = False
    person_attending: Optional[str] = None
    notes: Optional[str] = None


class BriefingCreate(BriefingBase):
    tender_id: int


class BriefingUpdate(BaseModel):
    briefing_type: Optional[str] = None
    date: Optional[date] = None
    time: Optional[str] = None
    location: Optional[str] = None
    contact_person: Optional[str] = None
    attendance_required: Optional[bool] = None
    attendance_confirmed: Optional[bool] = None
    person_attending: Optional[str] = None
    notes: Optional[str] = None


# ---- Pricing ----
class PricingLineItem(BaseModel):
    category: str = "Labour"
    description: str = ""
    quantity: float = 1
    rate: float = 0
    total: float = 0


class PricingVersionCreate(BaseModel):
    tender_id: int
    version_label: Optional[str] = None
    line_items: List[PricingLineItem] = []
    notes: Optional[str] = None


class PricingVersionOut(BaseModel):
    id: int
    tender_id: int
    version_number: int
    version_label: Optional[str]
    line_items: Optional[Any]
    subtotal: float
    vat: float
    total: float
    notes: Optional[str]
    created_at: datetime
    class Config:
        from_attributes = True


# ---- Submission ----
class SubmissionBase(BaseModel):
    submission_date: Optional[date] = None
    submission_time: Optional[str] = None
    submission_method: Optional[str] = None
    submitted_by: Optional[str] = None
    confirmation_reference: Optional[str] = None
    final_pricing: Optional[float] = None
    notes: Optional[str] = None


class SubmissionCreate(SubmissionBase):
    tender_id: int


class SubmissionUpdate(SubmissionBase):
    pass


# ---- Communication ----
class CommunicationBase(BaseModel):
    comm_type: str
    subject: Optional[str] = None
    body: Optional[str] = None
    comm_date: Optional[datetime] = None
    meeting_date: Optional[datetime] = None
    meeting_location: Optional[str] = None
    from_party: Optional[str] = None
    to_party: Optional[str] = None
    notes: Optional[str] = None


class CommunicationCreate(CommunicationBase):
    tender_id: int


# ---- Addendum ----
class AddendumBase(BaseModel):
    addendum_number: Optional[str] = None
    title: str
    description: Optional[str] = None
    issued_date: Optional[date] = None


class AddendumCreate(AddendumBase):
    tender_id: int


# ---- AI ----
class AIQuestion(BaseModel):
    question: str
    tender_id: Optional[int] = None


# ---------------------- Helpers ----------------------

def _serialize_tender(t: Tender) -> dict:
    """Serialize a Tender ORM object to dict (for API output)."""
    return {
        "id": t.id,
        "reference_number": t.reference_number,
        "title": t.title,
        "client_company": t.client_company,
        "description": t.description,
        "scope_of_work": t.scope_of_work,
        "category": t.category,
        "location_site": t.location_site,
        "issue_date": t.issue_date.isoformat() if t.issue_date else None,
        "closing_date": t.closing_date.isoformat() if t.closing_date else None,
        "closing_time": t.closing_time.strftime("%H:%M") if t.closing_time else None,
        "validity_period": t.validity_period,
        "estimated_value": t.estimated_value,
        "contract_period": t.contract_period,
        "status": t.status,
        "contact_person": t.contact_person,
        "contact_email": t.contact_email,
        "contact_telephone": t.contact_telephone,
        "submission_method": t.submission_method,
        "person_responsible": t.person_responsible,
        "notes": t.notes,
        "outcome": t.outcome,
        "unsuccessful_reason": t.unsuccessful_reason,
        "created_at": t.created_at.isoformat() if t.created_at else None,
        "updated_at": t.updated_at.isoformat() if t.updated_at else None,
        "ai_extracted_info": t.ai_extracted_info,
        "ai_summary": t.ai_summary,
        "documents": [
            {
                "id": d.id, "filename": d.original_filename,
                "file_type": d.file_type, "file_size": d.file_size,
                "uploaded_at": d.uploaded_at.isoformat() if d.uploaded_at else None,
                "is_primary": d.is_primary,
            } for d in t.documents
        ],
        "checklist_items": [
            {
                "id": c.id, "name": c.name, "description": c.description,
                "category": c.category, "mandatory": c.mandatory,
                "library_category": c.library_category,
                "status": c.status, "notes": c.notes,
                "linked_library_doc_id": c.linked_library_doc_id,
            } for c in t.checklist_items
        ],
        "briefings": [
            {
                "id": b.id, "briefing_type": b.briefing_type,
                "date": b.date.isoformat() if b.date else None,
                "time": b.time.strftime("%H:%M") if b.time else None,
                "location": b.location, "contact_person": b.contact_person,
                "attendance_required": b.attendance_required,
                "attendance_confirmed": b.attendance_confirmed,
                "person_attending": b.person_attending,
                "certificate_path": b.certificate_path,
                "certificate_url": f"/uploads/{b.certificate_path}?XTransformPort=8000" if b.certificate_path else None,
                "notes": b.notes,
            } for b in t.briefings
        ],
        "pricing_versions": [
            {
                "id": p.id, "version_number": p.version_number,
                "version_label": p.version_label,
                "line_items": p.line_items,
                "subtotal": p.subtotal, "vat": p.vat, "total": p.total,
                "notes": p.notes,
                "created_at": p.created_at.isoformat() if p.created_at else None,
            } for p in t.pricing_versions
        ],
        "submission": (
            {
                "id": t.submission.id,
                "submission_date": t.submission.submission_date.isoformat() if t.submission.submission_date else None,
                "submission_time": t.submission.submission_time.strftime("%H:%M") if t.submission.submission_time else None,
                "submission_method": t.submission.submission_method,
                "submitted_by": t.submission.submitted_by,
                "confirmation_reference": t.submission.confirmation_reference,
                "confirmation_file_path": t.submission.confirmation_file_path,
                "confirmation_file_url": f"/uploads/{t.submission.confirmation_file_path}?XTransformPort=8000" if t.submission.confirmation_file_path else None,
                "final_documents_path": t.submission.final_documents_path,
                "final_documents_url": f"/uploads/{t.submission.final_documents_path}?XTransformPort=8000" if t.submission.final_documents_path else None,
                "final_pricing": t.submission.final_pricing,
                "notes": t.submission.notes,
            } if t.submission else None
        ),
        "communications": [
            {
                "id": c.id, "comm_type": c.comm_type, "subject": c.subject,
                "body": c.body,
                "comm_date": c.comm_date.isoformat() if c.comm_date else None,
                "meeting_date": c.meeting_date.isoformat() if c.meeting_date else None,
                "meeting_location": c.meeting_location,
                "from_party": c.from_party, "to_party": c.to_party,
                "attachment_path": c.attachment_path,
                "attachment_url": f"/uploads/{c.attachment_path}?XTransformPort=8000" if c.attachment_path else None,
                "attachment_filename": c.attachment_original_filename,
                "notes": c.notes,
            } for c in t.communications
        ],
        "addendums": [
            {
                "id": a.id, "addendum_number": a.addendum_number,
                "title": a.title, "description": a.description,
                "issued_date": a.issued_date.isoformat() if a.issued_date else None,
                "ai_changes": a.ai_changes,
                "created_at": a.created_at.isoformat() if a.created_at else None,
            } for a in t.addendums
        ],
        "generated_documents": [
            {
                "id": g.id, "doc_type": g.doc_type, "title": g.title,
                "content": g.content, "table_of_contents": g.table_of_contents,
                "created_at": g.created_at.isoformat() if g.created_at else None,
                "updated_at": g.updated_at.isoformat() if g.updated_at else None,
            } for g in t.generated_documents
        ],
    }


def _parse_time(s: Optional[str]):
    if not s:
        return None
    try:
        return datetime.strptime(s, "%H:%M").time()
    except Exception:
        return None


def _parse_datetime(s: Optional[str]):
    if not s:
        return None
    try:
        return datetime.fromisoformat(s.replace("Z", "+00:00"))
    except Exception:
        return None


def _save_upload(upload: UploadFile, subdir: str = "") -> str:
    """Save an uploaded file to Firebase Storage and return its reference.

    Falls back to the container's disk if the bucket is unreachable, so an
    upload is never lost outright.
    """
    import fire_store

    return fire_store.save_fileobj(
        upload.file,
        upload.filename or "upload",
        subdir,
        content_type=getattr(upload, "content_type", None),
    )


def _read_uploaded(reference: str):
    """Read a stored upload back as (bytes, content_type)."""
    import fire_store

    return fire_store.read_bytes(reference)


def _upload_local_path(reference: str) -> Optional[str]:
    """Materialise a stored upload on local disk so file-based libraries (PDF
    extraction, zip bundling) can open it. Returns None if it cannot be written."""
    found = _read_uploaded(reference)
    if not found:
        return None
    content, _ctype = found
    cache_dir = os.path.join(UPLOAD_DIR, "_cache")
    os.makedirs(cache_dir, exist_ok=True)
    target = os.path.join(cache_dir, os.path.basename(reference.replace("gs://", "")) or "file")
    with open(target, "wb") as fh:
        fh.write(content)
    return target


def _upload_size(reference: str) -> Optional[int]:
    found = _read_uploaded(reference)
    return len(found[0]) if found else None


def _build_default_checklist(tender_id: int, db: Session):
    """Create default checklist items for a tender."""
    for name in CHECKLIST_CATEGORIES:
        db.add(ChecklistItem(tender_id=tender_id, name=name, status="Outstanding"))


def _auto_link_library_doc(item: ChecklistItem, db: Session):
    """
    Auto-link a checklist item to a matching compliance library document.
    Sets status to Complete if a valid library doc exists, Expired if the doc is expired.
    """
    if not item.library_category:
        return
    # Find matching library docs by category
    today = date.today()
    matching_docs = db.query(LibraryDocument).filter(
        LibraryDocument.category == item.library_category
    ).all()
    if not matching_docs:
        return
    # Prefer non-expired docs, then the most recently uploaded
    best_doc = None
    best_is_expired = False
    for d in matching_docs:
        if d.expiry_date:
            is_expired = d.expiry_date < today
            if not is_expired and not best_is_expired:
                best_doc = d
                best_is_expired = False
            elif is_expired and best_doc is None:
                best_doc = d
                best_is_expired = True
        else:
            # No expiry = always valid
            if not best_is_expired:
                best_doc = d
                best_is_expired = False
    if best_doc:
        item.linked_library_doc_id = best_doc.id
        item.status = "Expired" if best_is_expired else "Complete"


def _checklist_from_extracted(tender_id: int, extracted: dict, db: Session):
    """
    Create a tender-specific checklist using AI generation.
    Falls back to default categories + compulsory documents if AI generation fails.
    Auto-links each item to a matching compliance library document and sets status.
    """
    # Try AI-generated checklist first
    ai_items = []
    if extracted and not extracted.get("_error"):
        try:
            ai_items = ai_module.generate_tender_checklist(extracted)
        except Exception:
            ai_items = []

    if ai_items:
        # Use AI-generated items
        for item_data in ai_items:
            item = ChecklistItem(
                tender_id=tender_id,
                name=item_data["name"],
                description=item_data.get("description"),
                category=item_data.get("category", "Other"),
                mandatory=item_data.get("mandatory", True),
                library_category=item_data.get("library_category"),
                status="Outstanding",
            )
            _auto_link_library_doc(item, db)
            db.add(item)
    else:
        # Fallback: default categories + compulsory documents + suggestions
        compulsory = extracted.get("compulsory_documents", []) if extracted else []
        suggestions = extracted.get("checklist_suggestions", []) if extracted else []
        combined = list(dict.fromkeys(CHECKLIST_CATEGORIES + compulsory + suggestions))
        for name in combined:
            item = ChecklistItem(
                tender_id=tender_id,
                name=name[:500],
                status="Outstanding",
                category="Compliance",
                mandatory=True,
            )
            # Try to match a library category by name
            name_lower = name.lower()
            lib_cat_map = {
                "cipc": "CIPC", "sars": "SARS", "b-bbee": "B-BBEE", "bbbee": "B-BBEE",
                "psira": "PSIRA", "coida": "COIDA", "financial": "Financial statements",
                "company profile": "Company profile", "references": "References",
                "organogram": "Organograms", "methodology": "Standard methodologies",
                "sop": "Standard SOPs", "declaration": "Standard declarations",
            }
            for key, cat in lib_cat_map.items():
                if key in name_lower:
                    item.library_category = cat
                    break
            _auto_link_library_doc(item, db)
            db.add(item)


def _regenerate_checklist(tender_id: int, db: Session):
    """
    Delete the existing checklist and regenerate it from the tender's AI-extracted info.
    Used when the user wants to re-run checklist generation after updating extraction.
    """
    db.query(ChecklistItem).filter(ChecklistItem.tender_id == tender_id).delete()
    tender = db.query(Tender).filter(Tender.id == tender_id).first()
    if tender and tender.ai_extracted_info:
        _checklist_from_extracted(tender_id, tender.ai_extracted_info, db)
    else:
        _build_default_checklist(tender_id, db)
    db.flush()


# ---------------------- Auth Routes ----------------------
#
# Signup and signin are owned by Firebase Auth (see auth.py). These routes are
# retained so existing tooling that still posts here gets a clear signal rather
# than a 422, and so /auth/me keeps working: it accepts the Firebase ID token
# that auth-context.tsx sends.


@app.post("/api/auth/register", response_model=TokenOut)
def register(payload: UserCreate):
    raise HTTPException(
        status_code=410,
        detail="Registration moved to Firebase Auth. Create the account in the client SDK.",
    )


@app.post("/api/auth/login", response_model=TokenOut)
def login(payload: UserLogin):
    raise HTTPException(
        status_code=410,
        detail="Sign-in moved to Firebase Auth. Use signInWithEmailAndPassword.",
    )


@app.get("/api/auth/me", response_model=UserOut)
def me(user: User = Depends(get_current_user)):
    return user


@app.post("/api/auth/complete-onboarding")
def complete_onboarding(
    payload: dict,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Complete the onboarding process — saves company profile and marks onboarding as done."""
    # Update user's company name
    if payload.get("company_name"):
        user.company_name = payload["company_name"]

    # Declaring how the organisation uses the platform: it bids for work, or it
    # issues tenders. Without this every account defaulted to "applicant" and
    # the issuer portal could never be reached.
    requested_type = str(payload.get("account_type") or "").strip().lower()
    if requested_type in ("issuer", "applicant"):
        user.account_type = requested_type

    user.onboarding_completed = True
    db.commit()
    db.refresh(user)

    # Bidder companies are bootstrapped here; issuer accounts get their issuing
    # scope from /api/issuer/register-company instead.
    try:
        import ai_agent
        ai_agent.ensure_company_bootstrap(db, user)
    except Exception:
        pass
    return {"onboarding_completed": True, "user": UserOut.model_validate(user).model_dump()}


@app.post("/api/auth/account-type")
def set_account_type(
    payload: dict,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Record how this organisation uses the platform: bidder or issuer.

    Called straight after Firebase sign-up, because the backend user row is
    created on the first authenticated request and would otherwise always be
    an applicant — leaving the issuer portal unreachable.
    """
    requested = str((payload or {}).get("account_type") or "").strip().lower()
    if requested not in ("issuer", "applicant"):
        raise HTTPException(
            status_code=400, detail="account_type must be 'applicant' or 'issuer'"
        )
    if user.account_type != requested:
        user.account_type = requested
        db.commit()
        db.refresh(user)
    return {"account_type": user.account_type, "user": UserOut.model_validate(user).model_dump()}


@app.post("/api/company-profile/company-profile-doc")
async def upload_company_profile_doc(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Upload the company profile document (PDF/DOCX). The AI uses it when generating company profile documents."""
    rel_path = _save_upload(file, subdir="company")
    profile = db.query(CompanyProfile).filter(CompanyProfile.user_id == user.id).first()
    if not profile:
        profile = CompanyProfile(
            user_id=user.id,
            company_name=user.company_name or user.full_name,
            company_profile_doc_path=rel_path,
        )
        db.add(profile)
    else:
        profile.company_profile_doc_path = rel_path
    db.commit()
    db.refresh(profile)
    return {
        "company_profile_doc_path": rel_path,
        "company_profile_doc_url": f"/uploads/{rel_path}?XTransformPort=8000",
    }


@app.delete("/api/company-profile/company-profile-doc")
def delete_company_profile_doc(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    """Remove the company profile document."""
    profile = db.query(CompanyProfile).filter(CompanyProfile.user_id == user.id).first()
    if not profile:
        raise HTTPException(status_code=404, detail="Company profile not found")
    if profile.company_profile_doc_path:
        full_path = os.path.join(UPLOAD_DIR, profile.company_profile_doc_path)
        if os.path.exists(full_path):
            try:
                os.unlink(full_path)
            except OSError:
                pass
        profile.company_profile_doc_path = None
    db.commit()
    return {"deleted": True}


# ---------------------- Tender Routes ----------------------

@app.get("/api/tenders")
def list_tenders(
    search: Optional[str] = None,
    status: Optional[str] = None,
    category: Optional[str] = None,
    person_responsible: Optional[str] = None,
    outcome: Optional[str] = None,
    location: Optional[str] = None,
    closing_date_from: Optional[str] = None,
    closing_date_to: Optional[str] = None,
    value_min: Optional[float] = None,
    value_max: Optional[float] = None,
    submission_date_from: Optional[str] = None,
    submission_date_to: Optional[str] = None,
    sort: str = "updated_at",
    order: str = "desc",
    skip: int = 0,
    limit: int = 200,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    q = db.query(Tender)
    # Company-aware: show tenders from all members of the same bidder company
    bidder_member = db.query(BidderMember).filter(
        BidderMember.user_id == user.id,
        BidderMember.status == "approved"
    ).first()
    if bidder_member:
        member_ids = _get_company_member_ids(db, bidder_member.company_id)
        q = q.filter(Tender.created_by.in_(member_ids))
    else:
        # No company membership — show only own tenders
        q = q.filter(Tender.created_by == user.id)
    # Text search across multiple fields
    if search:
        like = f"%{search}%"
        q = q.filter(or_(
            Tender.reference_number.ilike(like),
            Tender.title.ilike(like),
            Tender.client_company.ilike(like),
            Tender.location_site.ilike(like),
            Tender.person_responsible.ilike(like),
        ))
    # Exact filters
    if status:
        q = q.filter(Tender.status == status)
    if category:
        q = q.filter(Tender.category == category)
    if person_responsible:
        q = q.filter(Tender.person_responsible == person_responsible)
    if outcome:
        q = q.filter(Tender.outcome == outcome)
    # Location filter (partial match)
    if location:
        q = q.filter(Tender.location_site.ilike(f"%{location}%"))
    # Closing date range
    if closing_date_from:
        try:
            q = q.filter(Tender.closing_date >= date.fromisoformat(closing_date_from))
        except ValueError:
            pass
    if closing_date_to:
        try:
            q = q.filter(Tender.closing_date <= date.fromisoformat(closing_date_to))
        except ValueError:
            pass
    # Value range
    if value_min is not None:
        q = q.filter(Tender.estimated_value >= value_min)
    if value_max is not None:
        q = q.filter(Tender.estimated_value <= value_max)
    # Submission date range (filter tenders that have a submission)
    if submission_date_from or submission_date_to:
        from sqlalchemy import select as sa_select
        # Join with Submission table
        q = q.outerjoin(Submission, Submission.tender_id == Tender.id)
        if submission_date_from:
            try:
                q = q.filter(Submission.submission_date >= date.fromisoformat(submission_date_from))
            except ValueError:
                pass
        if submission_date_to:
            try:
                q = q.filter(Submission.submission_date <= date.fromisoformat(submission_date_to))
            except ValueError:
                pass
    # Sorting
    sort_col = {
        "updated_at": Tender.updated_at,
        "created_at": Tender.created_at,
        "closing_date": Tender.closing_date,
        "estimated_value": Tender.estimated_value,
        "reference_number": Tender.reference_number,
        "title": Tender.title,
        "client_company": Tender.client_company,
        "location_site": Tender.location_site,
        "category": Tender.category,
        "person_responsible": Tender.person_responsible,
    }.get(sort, Tender.updated_at)
    q = q.order_by(asc(sort_col) if order == "asc" else desc(sort_col))
    q = q.distinct()  # Avoid duplicates from outerjoin
    total = q.count()
    tenders = q.offset(skip).limit(limit).all()
    return {"items": [_serialize_tender(t) for t in tenders], "total": total}


@app.post("/api/tenders")
def create_tender(payload: TenderCreate, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    t = Tender(
        reference_number=payload.reference_number,
        title=payload.title,
        client_company=payload.client_company,
        description=payload.description,
        scope_of_work=payload.scope_of_work,
        category=payload.category,
        location_site=payload.location_site,
        issue_date=payload.issue_date,
        closing_date=payload.closing_date,
        closing_time=_parse_time(payload.closing_time),
        validity_period=payload.validity_period,
        estimated_value=payload.estimated_value,
        contract_period=payload.contract_period,
        status=payload.status,
        contact_person=payload.contact_person,
        contact_email=payload.contact_email,
        contact_telephone=payload.contact_telephone,
        submission_method=payload.submission_method,
        person_responsible=payload.person_responsible,
        notes=payload.notes,
        outcome=payload.outcome,
        unsuccessful_reason=payload.unsuccessful_reason,
        created_by=user.id,
    )
    db.add(t)
    db.commit()
    db.refresh(t)
    _build_default_checklist(t.id, db)
    db.commit()
    db.refresh(t)
    return _serialize_tender(t)


@app.get("/api/tenders/export")
def export_tenders(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    """Export the complete tender register as an Excel (.xlsx) file.
    Includes all 16 required fields for every tender — including historical records."""
    import io
    from openpyxl import Workbook
    from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
    from openpyxl.utils import get_column_letter
    from fastapi.responses import StreamingResponse

    all_tenders = db.query(Tender).order_by(desc(Tender.created_at)).all()

    wb = Workbook()
    ws = wb.active
    ws.title = "Tender Register"

    # Define styles
    header_font = Font(bold=True, color="FFFFFF", size=11)
    header_fill = PatternFill(start_color="0F766E", end_color="0F766E", fill_type="solid")
    header_alignment = Alignment(horizontal="center", vertical="center", wrap_text=True)
    cell_alignment = Alignment(vertical="top", wrap_text=True)
    thin_border = Border(
        left=Side(style="thin"),
        right=Side(style="thin"),
        top=Side(style="thin"),
        bottom=Side(style="thin"),
    )

    # Header row with all required fields
    headers = [
        "Tender/RFP Number",
        "Client/Organisation",
        "Tender Description",
        "Date Received",
        "Closing Date",
        "Closing Time",
        "Region/Site",
        "Tender Value (ZAR)",
        "Person Responsible",
        "Submission Status",
        "Outcome",
        "Reason for Unsuccessful Bid",
        "Tender Validity Period",
        "Contract Period",
        "Category",
        "Required Documents (Complete)",
        "Outstanding Documents",
        "Notes and Comments",
        "Created At",
        "Last Updated",
    ]

    for col_idx, header in enumerate(headers, 1):
        cell = ws.cell(row=1, column=col_idx, value=header)
        cell.font = header_font
        cell.fill = header_fill
        cell.alignment = header_alignment
        cell.border = thin_border

    # Data rows
    for row_idx, t in enumerate(all_tenders, 2):
        checklist = t.checklist_items or []
        complete_docs = [c.name for c in checklist if c.status == "Complete"]
        outstanding_docs = [c.name for c in checklist if c.status == "Outstanding"]

        row_data = [
            t.reference_number or "",
            t.client_company or "",
            t.description or t.title or "",
            t.issue_date.isoformat() if t.issue_date else (t.created_at.strftime("%Y-%m-%d") if t.created_at else ""),
            t.closing_date.isoformat() if t.closing_date else "",
            t.closing_time.strftime("%H:%M") if t.closing_time else "",
            t.location_site or "",
            t.estimated_value if t.estimated_value else "",
            t.person_responsible or "",
            t.status or "",
            t.outcome or "Pending",
            t.unsuccessful_reason or "",
            t.validity_period or "",
            t.contract_period or "",
            t.category or "",
            "; ".join(complete_docs) if complete_docs else "",
            "; ".join(outstanding_docs) if outstanding_docs else "",
            t.notes or "",
            t.created_at.strftime("%Y-%m-%d %H:%M") if t.created_at else "",
            t.updated_at.strftime("%Y-%m-%d %H:%M") if t.updated_at else "",
        ]

        for col_idx, value in enumerate(row_data, 1):
            cell = ws.cell(row=row_idx, column=col_idx, value=value)
            cell.alignment = cell_alignment
            cell.border = thin_border
            # Color-code outcome column
            if col_idx == 11:  # Outcome column
                if value == "Awarded":
                    cell.fill = PatternFill(start_color="D1FAE5", end_color="D1FAE5", fill_type="solid")
                    cell.font = Font(color="065F46", bold=True)
                elif value == "Unsuccessful":
                    cell.fill = PatternFill(start_color="FEE2E2", end_color="FEE2E2", fill_type="solid")
                    cell.font = Font(color="991B1B", bold=True)
                elif value == "Withdrawn":
                    cell.fill = PatternFill(start_color="F3F4F6", end_color="F3F4F6", fill_type="solid")
                    cell.font = Font(color="6B7280", bold=True)
                elif value == "Pending":
                    cell.fill = PatternFill(start_color="FEF3C7", end_color="FEF3C7", fill_type="solid")
                    cell.font = Font(color="92400E", bold=True)
            # Format tender value column
            if col_idx == 8 and isinstance(value, (int, float)) and value:
                cell.number_format = '#,##0.00'

    # Auto-size columns
    column_widths = {
        1: 18, 2: 25, 3: 40, 4: 14, 5: 14, 6: 10, 7: 20, 8: 16,
        9: 20, 10: 22, 11: 14, 12: 30, 13: 18, 14: 16, 15: 18,
        16: 40, 17: 40, 18: 30, 19: 20, 20: 20,
    }
    for col_idx, width in column_widths.items():
        ws.column_dimensions[get_column_letter(col_idx)].width = width

    # Freeze the header row
    ws.freeze_panes = "A2"

    # Auto-filter
    ws.auto_filter.ref = ws.dimensions

    # Save to bytes
    output = io.BytesIO()
    wb.save(output)
    output.seek(0)

    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={
            "Content-Disposition": f"attachment; filename=tender_register_{date.today().isoformat()}.xlsx"
        }
    )


@app.get("/api/tenders/{tender_id}")
def get_tender(tender_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    t = db.query(Tender).filter(Tender.id == tender_id).first()
    if not t:
        raise HTTPException(status_code=404, detail="Tender not found")
    return _serialize_tender(t)


@app.put("/api/tenders/{tender_id}")
def update_tender(tender_id: int, payload: TenderUpdate, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    t = db.query(Tender).filter(Tender.id == tender_id).first()
    if not t:
        raise HTTPException(status_code=404, detail="Tender not found")
    data = payload.model_dump(exclude_unset=True)
    if "closing_time" in data:
        data["closing_time"] = _parse_time(data["closing_time"])
    for k, v in data.items():
        setattr(t, k, v)
    t.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(t)
    return _serialize_tender(t)


@app.delete("/api/tenders/{tender_id}")
def delete_tender(tender_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    t = db.query(Tender).filter(Tender.id == tender_id).first()
    if not t:
        raise HTTPException(status_code=404, detail="Tender not found")
    db.delete(t)
    db.commit()
    return {"deleted": True, "id": tender_id}


@app.post("/api/tenders/{tender_id}/archive")
def archive_tender(tender_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    t = db.query(Tender).filter(Tender.id == tender_id).first()
    if not t:
        raise HTTPException(status_code=404, detail="Tender not found")
    t.status = "Withdrawn"
    t.updated_at = datetime.utcnow()
    db.commit()
    return _serialize_tender(t)


@app.post("/api/tenders/{tender_id}/documents")
async def upload_tender_document(
    tender_id: int,
    file: UploadFile = File(...),
    is_primary: bool = Form(False),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    t = db.query(Tender).filter(Tender.id == tender_id).first()
    if not t:
        raise HTTPException(status_code=404, detail="Tender not found")
    rel_path = _save_upload(file, subdir=f"tenders/{tender_id}")
    file_size = _upload_size(rel_path) or 0
    doc = TenderDocument(
        tender_id=tender_id,
        filename=rel_path,
        original_filename=file.filename,
        file_path=rel_path,
        file_type=file.content_type,
        file_size=file_size,
        is_primary=is_primary,
    )
    db.add(doc)
    db.commit()
    db.refresh(doc)
    return {
        "id": doc.id, "filename": doc.original_filename,
        "file_type": doc.file_type, "file_size": doc.file_size,
        "uploaded_at": doc.uploaded_at, "is_primary": doc.is_primary,
    }


@app.delete("/api/tenders/{tender_id}/documents/{doc_id}")
def delete_tender_document(tender_id: int, doc_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    doc = db.query(TenderDocument).filter(TenderDocument.id == doc_id, TenderDocument.tender_id == tender_id).first()
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
    full_path = os.path.join(UPLOAD_DIR, doc.file_path)
    if os.path.exists(full_path):
        try:
            os.unlink(full_path)
        except OSError:
            pass
    db.delete(doc)
    db.commit()
    return {"deleted": True}


@app.post("/api/tenders/{tender_id}/ai-extract")
def ai_extract_tender(tender_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    """Run AI extraction on the tender's documents and update the tender record."""
    t = db.query(TenderDocument).filter(TenderDocument.tender_id == tender_id)  # placeholder
    tender = db.query(Tender).filter(Tender.id == tender_id).first()
    if not tender:
        raise HTTPException(status_code=404, detail="Tender not found")
    if not tender.documents:
        raise HTTPException(status_code=400, detail="No documents uploaded for this tender")
    # Concatenate text from all documents
    combined_text = ""
    for doc in tender.documents:
        local = _upload_local_path(doc.file_path)
        if local:
            combined_text += f"\n\n=== {doc.original_filename} ===\n"
            combined_text += ai_module.extract_text_from_file(local, doc.original_filename)
    if len(combined_text.strip()) < 50:
        raise HTTPException(status_code=400, detail="Could not extract text from documents")
    extracted = ai_module.extract_tender_info(combined_text, tender.reference_number)
    tender.ai_extracted_info = extracted
    # Auto-fill tender fields from extraction if missing
    if extracted.get("tender_number") and not tender.reference_number:
        tender.reference_number = extracted["tender_number"]
    if extracted.get("client") and not tender.client_company:
        tender.client_company = extracted["client"]
    if extracted.get("tender_title") and not tender.title:
        tender.title = extracted["tender_title"]
    if extracted.get("closing_date") and not tender.closing_date:
        try:
            tender.closing_date = date.fromisoformat(extracted["closing_date"][:10])
        except Exception:
            pass
    if extracted.get("closing_time") and not tender.closing_time:
        tender.closing_time = _parse_time(extracted["closing_time"][:5])
    if extracted.get("scope_of_work") and not tender.scope_of_work:
        tender.scope_of_work = extracted["scope_of_work"]
    if extracted.get("contract_period") and not tender.contract_period:
        tender.contract_period = extracted["contract_period"]
    if extracted.get("submission_method") and not tender.submission_method:
        tender.submission_method = extracted["submission_method"]
    if extracted.get("site_locations") and not tender.location_site:
        tender.location_site = "; ".join(extracted["site_locations"])
    # Reset checklist and rebuild from extracted compulsory documents
    db.query(ChecklistItem).filter(ChecklistItem.tender_id == tender_id).delete()
    _checklist_from_extracted(tender_id, extracted, db)
    tender.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(tender)
    return _serialize_tender(tender)


@app.post("/api/tenders/{tender_id}/ai-summary")
def ai_tender_summary(tender_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    tender = db.query(Tender).filter(Tender.id == tender_id).first()
    if not tender:
        raise HTTPException(status_code=404, detail="Tender not found")
    tender_data = _serialize_tender(tender)
    summary = ai_module.generate_tender_summary(tender_data, tender.ai_extracted_info or {})
    tender.ai_summary = summary
    tender.updated_at = datetime.utcnow()
    db.commit()
    return {"summary": summary}


# ---------------------- Standalone AI Document Reading ----------------------

@app.post("/api/ai/read-document")
async def ai_read_document(
    file: UploadFile = File(...),
    user: User = Depends(get_current_user),
):
    """
    Standalone AI document reader. Upload ANY tender document (PDF/DOCX/TXT)
    and get back the full AI extraction + summary — without needing to create
    a tender first.
    """
    # Save the uploaded file and make a local copy for text extraction.
    rel_path = _save_upload(file, subdir="ai_reader")
    full_path = _upload_local_path(rel_path)
    file_size = _upload_size(rel_path) or 0

    # Extract text
    document_text = (
        ai_module.extract_text_from_file(full_path, file.filename) if full_path else ""
    )
    if not document_text or len(document_text.strip()) < 50:
        # Clean up the local copy
        if full_path:
            try:
                os.unlink(full_path)
            except OSError:
                pass
        raise HTTPException(
            status_code=400,
            detail="Could not extract text from this document. Please ensure it is a valid PDF, DOCX, or text file with readable content.",
        )

    # Run AI extraction
    extracted = ai_module.extract_tender_info(document_text, file.filename)

    # Generate a summary from the extracted info
    summary = ""
    if extracted and not extracted.get("_error"):
        try:
            summary = ai_module.generate_tender_summary(
                {"reference_number": extracted.get("tender_number"),
                 "title": extracted.get("tender_title"),
                 "client_company": extracted.get("client"),
                 "closing_date": extracted.get("closing_date"),
                 "contract_period": extracted.get("contract_period"),
                 "location_site": "; ".join(extracted.get("site_locations", []) or []),
                 "scope_of_work": extracted.get("scope_of_work"),
                 "status": "New Opportunity"},
                extracted
            )
        except Exception:
            summary = ""

    # Clean up the temporary file (we don't keep it)
    try:
        os.unlink(full_path)
    except OSError:
        pass

    return {
        "filename": file.filename,
        "file_size": file_size,
        "extracted_text_preview": document_text[:2000] + ("...[truncated]" if len(document_text) > 2000 else ""),
        "extraction": extracted,
        "summary": summary,
    }


@app.post("/api/ai/read-document-and-create")
async def ai_read_document_and_create(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """
    Upload a tender document, run AI extraction, AND create a new tender in the
    database with all the extracted fields auto-filled. Returns the new tender.
    """
    rel_path = _save_upload(file, subdir=f"tenders/ai_created")
    full_path = os.path.join(UPLOAD_DIR, rel_path)
    file_size = os.path.getsize(full_path)

    document_text = ai_module.extract_text_from_file(full_path, file.filename)
    if not document_text or len(document_text.strip()) < 50:
        try:
            os.unlink(full_path)
        except OSError:
            pass
        raise HTTPException(
            status_code=400,
            detail="Could not extract text from this document. Please ensure it is a valid PDF, DOCX, or text file.",
        )

    extracted = ai_module.extract_tender_info(document_text, file.filename)

    # Generate reference number if not extracted
    ref = extracted.get("tender_number") or f"TENDER-{datetime.utcnow().strftime('%Y%m%d%H%M%S')}"
    title = extracted.get("tender_title") or file.filename.rsplit(".", 1)[0]

    # Create the tender
    t = Tender(
        reference_number=ref,
        title=title[:500],
        client_company=extracted.get("client") or "Unknown",
        description=extracted.get("scope_of_work"),
        scope_of_work=extracted.get("scope_of_work"),
        category="Security Services" if extracted.get("required_psira_grades") else None,
        location_site="; ".join(extracted.get("site_locations", []) or []) or None,
        closing_date=date.fromisoformat(extracted["closing_date"][:10]) if extracted.get("closing_date") else None,
        closing_time=_parse_time(extracted["closing_time"][:5]) if extracted.get("closing_time") else None,
        contract_period=extracted.get("contract_period"),
        submission_method=extracted.get("submission_method"),
        status="New Opportunity",
        person_responsible=user.full_name,
        notes=f"Created via AI Document Reader. Source file: {file.filename}",
        ai_extracted_info=extracted,
        created_by=user.id,
    )
    # Try to parse estimated value from pricing requirements
    import re as _re
    pricing = extracted.get("pricing_requirements", [])
    pricing_text = " ".join(pricing) if isinstance(pricing, list) else str(pricing)
    nums = _re.findall(r"R?\s*([\d,.]+)\s*(?:million|mil)?", pricing_text, _re.I)
    if nums:
        try:
            val = float(nums[0].replace(",", ""))
            if "million" in pricing_text.lower() or "mil" in pricing_text.lower():
                val *= 1_000_000
            t.estimated_value = val
        except (ValueError, IndexError):
            pass

    db.add(t)
    db.commit()
    db.refresh(t)

    # Attach the document to the new tender
    # Move the file to the tender's directory
    new_rel_path = os.path.join(UPLOAD_DIR, f"tenders/{t.id}", os.path.basename(rel_path))
    new_dir = os.path.dirname(new_rel_path)
    if not os.path.exists(new_dir):
        os.makedirs(new_dir, exist_ok=True)
    try:
        os.rename(full_path, new_rel_path)
    except OSError:
        new_rel_path = full_path  # keep original if rename fails

    doc = TenderDocument(
        tender_id=t.id,
        filename=os.path.relpath(new_rel_path, UPLOAD_DIR),
        original_filename=file.filename,
        file_path=os.path.relpath(new_rel_path, UPLOAD_DIR),
        file_type=file.content_type,
        file_size=file_size,
        is_primary=True,
    )
    db.add(doc)

    # Build checklist from extracted compulsory documents
    _checklist_from_extracted(t.id, extracted, db)

    # Commit the tender immediately so the user sees it in their register
    # without waiting for the AI summary (which can take 30-60s).
    t.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(t)

    # Kick off the AI summary generation in a BACKGROUND THREAD.
    # This uses its own DB session so it doesn't block the request.
    # The response returns immediately with the tender data; the
    # summary appears in the tender record a few seconds later
    # (visible when the user opens the tender detail view).
    if extracted and not extracted.get("_error"):
        _tender_id = t.id
        _extracted = dict(extracted)
        _summary_input = {
            "reference_number": t.reference_number,
            "title": t.title,
            "client_company": t.client_company,
            "closing_date": t.closing_date.isoformat() if t.closing_date else None,
            "contract_period": t.contract_period,
            "location_site": t.location_site,
            "scope_of_work": t.scope_of_work,
            "status": t.status,
        }
        def _generate_summary_bg():
            bg_db = SessionLocal()
            try:
                summary = ai_module.generate_tender_summary(_summary_input, _extracted)
                tender = bg_db.query(Tender).filter(Tender.id == _tender_id).first()
                if tender:
                    tender.ai_summary = summary
                    tender.updated_at = datetime.utcnow()
                    bg_db.commit()
                print(f"[bg-summary] Summary saved for tender {_tender_id}", flush=True)
            except Exception as e:
                print(f"[bg-summary] Failed for tender {_tender_id}: {e}", flush=True)
            finally:
                bg_db.close()
        threading.Thread(target=_generate_summary_bg, daemon=True).start()

    return _serialize_tender(t)


# ---------------------- Checklist Routes ----------------------

@app.post("/api/tenders/{tender_id}/checklist/regenerate")
def regenerate_checklist(tender_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    """Regenerate the tender checklist from the AI-extracted info.
    Uses the AI to produce a tender-specific checklist, then auto-links library docs."""
    tender = db.query(Tender).filter(Tender.id == tender_id).first()
    if not tender:
        raise HTTPException(status_code=404, detail="Tender not found")
    if not tender.ai_extracted_info:
        raise HTTPException(status_code=400, detail="No AI extraction found. Please upload and extract the tender document first.")
    _regenerate_checklist(tender_id, db)
    db.commit()
    db.refresh(tender)
    return _serialize_tender(tender)


@app.post("/api/tenders/{tender_id}/checklist")
def add_checklist_item(tender_id: int, item: ChecklistItemBase, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    if not db.query(Tender).filter(Tender.id == tender_id).first():
        raise HTTPException(status_code=404, detail="Tender not found")
    c = ChecklistItem(
        tender_id=tender_id, name=item.name, description=item.description,
        status=item.status, linked_library_doc_id=item.linked_library_doc_id,
        notes=item.notes,
    )
    db.add(c)
    db.commit()
    db.refresh(c)
    return {"id": c.id, "name": c.name, "status": c.status}


@app.put("/api/checklist/{item_id}")
def update_checklist_item(item_id: int, payload: ChecklistItemUpdate, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    c = db.query(ChecklistItem).filter(ChecklistItem.id == item_id).first()
    if not c:
        raise HTTPException(status_code=404, detail="Checklist item not found")
    data = payload.model_dump(exclude_unset=True)
    for k, v in data.items():
        setattr(c, k, v)
    c.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(c)
    return {"id": c.id, "name": c.name, "status": c.status, "notes": c.notes}


@app.delete("/api/checklist/{item_id}")
def delete_checklist_item(item_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    c = db.query(ChecklistItem).filter(ChecklistItem.id == item_id).first()
    if not c:
        raise HTTPException(status_code=404, detail="Checklist item not found")
    db.delete(c)
    db.commit()
    return {"deleted": True}


@app.post("/api/checklist/{item_id}/upload")
async def upload_checklist_document(
    item_id: int,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Upload a document for a checklist item. The AI reads the document and verifies
    it matches the required item type. The document is also saved to the compliance library."""
    c = db.query(ChecklistItem).filter(ChecklistItem.id == item_id).first()
    if not c:
        raise HTTPException(status_code=404, detail="Checklist item not found")

    # Save the uploaded file to the library subfolder
    rel_path = _save_upload(file, subdir="library")
    full_path = os.path.join(UPLOAD_DIR, rel_path)
    file_size = os.path.getsize(full_path)

    # Extract text from the document
    document_text = ""
    try:
        document_text = ai_module.extract_text_from_file(full_path, file.filename)
    except Exception:
        document_text = ""

    # AI verification — check if the document matches the required item
    verification = {"matches": True, "confidence": "low", "detected_type": "", "key_info": "", "reason": ""}
    if document_text and len(document_text.strip()) > 20:
        try:
            verification = ai_module.verify_checklist_document(
                item_name=c.name,
                item_category=c.category or "",
                document_text=document_text,
                filename=file.filename or "",
            )
        except Exception as e:
            verification = {
                "matches": True,
                "confidence": "low",
                "detected_type": "Unknown",
                "key_info": "",
                "reason": f"AI verification unavailable: {e}",
            }

    # Determine the library category from the checklist item
    lib_category = c.library_category or c.category or "Other"

    # Save to the compliance library so it's reusable
    lib_doc = LibraryDocument(
        name=file.filename or c.name,
        category=lib_category,
        description=f"Uploaded for checklist item: {c.name}",
        filename=rel_path,
        file_path=rel_path,
        file_type=file.content_type,
        file_size=file_size,
        notes=f"AI verification: {verification.get('reason', '')}",
        created_by=user.id,
    )
    db.add(lib_doc)
    db.flush()

    # Link the library doc to the checklist item and update status
    c.linked_library_doc_id = lib_doc.id
    if verification.get("matches"):
        c.status = "Complete"
        c.notes = f"Verified: {verification.get('detected_type', '')}. {verification.get('key_info', '')}"
    else:
        c.status = "Outstanding"
        c.notes = f"AI flagged: {verification.get('reason', '')}. Please upload the correct document."

    db.commit()
    db.refresh(c)

    return {
        "id": c.id,
        "status": c.status,
        "linked_library_doc_id": c.linked_library_doc_id,
        "notes": c.notes,
        "verification": verification,
        "library_doc": {
            "id": lib_doc.id,
            "name": lib_doc.name,
            "category": lib_doc.category,
        },
    }


# ---------------------- Library Document Routes ----------------------

@app.get("/api/library")
def list_library(
    category: Optional[str] = None,
    search: Optional[str] = None,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    q = db.query(LibraryDocument)
    # Company-aware: show library docs from all members of the same bidder company
    bidder_member = db.query(BidderMember).filter(
        BidderMember.user_id == user.id,
        BidderMember.status == "approved"
    ).first()
    if bidder_member:
        member_ids = _get_company_member_ids(db, bidder_member.company_id)
        q = q.filter(LibraryDocument.created_by.in_(member_ids))
    else:
        q = q.filter(LibraryDocument.created_by == user.id)
    if category:
        q = q.filter(LibraryDocument.category == category)
    if search:
        like = f"%{search}%"
        q = q.filter(or_(
            LibraryDocument.name.ilike(like),
            LibraryDocument.description.ilike(like),
        ))
    docs = q.order_by(LibraryDocument.category, LibraryDocument.name).all()
    today = date.today()
    result = []
    for d in docs:
        days_to_expiry = None
        status = "Active"
        if d.expiry_date:
            days_to_expiry = (d.expiry_date - today).days
            if days_to_expiry < 0:
                status = "Expired"
            elif days_to_expiry <= 30:
                status = "Expiring Soon"
        result.append({
            "id": d.id, "name": d.name, "category": d.category,
            "description": d.description, "filename": d.filename,
            "file_size": d.file_size,
            "issue_date": d.issue_date.isoformat() if d.issue_date else None,
            "expiry_date": d.expiry_date.isoformat() if d.expiry_date else None,
            "notes": d.notes,
            "uploaded_at": d.uploaded_at.isoformat() if d.uploaded_at else None,
            "days_to_expiry": days_to_expiry,
            "status": status,
        })
    return {"items": result}


@app.post("/api/library")
async def upload_library_document(
    name: str = Form(...),
    category: str = Form(...),
    description: Optional[str] = Form(None),
    issue_date: Optional[str] = Form(None),
    expiry_date: Optional[str] = Form(None),
    notes: Optional[str] = Form(None),
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    rel_path = _save_upload(file, subdir="library")
    file_size = _upload_size(rel_path) or 0
    doc = LibraryDocument(
        name=name, category=category, description=description,
        filename=rel_path, file_path=rel_path,
        file_type=file.content_type, file_size=file_size,
        issue_date=date.fromisoformat(issue_date) if issue_date else None,
        expiry_date=date.fromisoformat(expiry_date) if expiry_date else None,
        notes=notes, created_by=user.id,
    )
    db.add(doc)
    db.commit()
    db.refresh(doc)
    return {"id": doc.id, "name": doc.name, "category": doc.category}


@app.put("/api/library/{doc_id}")
def update_library_document(
    doc_id: int,
    name: Optional[str] = None,
    category: Optional[str] = None,
    description: Optional[str] = None,
    issue_date: Optional[str] = None,
    expiry_date: Optional[str] = None,
    notes: Optional[str] = None,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    d = db.query(LibraryDocument).filter(LibraryDocument.id == doc_id).first()
    if not d:
        raise HTTPException(status_code=404, detail="Document not found")
    if name is not None: d.name = name
    if category is not None: d.category = category
    if description is not None: d.description = description
    if issue_date is not None and issue_date != "":
        d.issue_date = date.fromisoformat(issue_date)
    if expiry_date is not None and expiry_date != "":
        d.expiry_date = date.fromisoformat(expiry_date)
    if notes is not None: d.notes = notes
    db.commit()
    return {"id": d.id, "name": d.name, "category": d.category}


@app.delete("/api/library/{doc_id}")
def delete_library_document(doc_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    d = db.query(LibraryDocument).filter(LibraryDocument.id == doc_id).first()
    if not d:
        raise HTTPException(status_code=404, detail="Document not found")
    full_path = os.path.join(UPLOAD_DIR, d.file_path)
    if os.path.exists(full_path):
        try:
            os.unlink(full_path)
        except OSError:
            pass
    db.delete(d)
    db.commit()
    return {"deleted": True}


# ---------------------- Briefing Routes ----------------------

@app.post("/api/tenders/{tender_id}/briefings")
def create_briefing(tender_id: int, payload: BriefingCreate, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    if payload.tender_id != tender_id:
        payload.tender_id = tender_id
    if not db.query(Tender).filter(Tender.id == tender_id).first():
        raise HTTPException(status_code=404, detail="Tender not found")
    b = Briefing(
        tender_id=tender_id,
        briefing_type=payload.briefing_type,
        date=payload.date,
        time=_parse_time(payload.time),
        location=payload.location,
        contact_person=payload.contact_person,
        attendance_required=payload.attendance_required,
        attendance_confirmed=payload.attendance_confirmed,
        person_attending=payload.person_attending,
        notes=payload.notes,
    )
    db.add(b)
    db.commit()
    db.refresh(b)
    return {"id": b.id, "briefing_type": b.briefing_type, "date": b.date.isoformat() if b.date else None}


@app.get("/api/briefings")
def list_briefings(
    upcoming_only: bool = False,
    days: int = 30,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    q = db.query(Briefing).join(Tender, Briefing.tender_id == Tender.id)
    if upcoming_only:
        cutoff = date.today() + timedelta(days=days)
        q = q.filter(Briefing.date >= date.today(), Briefing.date <= cutoff)
    briefings = q.order_by(Briefing.date).all()
    result = []
    for b in briefings:
        result.append({
            "id": b.id, "tender_id": b.tender_id,
            "tender_reference": b.tender.reference_number if b.tender else None,
            "tender_title": b.tender.title if b.tender else None,
            "client": b.tender.client_company if b.tender else None,
            "briefing_type": b.briefing_type,
            "date": b.date.isoformat() if b.date else None,
            "time": b.time.strftime("%H:%M") if b.time else None,
            "location": b.location,
            "contact_person": b.contact_person,
            "attendance_required": b.attendance_required,
            "attendance_confirmed": b.attendance_confirmed,
            "person_attending": b.person_attending,
            "certificate_path": b.certificate_path,
            "certificate_url": f"/uploads/{b.certificate_path}?XTransformPort=8000" if b.certificate_path else None,
            "notes": b.notes,
        })
    return {"items": result}


@app.put("/api/briefings/{briefing_id}")
def update_briefing(briefing_id: int, payload: BriefingUpdate, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    b = db.query(Briefing).filter(Briefing.id == briefing_id).first()
    if not b:
        raise HTTPException(status_code=404, detail="Briefing not found")
    data = payload.model_dump(exclude_unset=True)
    if "time" in data:
        data["time"] = _parse_time(data["time"])
    for k, v in data.items():
        setattr(b, k, v)
    db.commit()
    return {"id": b.id, "updated": True}


@app.delete("/api/briefings/{briefing_id}")
def delete_briefing(briefing_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    b = db.query(Briefing).filter(Briefing.id == briefing_id).first()
    if not b:
        raise HTTPException(status_code=404, detail="Briefing not found")
    db.delete(b)
    db.commit()
    return {"deleted": True}


@app.post("/api/briefings/{briefing_id}/certificate")
async def upload_briefing_certificate(
    briefing_id: int,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Upload an attendance confirmation/certificate for a briefing."""
    b = db.query(Briefing).filter(Briefing.id == briefing_id).first()
    if not b:
        raise HTTPException(status_code=404, detail="Briefing not found")
    rel_path = _save_upload(file, subdir=f"briefings/{briefing_id}")
    b.certificate_path = rel_path
    # Auto-mark attendance as confirmed when certificate is uploaded
    b.attendance_confirmed = True
    db.commit()
    db.refresh(b)
    return {
        "id": b.id,
        "certificate_path": rel_path,
        "certificate_url": f"/uploads/{rel_path}?XTransformPort=8000",
        "attendance_confirmed": b.attendance_confirmed,
    }


@app.delete("/api/briefings/{briefing_id}/certificate")
def delete_briefing_certificate(briefing_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    """Remove the attendance certificate from a briefing."""
    b = db.query(Briefing).filter(Briefing.id == briefing_id).first()
    if not b:
        raise HTTPException(status_code=404, detail="Briefing not found")
    if b.certificate_path:
        full_path = os.path.join(UPLOAD_DIR, b.certificate_path)
        if os.path.exists(full_path):
            try:
                os.unlink(full_path)
            except OSError:
                pass
        b.certificate_path = None
    db.commit()
    return {"deleted": True}


@app.get("/api/briefings/alerts")
def get_briefing_alerts(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    """
    Get alerts for upcoming compulsory briefings and site inspections.
    Returns briefings that:
    - Are within the next 14 days
    - Have attendance_required = True
    - Are either: not confirmed, or confirmed but no person assigned
    Also returns a summary of upcoming briefings by urgency.
    """
    today = date.today()
    all_briefings = db.query(Briefing).join(Tender, Briefing.tender_id == Tender.id).all()

    alerts = []
    upcoming = []
    for b in all_briefings:
        if not b.date:
            continue
        days_until = (b.date - today).days
        briefing_data = {
            "id": b.id,
            "tender_id": b.tender_id,
            "tender_reference": b.tender.reference_number if b.tender else None,
            "tender_title": b.tender.title if b.tender else None,
            "client": b.tender.client_company if b.tender else None,
            "briefing_type": b.briefing_type,
            "date": b.date.isoformat(),
            "time": b.time.strftime("%H:%M") if b.time else None,
            "location": b.location,
            "contact_person": b.contact_person,
            "attendance_required": b.attendance_required,
            "attendance_confirmed": b.attendance_confirmed,
            "person_attending": b.person_attending,
            "certificate_path": b.certificate_path,
            "certificate_url": f"/uploads/{b.certificate_path}?XTransformPort=8000" if b.certificate_path else None,
            "notes": b.notes,
            "days_until": days_until,
            "is_past": days_until < 0,
            "is_today": days_until == 0,
        }

        # Upcoming = within next 30 days (or today)
        if 0 <= days_until <= 30:
            briefing_data["urgency"] = (
                "today" if days_until == 0
                else "critical" if days_until <= 1
                else "urgent" if days_until <= 3
                else "soon" if days_until <= 7
                else "normal"
            )
            upcoming.append(briefing_data)
            # Alert if compulsory and not confirmed, or no person attending
            if b.attendance_required and (not b.attendance_confirmed or not b.person_attending):
                alerts.append(briefing_data)

    # Sort by date ascending
    upcoming.sort(key=lambda x: x["date"])
    alerts.sort(key=lambda x: x["date"])

    summary = {
        "total_upcoming": len(upcoming),
        "total_alerts": len(alerts),
        "today_count": len([b for b in upcoming if b["is_today"]]),
        "critical_count": len([b for b in upcoming if b["urgency"] == "critical"]),
        "urgent_count": len([b for b in upcoming if b["urgency"] == "urgent"]),
        "soon_count": len([b for b in upcoming if b["urgency"] == "soon"]),
        "unconfirmed_count": len([b for b in upcoming if b["attendance_required"] and not b["attendance_confirmed"]]),
        "no_attendee_count": len([b for b in upcoming if b["attendance_required"] and not b["person_attending"]]),
    }

    return {
        "alerts": alerts,
        "upcoming": upcoming,
        "summary": summary,
    }


# ---------------------- Pricing Routes ----------------------

@app.post("/api/tenders/{tender_id}/pricing")
def create_pricing_version(tender_id: int, payload: PricingVersionCreate, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    if not db.query(Tender).filter(Tender.id == tender_id).first():
        raise HTTPException(status_code=404, detail="Tender not found")
    count = db.query(PricingVersion).filter(PricingVersion.tender_id == tender_id).count()
    line_items = [li.model_dump() for li in payload.line_items]
    # Calculate totals
    subtotal = sum(li.get("total") or (li.get("quantity", 0) * li.get("rate", 0)) for li in line_items)
    vat = round(subtotal * 0.15, 2)
    total = round(subtotal + vat, 2)
    pv = PricingVersion(
        tender_id=tender_id,
        version_number=count + 1,
        version_label=payload.version_label or f"v{count + 1}",
        line_items=line_items,
        subtotal=round(subtotal, 2),
        vat=vat,
        total=total,
        notes=payload.notes,
    )
    db.add(pv)
    db.commit()
    db.refresh(pv)
    return {
        "id": pv.id, "version_number": pv.version_number,
        "subtotal": pv.subtotal, "vat": pv.vat, "total": pv.total,
    }


@app.get("/api/tenders/{tender_id}/pricing")
def list_pricing_versions(tender_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    versions = db.query(PricingVersion).filter(PricingVersion.tender_id == tender_id).order_by(PricingVersion.version_number).all()
    return {"items": [
        {
            "id": p.id, "version_number": p.version_number, "version_label": p.version_label,
            "line_items": p.line_items, "subtotal": p.subtotal, "vat": p.vat, "total": p.total,
            "notes": p.notes,
            "created_at": p.created_at.isoformat() if p.created_at else None,
        } for p in versions
    ]}


@app.delete("/api/pricing/{version_id}")
def delete_pricing_version(version_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    pv = db.query(PricingVersion).filter(PricingVersion.id == version_id).first()
    if not pv:
        raise HTTPException(status_code=404, detail="Pricing version not found")
    db.delete(pv)
    db.commit()
    return {"deleted": True}


@app.post("/api/tenders/{tender_id}/pricing/generate")
def generate_pricing_sheet(tender_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    """AI generates a pricing sheet draft based on the tender's extracted requirements."""
    tender = db.query(Tender).filter(Tender.id == tender_id).first()
    if not tender:
        raise HTTPException(status_code=404, detail="Tender not found")
    extracted = tender.ai_extracted_info or {}
    tender_data = {
        "reference_number": tender.reference_number,
        "title": tender.title,
        "client_company": tender.client_company,
        "contract_period": tender.contract_period,
        "estimated_value": tender.estimated_value,
        "location_site": tender.location_site,
    }
    result = ai_module.generate_pricing_sheet(tender_data, extracted)
    # Create a new pricing version from the AI-generated sheet
    count = db.query(PricingVersion).filter(PricingVersion.tender_id == tender_id).count()
    line_items = result.get("line_items", [])
    subtotal = round(sum(li.get("total", 0) for li in line_items), 2)
    vat_rate = result.get("vat_rate", 0.15)
    vat = round(subtotal * vat_rate, 2)
    total = round(subtotal + vat, 2)
    pv = PricingVersion(
        tender_id=tender_id,
        version_number=count + 1,
        version_label=f"AI Draft v{count + 1}",
        line_items=line_items,
        subtotal=subtotal,
        vat=vat,
        total=total,
        notes=result.get("pricing_notes", "AI-generated pricing sheet — review and adjust."),
    )
    db.add(pv)
    db.commit()
    db.refresh(pv)
    return {
        "id": pv.id, "version_number": pv.version_number,
        "version_label": pv.version_label,
        "line_items": pv.line_items,
        "subtotal": pv.subtotal, "vat": pv.vat, "total": pv.total,
        "notes": pv.notes,
        "created_at": pv.created_at.isoformat() if pv.created_at else None,
    }


@app.post("/api/pricing/{version_id}/copy")
def copy_pricing_version(version_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    """Create a new pricing version by copying an existing one (for revisions)."""
    source = db.query(PricingVersion).filter(PricingVersion.id == version_id).first()
    if not source:
        raise HTTPException(status_code=404, detail="Pricing version not found")
    count = db.query(PricingVersion).filter(PricingVersion.tender_id == source.tender_id).count()
    pv = PricingVersion(
        tender_id=source.tender_id,
        version_number=count + 1,
        version_label=f"v{count + 1} (copy of v{source.version_number})",
        line_items=source.line_items,
        subtotal=source.subtotal,
        vat=source.vat,
        total=source.total,
        notes=source.notes,
    )
    db.add(pv)
    db.commit()
    db.refresh(pv)
    return {
        "id": pv.id, "version_number": pv.version_number,
        "version_label": pv.version_label,
        "line_items": pv.line_items,
        "subtotal": pv.subtotal, "vat": pv.vat, "total": pv.total,
        "notes": pv.notes,
        "created_at": pv.created_at.isoformat() if pv.created_at else None,
    }


# ---------------------- Submission Routes ----------------------

@app.post("/api/tenders/{tender_id}/submission")
def create_or_update_submission(tender_id: int, payload: SubmissionCreate, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    if not db.query(Tender).filter(Tender.id == tender_id).first():
        raise HTTPException(status_code=404, detail="Tender not found")
    sub = db.query(Submission).filter(Submission.tender_id == tender_id).first()
    if sub:
        sub.submission_date = payload.submission_date
        sub.submission_time = _parse_time(payload.submission_time)
        sub.submission_method = payload.submission_method
        sub.submitted_by = payload.submitted_by
        sub.confirmation_reference = payload.confirmation_reference
        sub.final_pricing = payload.final_pricing
        sub.notes = payload.notes
    else:
        sub = Submission(
            tender_id=tender_id,
            submission_date=payload.submission_date,
            submission_time=_parse_time(payload.submission_time),
            submission_method=payload.submission_method,
            submitted_by=payload.submitted_by,
            confirmation_reference=payload.confirmation_reference,
            final_pricing=payload.final_pricing,
            notes=payload.notes,
        )
        db.add(sub)
    # Auto-update tender status to Submitted
    tender = db.query(Tender).filter(Tender.id == tender_id).first()
    if tender and tender.status not in ("Submitted", "Awarded", "Unsuccessful", "Withdrawn"):
        tender.status = "Submitted"
    db.commit()
    db.refresh(sub)
    return {"id": sub.id, "tender_id": sub.tender_id}


@app.post("/api/tenders/{tender_id}/submission/confirmation-file")
async def upload_submission_confirmation(
    tender_id: int,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Upload the submission confirmation/receipt file."""
    if not db.query(Tender).filter(Tender.id == tender_id).first():
        raise HTTPException(status_code=404, detail="Tender not found")
    sub = db.query(Submission).filter(Submission.tender_id == tender_id).first()
    if not sub:
        sub = Submission(tender_id=tender_id)
        db.add(sub)
        db.commit()
        db.refresh(sub)
    rel_path = _save_upload(file, subdir=f"submissions/{tender_id}")
    sub.confirmation_file_path = rel_path
    db.commit()
    db.refresh(sub)
    return {
        "id": sub.id,
        "confirmation_file_path": rel_path,
        "confirmation_file_url": f"/uploads/{rel_path}?XTransformPort=8000",
    }


@app.delete("/api/tenders/{tender_id}/submission/confirmation-file")
def delete_submission_confirmation(tender_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    """Remove the submission confirmation file."""
    sub = db.query(Submission).filter(Submission.tender_id == tender_id).first()
    if not sub:
        raise HTTPException(status_code=404, detail="Submission not found")
    if sub.confirmation_file_path:
        full_path = os.path.join(UPLOAD_DIR, sub.confirmation_file_path)
        if os.path.exists(full_path):
            try:
                os.unlink(full_path)
            except OSError:
                pass
        sub.confirmation_file_path = None
    db.commit()
    return {"deleted": True}


@app.post("/api/tenders/{tender_id}/submission/final-documents")
async def upload_final_documents(
    tender_id: int,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Upload the final submitted documents bundle."""
    if not db.query(Tender).filter(Tender.id == tender_id).first():
        raise HTTPException(status_code=404, detail="Tender not found")
    sub = db.query(Submission).filter(Submission.tender_id == tender_id).first()
    if not sub:
        sub = Submission(tender_id=tender_id)
        db.add(sub)
        db.commit()
        db.refresh(sub)
    rel_path = _save_upload(file, subdir=f"submissions/{tender_id}")
    sub.final_documents_path = rel_path
    db.commit()
    db.refresh(sub)
    return {
        "id": sub.id,
        "final_documents_path": rel_path,
        "final_documents_url": f"/uploads/{rel_path}?XTransformPort=8000",
    }


@app.delete("/api/tenders/{tender_id}/submission/final-documents")
def delete_final_documents(tender_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    """Remove the final documents file."""
    sub = db.query(Submission).filter(Submission.tender_id == tender_id).first()
    if not sub:
        raise HTTPException(status_code=404, detail="Submission not found")
    if sub.final_documents_path:
        full_path = os.path.join(UPLOAD_DIR, sub.final_documents_path)
        if os.path.exists(full_path):
            try:
                os.unlink(full_path)
            except OSError:
                pass
        sub.final_documents_path = None
    db.commit()
    return {"deleted": True}


# ---------------------- Communication Routes ----------------------

@app.post("/api/tenders/{tender_id}/communications")
def create_communication(tender_id: int, payload: CommunicationCreate, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    if not db.query(Tender).filter(Tender.id == tender_id).first():
        raise HTTPException(status_code=404, detail="Tender not found")
    c = Communication(
        tender_id=tender_id,
        comm_type=payload.comm_type,
        subject=payload.subject,
        body=payload.body,
        comm_date=payload.comm_date,
        meeting_date=payload.meeting_date,
        meeting_location=payload.meeting_location,
        from_party=payload.from_party,
        to_party=payload.to_party,
        notes=payload.notes,
    )
    db.add(c)
    db.commit()
    db.refresh(c)
    return {"id": c.id, "comm_type": c.comm_type}


@app.post("/api/communications/{comm_id}/attachment")
async def upload_communication_attachment(
    comm_id: int,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Upload an attachment for a communication."""
    c = db.query(Communication).filter(Communication.id == comm_id).first()
    if not c:
        raise HTTPException(status_code=404, detail="Communication not found")
    rel_path = _save_upload(file, subdir=f"communications/{comm_id}")
    c.attachment_path = rel_path
    c.attachment_original_filename = file.filename
    db.commit()
    db.refresh(c)
    return {
        "id": c.id,
        "attachment_path": rel_path,
        "attachment_url": f"/uploads/{rel_path}?XTransformPort=8000",
        "attachment_filename": file.filename,
    }


@app.delete("/api/communications/{comm_id}/attachment")
def delete_communication_attachment(comm_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    """Remove an attachment from a communication."""
    c = db.query(Communication).filter(Communication.id == comm_id).first()
    if not c:
        raise HTTPException(status_code=404, detail="Communication not found")
    if c.attachment_path:
        full_path = os.path.join(UPLOAD_DIR, c.attachment_path)
        if os.path.exists(full_path):
            try:
                os.unlink(full_path)
            except OSError:
                pass
        c.attachment_path = None
        c.attachment_original_filename = None
    db.commit()
    return {"deleted": True}


@app.post("/api/communications/search-addendums")
def search_addendums(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """
    AI searches the web for addendums related to the user's active tenders.
    Returns a list of potential addendums found for each tender.
    """
    active_statuses = {"New Opportunity", "Under Review", "Interested", "Preparing",
                       "Documents Outstanding", "Pricing in Progress", "Awaiting Information",
                       "Ready for Submission", "Submitted", "Clarification Requested",
                       "Clarification Submitted", "Shortlisted", "Interview/Presentation",
                       "Negotiation"}
    active_tenders = db.query(Tender).filter(Tender.status.in_(active_statuses)).all()

    if not active_tenders:
        return {"results": [], "message": "No active tenders to search for addendums."}

    results = []
    for tender in active_tenders:
        # Build a search query for addendums for this tender
        query = f"{tender.reference_number} {tender.title} addendum site:etenders.gov.za OR site:tenderbulletins.co.za OR site:gov.za"
        try:
            raw_results = ai_module._gemini_web_search(query, num=5)
            if raw_results:
                # Use AI to filter for actual addendum results
                raw_text = json.dumps(raw_results, indent=2, default=str)[:5000]
                prompt = f"""Analyze these search results and identify ONLY actual addendum results for this tender.
Tender: {tender.reference_number} - {tender.title}
Client: {tender.client_company}

Search results:
{raw_text}

Return ONLY a JSON array of addendum results:
[{{"title": string, "url": string, "description": string, "date": string|null}}]
If no actual addendums found, return []."""
                try:
                    response = ai_module._gemini_chat(prompt, system="You are a tender addendum search assistant. Return ONLY valid JSON.")
                    response = response.strip()
                    first = response.find("[")
                    last = response.rfind("]")
                    if first >= 0 and last > first:
                        response = response[first:last + 1]
                    addendums = json.loads(response)
                    if isinstance(addendums, list) and addendums:
                        results.append({
                            "tender_id": tender.id,
                            "tender_reference": tender.reference_number,
                            "tender_title": tender.title,
                            "client": tender.client_company,
                            "addendums_found": addendums,
                        })
                except (json.JSONDecodeError, RuntimeError):
                    pass
        except Exception:
            pass

    return {
        "results": results,
        "total_tenders_searched": len(active_tenders),
        "total_with_addendums": len(results),
    }


@app.delete("/api/communications/{comm_id}")
def delete_communication(comm_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    c = db.query(Communication).filter(Communication.id == comm_id).first()
    if not c:
        raise HTTPException(status_code=404, detail="Communication not found")
    db.delete(c)
    db.commit()
    return {"deleted": True}


# ---------------------- Addendum Routes ----------------------

@app.post("/api/tenders/{tender_id}/addendums")
async def create_addendum(
    tender_id: int,
    addendum_number: Optional[str] = Form(None),
    title: str = Form(...),
    description: Optional[str] = Form(None),
    issued_date: Optional[str] = Form(None),
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    tender = db.query(Tender).filter(Tender.id == tender_id).first()
    if not tender:
        raise HTTPException(status_code=404, detail="Tender not found")
    rel_path = _save_upload(file, subdir=f"tenders/{tender_id}/addendums")
    addendum = Addendum(
        tender_id=tender_id,
        addendum_number=addendum_number,
        title=title,
        description=description,
        file_path=rel_path,
        issued_date=date.fromisoformat(issued_date) if issued_date else None,
    )
    db.add(addendum)
    db.commit()
    db.refresh(addendum)
    return {"id": addendum.id, "title": addendum.title}


@app.post("/api/addendums/{addendum_id}/ai-analyze")
def ai_analyze_addendum(addendum_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    addendum = db.query(Addendum).filter(Addendum.id == addendum_id).first()
    if not addendum:
        raise HTTPException(status_code=404, detail="Addendum not found")
    tender = addendum.tender
    # Get original tender text
    original_text = ""
    for doc in tender.documents:
        full_path = os.path.join(UPLOAD_DIR, doc.file_path)
        if os.path.exists(full_path):
            original_text += ai_module.extract_text_from_file(full_path, doc.original_filename) + "\n"
    # Also include the AI-extracted info for comparison
    if tender.ai_extracted_info:
        original_text += "\n\nAI EXTRACTED INFO:\n" + json.dumps(tender.ai_extracted_info, indent=2, default=str)[:5000]
    # Get addendum text
    addendum_path = os.path.join(UPLOAD_DIR, addendum.file_path)
    addendum_text = ""
    if os.path.exists(addendum_path):
        # Use the actual filename from the file path for extension detection
        addendum_filename = os.path.basename(addendum.file_path)
        addendum_text = ai_module.extract_text_from_file(addendum_path, addendum_filename)
    if len(addendum_text.strip()) < 50:
        raise HTTPException(status_code=400, detail="Could not extract addendum text")
    changes = ai_module.detect_addendum_changes(original_text, addendum_text)
    addendum.ai_changes = changes
    # Auto-update the tender checklist based on detected changes
    checklist_updated = False
    if changes and not changes.get("_error"):
        # Add new checklist items from checklist_additions
        additions = changes.get("checklist_additions", [])
        if isinstance(additions, list):
            for item_name in additions:
                if item_name and isinstance(item_name, str):
                    # Check if an item with the same name already exists
                    existing = db.query(ChecklistItem).filter(
                        ChecklistItem.tender_id == tender.id,
                        ChecklistItem.name == item_name[:500]
                    ).first()
                    if not existing:
                        db.add(ChecklistItem(
                            tender_id=tender.id,
                            name=item_name[:500],
                            description=f"Added by addendum: {addendum.title}",
                            category="Other",
                            mandatory=True,
                            status="Outstanding",
                            notes=f"New requirement from addendum #{addendum.addendum_number or ''}",
                        ))
                        checklist_updated = True
        # Mark items as Not Applicable if they're in checklist_removals
        removals = changes.get("checklist_removals", [])
        if isinstance(removals, list):
            for item_name in removals:
                if item_name and isinstance(item_name, str):
                    # Find matching checklist items (partial match)
                    matching = db.query(ChecklistItem).filter(
                        ChecklistItem.tender_id == tender.id,
                        ChecklistItem.status != "Not Applicable"
                    ).all()
                    for ci in matching:
                        if item_name.lower() in ci.name.lower() or ci.name.lower() in item_name.lower():
                            ci.status = "Not Applicable"
                            ci.notes = (ci.notes or "") + f"\nMarked N/A by addendum: {addendum.title}"
                            checklist_updated = True
                            break
        # If dates changed, update the tender's closing date if mentioned
        changed_dates = changes.get("changed_dates", [])
        if isinstance(changed_dates, list):
            for cd in changed_dates:
                if isinstance(cd, dict):
                    field = (cd.get("field") or "").lower()
                    to_val = cd.get("to", "")
                    if "closing" in field and to_val:
                        try:
                            new_date = date.fromisoformat(str(to_val)[:10])
                            tender.closing_date = new_date
                            checklist_updated = True
                        except (ValueError, TypeError):
                            pass
    db.commit()
    if checklist_updated:
        changes["checklist_updated"] = True
    return changes


@app.delete("/api/addendums/{addendum_id}")
def delete_addendum(addendum_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    a = db.query(Addendum).filter(Addendum.id == addendum_id).first()
    if not a:
        raise HTTPException(status_code=404, detail="Addendum not found")
    full_path = os.path.join(UPLOAD_DIR, a.file_path)
    if os.path.exists(full_path):
        try:
            os.unlink(full_path)
        except OSError:
            pass
    db.delete(a)
    db.commit()
    return {"deleted": True}


# ---------------------- Dashboard Route ----------------------

@app.get("/api/dashboard")
def dashboard(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    today = date.today()
    week_end = today + timedelta(days=7)
    month_end = today + timedelta(days=30)
    all_tenders = db.query(Tender).filter(Tender.created_by == user.id).all()
    active_statuses = {"New Opportunity", "Under Review", "Interested", "Preparing",
                       "Documents Outstanding", "Pricing in Progress", "Awaiting Information",
                       "Ready for Submission", "Submitted", "Clarification Requested",
                       "Clarification Submitted", "Shortlisted", "Interview/Presentation",
                       "Negotiation"}
    active = [t for t in all_tenders if t.status in active_statuses]
    # "Being Prepared" = tenders that have started preparation (checklist progress > 0)
    # OR have an explicit preparing status. This catches tenders added from Discover
    # (status "Interested") once the user starts uploading documents.
    preparing = []
    for t in all_tenders:
        if t.status in {"Preparing", "Documents Outstanding", "Pricing in Progress", "Awaiting Information"}:
            preparing.append(t)
            continue
        # Check if the tender has any checklist progress
        checklist = t.checklist_items or []
        if checklist:
            complete = sum(1 for c in checklist if c.status == "Complete")
            total_eligible = sum(1 for c in checklist if c.status != "Not Applicable")
            # Has progress but not fully complete (fully complete = Ready for Submission)
            if complete > 0 and complete < total_eligible and t.status not in {"Ready for Submission", "Submitted", "Awarded", "Unsuccessful", "Withdrawn", "Cancelled", "Expired"}:
                preparing.append(t)
    ready = [t for t in all_tenders if t.status == "Ready for Submission"]
    submitted = [t for t in all_tenders if t.status == "Submitted"]
    # Closing soon (next 7 days, not closed)
    closing_this_week = []
    closing_this_month = []
    for t in all_tenders:
        if t.closing_date and t.status not in {"Awarded", "Unsuccessful", "Withdrawn", "Cancelled", "Expired"}:
            delta = (t.closing_date - today).days
            if 0 <= delta <= 7:
                closing_this_week.append(t)
            if 0 <= delta <= 30:
                closing_this_month.append(t)
    next_deadline = None
    upcoming = sorted([t for t in all_tenders if t.closing_date and t.closing_date >= today and t.status in active_statuses], key=lambda x: x.closing_date)
    if upcoming:
        n = upcoming[0]
        next_deadline = {
            "id": n.id, "reference_number": n.reference_number,
            "title": n.title, "closing_date": n.closing_date.isoformat(),
            "days_remaining": (n.closing_date - today).days,
        }
    # Documents
    library_docs = db.query(LibraryDocument).filter(LibraryDocument.created_by == user.id).all()
    docs_expiring_soon = []
    docs_expired = []
    for d in library_docs:
        if d.expiry_date:
            delta = (d.expiry_date - today).days
            if delta < 0:
                docs_expired.append(d)
            elif delta <= 30:
                docs_expiring_soon.append(d)
    # Documents missing across active tenders
    docs_missing = 0
    for t in active:
        for c in t.checklist_items:
            if c.status == "Outstanding":
                docs_missing += 1
    # Awarded this year
    awarded_this_year = [t for t in all_tenders if t.outcome == "Awarded" and t.updated_at and t.updated_at.year == today.year]
    unsuccessful = [t for t in all_tenders if t.outcome == "Unsuccessful"]

    # Status breakdown
    status_counts = {}
    for t in all_tenders:
        status_counts[t.status] = status_counts.get(t.status, 0) + 1

    return {
        "active_count": len(active),
        "preparing_count": len(preparing),
        "ready_count": len(ready),
        "submitted_count": len(submitted),
        "closing_this_week": len(closing_this_week),
        "closing_this_month": len(closing_this_month),
        "next_deadline": next_deadline,
        "docs_missing": docs_missing,
        "docs_expiring_soon": len(docs_expiring_soon),
        "docs_expired": len(docs_expired),
        "awarded_this_year": len(awarded_this_year),
        "unsuccessful_count": len(unsuccessful),
        "total_tenders": len(all_tenders),
        "status_counts": status_counts,
        "closing_this_week_list": [
            {"id": t.id, "reference_number": t.reference_number, "title": t.title,
             "client_company": t.client_company,
             "closing_date": t.closing_date.isoformat(), "status": t.status,
             "days_remaining": (t.closing_date - today).days}
            for t in sorted(closing_this_week, key=lambda x: x.closing_date)
        ],
        "docs_expiring_list": [
            {"id": d.id, "name": d.name, "category": d.category,
             "expiry_date": d.expiry_date.isoformat(),
             "days_to_expiry": (d.expiry_date - today).days}
            for d in sorted(docs_expiring_soon + docs_expired, key=lambda x: x.expiry_date)
        ],
        "awarded_this_year_list": [
            {"id": t.id, "reference_number": t.reference_number, "title": t.title,
             "client_company": t.client_company,
             "estimated_value": t.estimated_value}
            for t in awarded_this_year
        ],
    }


# ---------------------- Company Profile (Branding) ----------------------

@app.get("/api/company-profile")
def get_company_profile(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    """Get the company profile/branding settings for the current user."""
    profile = db.query(CompanyProfile).filter(CompanyProfile.user_id == user.id).first()
    if not profile:
        # Return defaults
        return {
            "company_name": user.company_name or user.full_name,
            "registration_number": None,
            "vat_number": None,
            "psira_number": None,
            "bbbbee_level": None,
            "address": None,
            "phone": None,
            "email": user.email,
            "website": None,
            "logo_path": None,
            "primary_color": "#0f766e",
            "font_family": "Arial, sans-serif",
            "letterhead_tagline": None,
            "director_name": user.full_name,
            "director_title": "Director",
            "organogram_path": None,
            "organogram_url": None,
            "organogram_text": None,
            "signature_path": None,
            "signature_url": None,
            "letterhead_path": None,
            "letterhead_url": None,
            "company_profile_doc_path": None,
            "company_profile_doc_url": None,
        }
    return {
        "id": profile.id,
        "company_name": profile.company_name,
        "registration_number": profile.registration_number,
        "vat_number": profile.vat_number,
        "psira_number": profile.psira_number,
        "bbbbee_level": profile.bbbbee_level,
        "address": profile.address,
        "phone": profile.phone,
        "email": profile.email,
        "website": profile.website,
        "logo_path": profile.logo_path,
        "primary_color": profile.primary_color,
        "font_family": profile.font_family,
        "letterhead_tagline": profile.letterhead_tagline,
        "director_name": profile.director_name,
        "director_title": profile.director_title,
        "organogram_path": profile.organogram_path,
        "organogram_url": f"/uploads/{profile.organogram_path}?XTransformPort=8000" if profile.organogram_path else None,
        "organogram_text": profile.organogram_text,
        "signature_path": profile.signature_path,
        "signature_url": f"/uploads/{profile.signature_path}?XTransformPort=8000" if profile.signature_path else None,
        "letterhead_path": profile.letterhead_path,
        "letterhead_url": f"/uploads/{profile.letterhead_path}?XTransformPort=8000" if profile.letterhead_path else None,
        "company_profile_doc_path": profile.company_profile_doc_path,
        "company_profile_doc_url": f"/uploads/{profile.company_profile_doc_path}?XTransformPort=8000" if profile.company_profile_doc_path else None,
    }


@app.put("/api/company-profile")
def update_company_profile(
    payload: dict,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Create or update the company profile/branding settings."""
    profile = db.query(CompanyProfile).filter(CompanyProfile.user_id == user.id).first()
    if not profile:
        profile = CompanyProfile(
            user_id=user.id,
            company_name=payload.get("company_name", user.company_name or user.full_name),
        )
        db.add(profile)
    # Update all fields
    for field in ["company_name", "registration_number", "vat_number", "psira_number",
                  "bbbbee_level", "address", "phone", "email", "website",
                  "logo_path", "primary_color", "font_family",
                  "letterhead_tagline", "director_name", "director_title"]:
        if field in payload:
            setattr(profile, field, payload[field])
    db.commit()
    db.refresh(profile)
    return {"id": profile.id, "company_name": profile.company_name, "updated": True}


@app.post("/api/company-profile/logo")
async def upload_company_logo(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Upload a company logo for the letterhead."""
    rel_path = _save_upload(file, subdir="company")
    profile = db.query(CompanyProfile).filter(CompanyProfile.user_id == user.id).first()
    if not profile:
        profile = CompanyProfile(
            user_id=user.id,
            company_name=user.company_name or user.full_name,
            logo_path=rel_path,
        )
        db.add(profile)
    else:
        profile.logo_path = rel_path
    db.commit()
    return {"logo_path": rel_path, "url": f"/uploads/{rel_path}?XTransformPort=8000"}


@app.post("/api/company-profile/organogram")
async def upload_company_organogram(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Upload the company organogram. AI extracts the text so generated organograms match the real structure."""
    rel_path = _save_upload(file, subdir="company")
    profile = db.query(CompanyProfile).filter(CompanyProfile.user_id == user.id).first()
    if not profile:
        profile = CompanyProfile(
            user_id=user.id,
            company_name=user.company_name or user.full_name,
            organogram_path=rel_path,
        )
        db.add(profile)
    else:
        profile.organogram_path = rel_path
    # Extract text from the organogram file so the AI can use it when generating organogram documents
    full_path = os.path.join(UPLOAD_DIR, rel_path)
    organogram_text = ""
    if os.path.exists(full_path):
        try:
            organogram_text = ai_module.extract_text_from_file(full_path, file.filename)
            if len(organogram_text) > 10000:
                organogram_text = organogram_text[:10000]
        except Exception:
            organogram_text = ""
    profile.organogram_text = organogram_text or None
    db.commit()
    db.refresh(profile)
    return {
        "organogram_path": rel_path,
        "organogram_url": f"/uploads/{rel_path}?XTransformPort=8000",
        "organogram_text": organogram_text[:500] + "..." if len(organogram_text) > 500 else organogram_text,
        "text_extracted": bool(organogram_text),
    }


@app.delete("/api/company-profile/organogram")
def delete_company_organogram(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    """Remove the company organogram."""
    profile = db.query(CompanyProfile).filter(CompanyProfile.user_id == user.id).first()
    if not profile:
        raise HTTPException(status_code=404, detail="Company profile not found")
    if profile.organogram_path:
        full_path = os.path.join(UPLOAD_DIR, profile.organogram_path)
        if os.path.exists(full_path):
            try:
                os.unlink(full_path)
            except OSError:
                pass
        profile.organogram_path = None
        profile.organogram_text = None
    db.commit()
    return {"deleted": True}


@app.post("/api/company-profile/signature")
async def upload_company_signature(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Upload a signature image (drawn or scanned). Used by AI in document signature blocks."""
    rel_path = _save_upload(file, subdir="company")
    profile = db.query(CompanyProfile).filter(CompanyProfile.user_id == user.id).first()
    if not profile:
        profile = CompanyProfile(
            user_id=user.id,
            company_name=user.company_name or user.full_name,
            signature_path=rel_path,
        )
        db.add(profile)
    else:
        profile.signature_path = rel_path
    db.commit()
    db.refresh(profile)
    return {
        "signature_path": rel_path,
        "signature_url": f"/uploads/{rel_path}?XTransformPort=8000",
    }


@app.delete("/api/company-profile/signature")
def delete_company_signature(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    """Remove the signature image."""
    profile = db.query(CompanyProfile).filter(CompanyProfile.user_id == user.id).first()
    if not profile:
        raise HTTPException(status_code=404, detail="Company profile not found")
    if profile.signature_path:
        full_path = os.path.join(UPLOAD_DIR, profile.signature_path)
        if os.path.exists(full_path):
            try:
                os.unlink(full_path)
            except OSError:
                pass
        profile.signature_path = None
    db.commit()
    return {"deleted": True}


@app.post("/api/company-profile/letterhead")
async def upload_company_letterhead(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Upload a letterhead image/template. The AI will use it when generating documents."""
    rel_path = _save_upload(file, subdir="company")
    profile = db.query(CompanyProfile).filter(CompanyProfile.user_id == user.id).first()
    if not profile:
        profile = CompanyProfile(
            user_id=user.id,
            company_name=user.company_name or user.full_name,
            letterhead_path=rel_path,
        )
        db.add(profile)
    else:
        profile.letterhead_path = rel_path
    db.commit()
    db.refresh(profile)
    return {
        "letterhead_path": rel_path,
        "letterhead_url": f"/uploads/{rel_path}?XTransformPort=8000",
    }


@app.delete("/api/company-profile/letterhead")
def delete_company_letterhead(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    """Remove the letterhead image."""
    profile = db.query(CompanyProfile).filter(CompanyProfile.user_id == user.id).first()
    if not profile:
        raise HTTPException(status_code=404, detail="Company profile not found")
    if profile.letterhead_path:
        full_path = os.path.join(UPLOAD_DIR, profile.letterhead_path)
        if os.path.exists(full_path):
            try:
                os.unlink(full_path)
            except OSError:
                pass
        profile.letterhead_path = None
    db.commit()
    return {"deleted": True}


# ---------------------- AI Document Generation ----------------------

@app.get("/api/tenders/{tender_id}/documents/generated")
def list_generated_documents(tender_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    """List all AI-generated documents for a tender."""
    docs = db.query(GeneratedDocument).filter(GeneratedDocument.tender_id == tender_id).all()
    return {"items": [
        {
            "id": g.id, "doc_type": g.doc_type, "title": g.title,
            "created_at": g.created_at.isoformat() if g.created_at else None,
            "updated_at": g.updated_at.isoformat() if g.updated_at else None,
            "content_length": len(g.content) if g.content else 0,
        } for g in docs
    ]}


@app.post("/api/tenders/{tender_id}/documents/generate")
def generate_document(
    tender_id: int,
    payload: dict,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Generate a tender-specific document using AI.
    payload: { doc_type: 'method_statement' | 'implementation_plan' | 'technical_proposal' | 'risk_assessment' | 'sops' | 'table_of_contents' }
    """
    doc_type = payload.get("doc_type")
    if not doc_type or doc_type not in ai_module.DOCUMENT_GENERATORS:
        raise HTTPException(status_code=400, detail=f"Invalid doc_type. Must be one of: {list(ai_module.DOCUMENT_GENERATORS.keys())}")

    tender = db.query(Tender).filter(Tender.id == tender_id).first()
    if not tender:
        raise HTTPException(status_code=404, detail="Tender not found")

    # Get company profile (+ what the AI knows from the knowledge base)
    company = _company_for_generation(db, user)

    tender_data = {
        "reference_number": tender.reference_number,
        "title": tender.title,
        "client_company": tender.client_company,
        "location_site": tender.location_site,
        "contract_period": tender.contract_period,
        "scope_of_work": tender.scope_of_work,
        "estimated_value": tender.estimated_value,
    }
    extracted = tender.ai_extracted_info or {}

    # Generate the document
    generator = ai_module.DOCUMENT_GENERATORS[doc_type]
    content = generator(tender_data, extracted, company)

    doc_info = ai_module.DOCUMENT_TYPE_INFO[doc_type]
    title = f"{doc_info['title']} — {tender.reference_number}"

    # Check if a doc of this type already exists — replace it
    existing = db.query(GeneratedDocument).filter(
        GeneratedDocument.tender_id == tender_id,
        GeneratedDocument.doc_type == doc_type,
    ).first()

    if existing:
        existing.title = title
        existing.content = content
        existing.updated_at = datetime.utcnow()
        db.commit()
        db.refresh(existing)
        return {
            "id": existing.id, "doc_type": existing.doc_type, "title": existing.title,
            "content": existing.content,
            "created_at": existing.created_at.isoformat() if existing.created_at else None,
            "updated_at": existing.updated_at.isoformat() if existing.updated_at else None,
        }
    else:
        new_doc = GeneratedDocument(
            tender_id=tender_id,
            doc_type=doc_type,
            title=title,
            content=content,
        )
        db.add(new_doc)
        db.commit()
        db.refresh(new_doc)
        return {
            "id": new_doc.id, "doc_type": new_doc.doc_type, "title": new_doc.title,
            "content": new_doc.content,
            "created_at": new_doc.created_at.isoformat() if new_doc.created_at else None,
            "updated_at": new_doc.updated_at.isoformat() if new_doc.updated_at else None,
        }


@app.get("/api/tenders/{tender_id}/documents/generated/{doc_id}")
def get_generated_document(tender_id: int, doc_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    """Get the full content of a generated document."""
    doc = db.query(GeneratedDocument).filter(
        GeneratedDocument.id == doc_id,
        GeneratedDocument.tender_id == tender_id,
    ).first()
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
    return {
        "id": doc.id, "doc_type": doc.doc_type, "title": doc.title,
        "content": doc.content, "table_of_contents": doc.table_of_contents,
        "created_at": doc.created_at.isoformat() if doc.created_at else None,
        "updated_at": doc.updated_at.isoformat() if doc.updated_at else None,
    }


@app.delete("/api/tenders/{tender_id}/documents/generated/{doc_id}")
def delete_generated_document(tender_id: int, doc_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    """Delete a generated document."""
    doc = db.query(GeneratedDocument).filter(
        GeneratedDocument.id == doc_id,
        GeneratedDocument.tender_id == tender_id,
    ).first()
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
    db.delete(doc)
    db.commit()
    return {"deleted": True}


def _scoped_library_docs(db: Session, user: User) -> list:
    """The caller's compliance library, with expiry status resolved."""
    import ai_agent as _agent

    scope = _agent.resolve_scope(db, user)
    today = date.today()
    out = []
    for d in db.query(LibraryDocument).filter(
        LibraryDocument.created_by.in_(scope["member_ids"])
    ).all():
        days_to_expiry = None
        doc_status = "Active"
        if d.expiry_date:
            days_to_expiry = (d.expiry_date - today).days
            if days_to_expiry < 0:
                doc_status = "Expired"
            elif days_to_expiry <= 30:
                doc_status = "Expiring Soon"
        out.append({
            "id": d.id, "name": d.name, "category": d.category,
            "filename": d.filename, "file_path": d.file_path, "file_type": d.file_type,
            "expiry_date": d.expiry_date.isoformat() if d.expiry_date else None,
            "days_to_expiry": days_to_expiry, "status": doc_status,
        })
    return out


def _tender_for_pack(tender_id: int, db: Session):
    tender = db.query(Tender).filter(Tender.id == tender_id).first()
    if not tender:
        raise HTTPException(status_code=404, detail="Tender not found")
    return tender


def _pack_inputs(tender, db: Session, user: User):
    checklist = [
        {
            "name": c.name, "status": c.status, "category": c.category,
            "mandatory": c.mandatory, "description": c.description,
            "library_category": c.library_category,
            "linked_library_doc_id": c.linked_library_doc_id,
        }
        for c in tender.checklist_items
    ]
    library_docs = _scoped_library_docs(db, user)
    generated = [
        {"id": g.id, "doc_type": g.doc_type, "title": g.title}
        for g in db.query(GeneratedDocument).filter(
            GeneratedDocument.tender_id == tender.id
        ).all()
    ]
    return checklist, library_docs, generated


def _company_for_generation(db: Session, user: User) -> dict:
    """Company facts + what the AI knows from the knowledge base, for writing docs."""
    import ai_agent as _agent

    profile = db.query(CompanyProfile).filter(CompanyProfile.user_id == user.id).first()
    company = {
        "company_name": profile.company_name if profile else (user.company_name or user.full_name),
        "registration_number": profile.registration_number if profile else None,
        "vat_number": profile.vat_number if profile else None,
        "psira_number": profile.psira_number if profile else None,
        "bbbbee_level": profile.bbbbee_level if profile else None,
        "address": profile.address if profile else None,
        "phone": profile.phone if profile else None,
        "email": profile.email if profile else user.email,
        "website": profile.website if profile else None,
        "director_name": profile.director_name if profile else user.full_name,
        "director_title": profile.director_title if profile else "Director",
        "organogram_text": profile.organogram_text if profile else None,
        "signature_url": (
            f"/uploads/{profile.signature_path}" if profile and profile.signature_path else None
        ),
        "letterhead_url": (
            f"/uploads/{profile.letterhead_path}" if profile and profile.letterhead_path else None
        ),
    }
    scope = _agent.resolve_scope(db, user)
    try:
        company["knowledge_base"] = _agent._capability_profile(db, user, scope)[:6000]
    except Exception:
        company["knowledge_base"] = ""
    return company


@app.get("/api/tenders/{tender_id}/documents/pack")
def get_document_pack(
    tender_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """The documents this tender actually needs, each resolved to its real status.

    Compliance items (CIPC, B-BBEE, PSIRA, tax clearance...) are matched against
    the tenant's library; documents we can write are matched against what has
    already been generated. Anything unmatched is reported as MISSING.
    """
    tender = _tender_for_pack(tender_id, db)
    checklist, library_docs, generated = _pack_inputs(tender, db, user)

    extracted = tender.ai_extracted_info or {}
    smart_docs = []
    if extracted and not extracted.get("_error"):
        try:
            smart_docs = ai_module.analyze_required_documents(extracted, {
                "reference_number": tender.reference_number,
                "title": tender.title,
                "client_company": tender.client_company,
                "scope_of_work": tender.scope_of_work,
            })
        except Exception:
            smart_docs = []

    pack = ai_module.build_document_pack(checklist, library_docs, generated, smart_docs)
    return {
        "tender_id": tender_id,
        "items": pack,
        "summary": ai_module.document_pack_summary(pack),
        "library_documents": library_docs,
    }


@app.post("/api/tenders/{tender_id}/documents/prepare")
def prepare_documents(
    tender_id: int,
    payload: dict = None,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Bring together every document this tender needs, in one action.

    - compliance documents are linked from the library (never invented);
    - documents we can write are generated from the tenant's knowledge base;
    - anything that cannot be produced is reported as missing so the user
      knows exactly what they must still obtain.
    """
    payload = payload or {}
    only = payload.get("doc_types")
    tender = _tender_for_pack(tender_id, db)
    checklist, library_docs, generated = _pack_inputs(tender, db, user)

    extracted = tender.ai_extracted_info or {}
    smart_docs = []
    if extracted and not extracted.get("_error"):
        try:
            smart_docs = ai_module.analyze_required_documents(extracted, {
                "reference_number": tender.reference_number,
                "title": tender.title,
                "client_company": tender.client_company,
                "scope_of_work": tender.scope_of_work,
            })
        except Exception:
            smart_docs = []

    # The AI analyser may be unavailable; the checklist always tells us which
    # documents this bid needs written, so prepare never comes up empty.
    import submission as _submission
    for item in _submission.writable_requirements_from_checklist(checklist, generated):
        if not any(s.get("doc_type") == item["doc_type"] for s in smart_docs):
            smart_docs.append(item)

    pack = ai_module.build_document_pack(checklist, library_docs, generated, smart_docs)

    tender_data = {
        "reference_number": tender.reference_number,
        "title": tender.title,
        "client_company": tender.client_company,
        "location_site": tender.location_site,
        "contract_period": tender.contract_period,
        "scope_of_work": tender.scope_of_work,
        "estimated_value": tender.estimated_value,
    }
    company = _company_for_generation(db, user)

    written, failed = [], []
    # Each document is an AI call, and this endpoint sits behind a ~60s Hosting
    # proxy. Work in bounded batches and report what is left so the caller can
    # continue, rather than timing out halfway through a bid pack.
    pending = [
        e for e in pack
        if e["kind"] == "content" and e.get("status") != "generated"
        and (not only or e.get("doc_type") in only)
    ]
    batch = pending[: max(1, min(int((payload or {}).get("max_docs") or 4), 8))]
    import time as _time
    deadline = _time.monotonic() + 40

    for entry in batch:
        if _time.monotonic() > deadline:
            break
        doc_type = entry["doc_type"]
        try:
            generator = ai_module.DOCUMENT_GENERATORS[doc_type]
            content = generator(tender_data, extracted, company)
        except Exception as exc:
            failed.append({"doc_type": doc_type, "title": entry["title"],
                           "error": str(exc)[:160]})
            continue
        if not content or content.startswith("Document generation failed") \
                or content.startswith("[AI edit unavailable"):
            failed.append({"doc_type": doc_type, "title": entry["title"],
                           "error": "AI unavailable"})
            continue

        info = ai_module.DOCUMENT_TYPE_INFO[doc_type]
        title = f"{info['title']} — {tender.reference_number}"
        existing = db.query(GeneratedDocument).filter(
            GeneratedDocument.tender_id == tender_id,
            GeneratedDocument.doc_type == doc_type,
        ).first()
        if existing:
            existing.title = title
            existing.content = content
            existing.updated_at = datetime.utcnow()
        else:
            db.add(GeneratedDocument(tender_id=tender_id, doc_type=doc_type,
                                     title=title, content=content))
        written.append({"doc_type": doc_type, "title": entry["title"]})
    db.commit()

    checklist, library_docs, generated = _pack_inputs(tender, db, user)
    pack = ai_module.build_document_pack(checklist, library_docs, generated, smart_docs)
    still_pending = sum(
        1 for e in pack if e["kind"] == "content" and e.get("status") != "generated"
    )
    return {
        "tender_id": tender_id,
        "written": written,
        "failed": failed,
        "items": pack,
        "summary": ai_module.document_pack_summary(pack),
        "remaining": still_pending,
        "complete": still_pending == 0,
    }


@app.post("/api/tenders/{tender_id}/documents/generated/{doc_id}/ai-edit")
def ai_edit_document(
    tender_id: int,
    doc_id: int,
    payload: dict,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Let the AI revise a prepared document; the user reviews and edits afterwards."""
    doc = db.query(GeneratedDocument).filter(
        GeneratedDocument.id == doc_id,
        GeneratedDocument.tender_id == tender_id,
    ).first()
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")

    instruction = (payload or {}).get("instruction")
    if not instruction or not str(instruction).strip():
        raise HTTPException(status_code=400, detail="An edit instruction is required")

    tender = _tender_for_pack(tender_id, db)
    tender_data = {
        "reference_number": tender.reference_number,
        "title": tender.title,
        "client_company": tender.client_company,
        "location_site": tender.location_site,
        "contract_period": tender.contract_period,
        "scope_of_work": tender.scope_of_work,
        "estimated_value": tender.estimated_value,
    }
    company = _company_for_generation(db, user)
    revised = ai_module.ai_edit_document(doc.content, instruction, tender_data, company)

    if not revised or revised.startswith("[AI edit unavailable"):
        # Leave the user's document untouched rather than damaging it.
        return {
            "id": doc.id, "doc_type": doc.doc_type, "title": doc.title,
            "content": doc.content, "updated": False,
            "message": "The AI could not edit this document right now. Your version is unchanged.",
        }

    doc.content = revised
    doc.updated_at = datetime.utcnow()
    db.commit()
    return {
        "id": doc.id, "doc_type": doc.doc_type, "title": doc.title,
        "content": doc.content, "updated": True,
    }


@app.get("/api/ai/submission-readiness")
def ai_submission_readiness(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """A compact readiness view of every live tender, for the AI assistant.

    One pass over the bidder's tenders so the assistant can say which bids are
    ready to send and exactly what is holding the others up, without the user
    having to open each tender.
    """
    import submission as _submission
    import ai_agent as _agent

    scope = _agent.resolve_scope(db, user)
    library_docs = _scoped_library_docs(db, user)
    today = date.today()

    tenders = (
        db.query(Tender)
        .filter(
            Tender.created_by.in_(scope["member_ids"]),
            Tender.status.notin_(["Awarded", "Unsuccessful", "Withdrawn"]),
        )
        .all()
    )

    items = []
    for t in tenders:
        generated = [
            {"id": g.id, "doc_type": g.doc_type, "title": g.title}
            for g in db.query(GeneratedDocument).filter(
                GeneratedDocument.tender_id == t.id
            ).all()
        ]
        try:
            r = _submission.build_submission_readiness(db, t, library_docs, generated)
        except Exception:
            continue
        days = (t.closing_date - today).days if t.closing_date else None
        items.append({
            "tender_id": t.id,
            "reference_number": t.reference_number,
            "title": t.title,
            "client_company": t.client_company,
            "closing_date": t.closing_date.isoformat() if t.closing_date else None,
            "days_left": days,
            "score": r["score"],
            "ready_to_submit": r["ready_to_submit"],
            "already_submitted": r["already_submitted"],
            "source": r["source"],
            "issuer_company": r["issuer_company"],
            "blocking_issues": r["blocking_issues"],
            "checks": [
                {"key": c["key"], "label": c["label"], "status": c["status"],
                 "detail": c["detail"], "blocking": c["blocking"], "items": c["items"][:6]}
                for c in r["checks"]
            ],
        })

    items.sort(key=lambda i: (i["already_submitted"], -i["score"], i["days_left"] or 9999))
    return {
        "items": items,
        "ready_count": sum(1 for i in items if i["ready_to_submit"] and not i["already_submitted"]),
        "attention_count": sum(
            1 for i in items if not i["ready_to_submit"] and not i["already_submitted"]
        ),
    }


@app.get("/api/tenders/{tender_id}/submission-readiness")
def submission_readiness(
    tender_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Everything that must be true before this bid can be sent.

    Deterministic and free: checks every required document, certificate expiry,
    checklist state and the closing date, and reports whether the tender was
    issued through this system (submit in-app) or externally (export a bundle).
    """
    import submission as _submission

    tender = db.query(Tender).filter(Tender.id == tender_id).first()
    if not tender:
        raise HTTPException(status_code=404, detail="Tender not found")

    library_docs = _scoped_library_docs(db, user)
    generated = [
        {"id": g.id, "doc_type": g.doc_type, "title": g.title,
         "content_length": len(g.content or "")}
        for g in db.query(GeneratedDocument).filter(
            GeneratedDocument.tender_id == tender_id
        ).all()
    ]
    return _submission.build_submission_readiness(db, tender, library_docs, generated)


@app.get("/api/tenders/{tender_id}/submission-bundle.zip")
def submission_bundle(
    tender_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Download the complete bid as a ZIP.

    Used when the issuer is outside this system: the bidder gets every
    certificate, the tender document, everything the AI wrote, and a manifest
    showing the readiness of the pack.
    """
    import submission as _submission

    tender = db.query(Tender).filter(Tender.id == tender_id).first()
    if not tender:
        raise HTTPException(status_code=404, detail="Tender not found")

    library_docs = _scoped_library_docs(db, user)
    generated_rows = db.query(GeneratedDocument).filter(
        GeneratedDocument.tender_id == tender_id
    ).all()
    generated = [{"id": g.id, "doc_type": g.doc_type, "title": g.title} for g in generated_rows]
    readiness = _submission.build_submission_readiness(db, tender, library_docs, generated)

    contents = {g.id: g.content for g in generated_rows if g.content}
    profile = db.query(CompanyProfile).filter(CompanyProfile.user_id == user.id).first()
    company_name = (
        (profile.company_name if profile else None)
        or user.company_name or user.full_name or "Bidder"
    )

    data = _submission.build_submission_bundle(
        readiness,
        UPLOAD_DIR,
        contents,
        tender.reference_number,
        company_name,
    )
    filename = f"bid-pack-{tender.reference_number}.zip".replace("/", "-")
    return Response(
        content=data,
        media_type="application/zip",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@app.post("/api/tenders/{tender_id}/submit")
def submit_bid(
    tender_id: int,
    payload: dict = None,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Submit this bid to the issuer, when the tender came from this system.

    Refuses unless the readiness assessment is 100%: every required document
    held, no expired certificates, checklist complete and the tender still open.
    """
    import submission as _submission

    payload = payload or {}
    tender = db.query(Tender).filter(Tender.id == tender_id).first()
    if not tender:
        raise HTTPException(status_code=404, detail="Tender not found")

    library_docs = _scoped_library_docs(db, user)
    generated_rows = db.query(GeneratedDocument).filter(
        GeneratedDocument.tender_id == tender_id
    ).all()
    generated = [{"id": g.id, "doc_type": g.doc_type, "title": g.title} for g in generated_rows]
    readiness = _submission.build_submission_readiness(db, tender, library_docs, generated)

    if not readiness["ready_to_submit"]:
        raise HTTPException(
            status_code=409,
            detail={
                "message": "This bid is not ready to submit yet.",
                "blocking_issues": readiness["blocking_issues"],
                "score": readiness["score"],
                "checks": readiness["checks"],
            },
        )

    if readiness["source"] != "system":
        raise HTTPException(
            status_code=409,
            detail={
                "message": (
                    "This tender was not issued through this system, so it cannot be "
                    "submitted here. Download the submission bundle instead."
                ),
                "source": "external",
            },
        )

    from database import Bid, BidDocument, IssuerCompany, IssuedTender

    issued = db.query(IssuedTender).filter(
        IssuedTender.id == readiness["issued_tender_id"]
    ).first()
    profile = db.query(CompanyProfile).filter(CompanyProfile.user_id == user.id).first()

    existing = db.query(Bid).filter(
        Bid.tender_id == issued.id,
        Bid.bidder_email == user.email,
    ).first()
    if existing:
        raise HTTPException(status_code=409, detail="You have already bid on this tender.")

    bid = Bid(
        tender_id=issued.id,
        bidder_company_name=(
            (profile.company_name if profile else None) or user.company_name or user.full_name
        ),
        bidder_email=user.email,
        bidder_contact_person=(profile.director_name if profile else None) or user.full_name,
        bidder_phone=profile.phone if profile else None,
        bidder_bbbee_level=profile.bbbbee_level if profile else None,
        total_amount=float(payload.get("total_amount") or tender.estimated_value or 0),
        proposal_summary=payload.get("proposal_summary")
        or f"Submission for {issued.title} submitted via TM Flow.",
        status="Pending",
        submitted_at=datetime.utcnow(),
    )
    db.add(bid)
    db.flush()

    # Attach every file that made up the bid.
    def _attach(abs_path: Optional[str], filename: str, doc_type: Optional[str],
                original: Optional[str] = None, size: Optional[int] = None):
        if not abs_path or not os.path.isfile(abs_path):
            return
        db.add(BidDocument(
            bid_id=bid.id, doc_type=doc_type, filename=filename,
            original_filename=original or filename, file_path=abs_path,
            file_type=os.path.splitext(filename)[1] or None, file_size=size,
        ))

    for d in library_docs:
        _attach(os.path.join(UPLOAD_DIR, d.get("file_path") or ""),
                d.get("filename") or d.get("name"), d.get("category"),
                original=d.get("name"))
    for d in readiness["documents"]["tender"]:
        _attach(os.path.join(UPLOAD_DIR, d.get("file_path") or ""),
                d.get("filename") or "tender-document", "Tender Document",
                original=d.get("original_filename"))
    for g in generated_rows:
        if not g.content:
            continue
        target_dir = os.path.join(UPLOAD_DIR, "bids", str(bid.id))
        os.makedirs(target_dir, exist_ok=True)
        fname = f"{g.doc_type}_{tender.reference_number}.txt".replace("/", "-")
        full = os.path.join(target_dir, fname)
        with open(full, "w", encoding="utf-8") as fh:
            fh.write(g.content)
        _attach(full, fname, g.title or g.doc_type, original=g.title)

    # Record the submission on the bidder's own tender.
    sub = db.query(Submission).filter(Submission.tender_id == tender.id).first()
    if sub is None:
        sub = Submission(tender_id=tender.id)
        db.add(sub)
    sub.submission_date = datetime.utcnow().date()
    sub.submission_time = datetime.utcnow().time()
    sub.submitted_by = user.full_name
    sub.submission_method = "Submitted via TM Flow"
    sub.confirmation_reference = f"BID-{bid.id}"
    sub.notes = "Submitted through TM Flow to the issuing organisation."
    tender.status = "Submitted"
    db.commit()
    db.refresh(bid)

    issuer = db.query(IssuerCompany).filter(IssuerCompany.id == issued.company_id).first()
    return {
        "submitted": True,
        "bid_id": bid.id,
        "status": bid.status,
        "reference_number": sub.confirmation_reference,
        "issued_tender_id": issued.id,
        "issuer": issuer.name if issuer else None,
        "documents_attached": len(bid.documents) if bid.documents else 0,
    }


@app.put("/api/tenders/{tender_id}/documents/generated/{doc_id}")
def update_generated_document(
    tender_id: int,
    doc_id: int,
    payload: dict,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Edit a generated document (title + content)."""
    doc = db.query(GeneratedDocument).filter(
        GeneratedDocument.id == doc_id,
        GeneratedDocument.tender_id == tender_id,
    ).first()
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
    if "title" in payload:
        doc.title = payload["title"]
    if "content" in payload:
        doc.content = payload["content"]
    if "doc_type" in payload:
        doc.doc_type = payload["doc_type"]
    doc.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(doc)
    return {
        "id": doc.id, "doc_type": doc.doc_type, "title": doc.title,
        "content": doc.content,
        "created_at": doc.created_at.isoformat() if doc.created_at else None,
        "updated_at": doc.updated_at.isoformat() if doc.updated_at else None,
    }


@app.post("/api/tenders/{tender_id}/documents/generate-by-prompt")
def generate_document_by_prompt_endpoint(
    tender_id: int,
    payload: dict,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Generate any document via a natural-language prompt. Async job pattern —
    returns a job_id immediately, frontend polls GET .../generate-by-prompt/{job_id}."""
    prompt = (payload.get("prompt") or "").strip()
    if not prompt:
        raise HTTPException(status_code=400, detail="A prompt is required.")
    custom_title = (payload.get("title") or "").strip() or "Custom Document"

    tender = db.query(Tender).filter(Tender.id == tender_id).first()
    if not tender:
        raise HTTPException(status_code=404, detail="Tender not found")

    # Get company profile
    profile = db.query(CompanyProfile).filter(CompanyProfile.user_id == user.id).first()
    company = {
        "company_name": profile.company_name if profile else (user.company_name or user.full_name),
        "registration_number": profile.registration_number if profile else None,
        "bbbbee_level": profile.bbbbee_level if profile else None,
        "email": profile.email if profile else user.email,
        "phone": profile.phone if profile else None,
    }

    tender_data = {
        "reference_number": tender.reference_number,
        "title": tender.title,
        "client_company": tender.client_company,
        "location_site": tender.location_site,
        "contract_period": tender.contract_period,
        "scope_of_work": tender.scope_of_work,
        "description": tender.description,
        "estimated_value": tender.estimated_value,
        "submission_method": tender.submission_method,
    }
    extracted = tender.ai_extracted_info or {}

    # Gather all context: checklist, generated docs, library docs
    checklist_items = [
        {"name": c.name, "status": c.status, "category": c.category}
        for c in db.query(ChecklistItem).filter(ChecklistItem.tender_id == tender_id).all()
    ]
    generated_docs = [
        {"doc_type": g.doc_type, "title": g.title}
        for g in db.query(GeneratedDocument).filter(GeneratedDocument.tender_id == tender_id).all()
    ]
    library_docs = [
        {"name": l.name, "category": l.category}
        for l in db.query(LibraryDocument).filter(LibraryDocument.created_by == user.id).all()
    ]
    ai_summary = tender.ai_summary or ""
    ref_number = tender.reference_number

    # Start async job
    job_id = str(uuid.uuid4())
    _AI_JOBS[job_id] = {"status": "pending", "result": None, "error": None, "created_at": datetime.utcnow().isoformat()}

    def _run_job():
        try:
            content = ai_module.generate_document_by_prompt(
                prompt=prompt,
                tender=tender_data,
                extracted=extracted,
                company=company,
                checklist_items=checklist_items,
                generated_docs=generated_docs,
                library_docs=library_docs,
                ai_summary=ai_summary,
            )
            # Save the document to the database in a new session
            job_db = SessionLocal()
            try:
                new_doc = GeneratedDocument(
                    tender_id=tender_id,
                    doc_type="custom",
                    title=f"{custom_title} — {ref_number}",
                    content=content,
                )
                job_db.add(new_doc)
                job_db.commit()
                job_db.refresh(new_doc)
                result = {
                    "id": new_doc.id, "doc_type": new_doc.doc_type, "title": new_doc.title,
                    "content": new_doc.content,
                    "created_at": new_doc.created_at.isoformat() if new_doc.created_at else None,
                    "updated_at": new_doc.updated_at.isoformat() if new_doc.updated_at else None,
                }
            finally:
                job_db.close()
            _AI_JOBS[job_id] = {"status": "done", "result": result, "error": None, "created_at": _AI_JOBS[job_id]["created_at"]}
        except Exception as e:
            _AI_JOBS[job_id] = {"status": "error", "result": None, "error": str(e), "created_at": _AI_JOBS[job_id]["created_at"]}

    threading.Thread(target=_run_job, daemon=True).start()
    return {"job_id": job_id, "status": "pending"}


@app.get("/api/tenders/{tender_id}/documents/generate-by-prompt/{job_id}")
def generate_document_by_prompt_status(
    tender_id: int,
    job_id: str,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Poll the status of an AI document generation job."""
    job = _AI_JOBS.get(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found.")
    return job


@app.get("/api/document-types")
def list_document_types():
    """List all available AI document types that can be generated."""
    return {"types": [
        {"key": k, "title": v["title"], "description": v["description"]}
        for k, v in ai_module.DOCUMENT_TYPE_INFO.items()
    ]}


@app.post("/api/tenders/{tender_id}/documents/smart-analyze")
def smart_analyze_documents(tender_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    """AI reads the tender's extracted info and determines which documents are required.
    Returns a smart list of documents with reasons and priority levels."""
    tender = db.query(Tender).filter(Tender.id == tender_id).first()
    if not tender:
        raise HTTPException(status_code=404, detail="Tender not found")

    tender_data = {
        "reference_number": tender.reference_number,
        "title": tender.title,
        "client_company": tender.client_company,
        "scope_of_work": tender.scope_of_work,
        "estimated_value": tender.estimated_value,
        "contract_period": tender.contract_period,
    }
    extracted = tender.ai_extracted_info or {}

    # If no AI extraction, return all types as recommended
    if not extracted or extracted.get("_error"):
        all_types = list(ai_module.DOCUMENT_TYPE_INFO.keys())
        return {
            "required": [
                {
                    "doc_type": dt,
                    "title": ai_module.DOCUMENT_TYPE_INFO[dt]["title"],
                    "description": ai_module.DOCUMENT_TYPE_INFO[dt]["description"],
                    "reason": "Recommended — run AI extraction on the tender document for a tailored list",
                    "priority": "recommended",
                }
                for dt in all_types
            ],
            "analyzed": False,
        }

    # Use AI to analyze
    smart_list = ai_module.analyze_required_documents(extracted, tender_data)

    # Enrich with title/description
    result = []
    for item in smart_list:
        dt = item["doc_type"]
        info = ai_module.DOCUMENT_TYPE_INFO.get(dt, {})
        result.append({
            "doc_type": dt,
            "title": info.get("title", dt),
            "description": info.get("description", ""),
            "reason": item.get("reason", ""),
            "priority": item.get("priority", "recommended"),
        })

    return {"required": result, "analyzed": True}


# ---------------------- AI Tender Discovery ----------------------

class DiscoverRequest(BaseModel):
    category: str
    keywords: Optional[str] = None
    location: Optional[str] = "South Africa"
    num_results: int = 15


@app.post("/api/tenders/discover")
def discover_tenders_api(
    payload: DiscoverRequest,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """AI-powered tender discovery. Searches the web for open tenders matching the criteria.

    Uses the caller's own capability profile so results suit this organisation,
    and verifies every link so the user only sees tenders they can open.
    """
    if not payload.category or not payload.category.strip():
        raise HTTPException(status_code=400, detail="Category is required")

    import ai_agent

    scope = ai_agent.resolve_scope(db, user)
    capability = ai_agent._capability_profile(db, user, scope)

    result = ai_module.discover_tenders_verified(
        category=payload.category.strip(),
        keywords=(payload.keywords or "").strip(),
        location=(payload.location or "South Africa").strip(),
        num_results=min(max(payload.num_results, 5), 30),
        capability=capability,
    )
    return result


@app.post("/api/tenders/import-discovered")
def import_discovered_tender(
    payload: dict,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Import a discovered tender into the tender database."""
    title = payload.get("title", "").strip()
    if not title:
        raise HTTPException(status_code=400, detail="Title is required")
    # Generate a reference number if none provided
    ref = payload.get("reference_number") or f"DISC-{datetime.utcnow().strftime('%Y%m%d%H%M%S')}"
    t = Tender(
        reference_number=ref,
        title=title,
        client_company=payload.get("client", "Unknown") or "Unknown",
        description=payload.get("description"),
        category=payload.get("category"),
        location_site=payload.get("location"),
        closing_date=None,
        status="New Opportunity",
        submission_method=payload.get("url") and f"Apply via: {payload['url']}" or None,
        person_responsible=user.full_name,
        notes=f"Discovered via AI Tender Finder.\nSource: {payload.get('source_site', 'Unknown')}\nURL: {payload.get('url', 'N/A')}",
        created_by=user.id,
    )
    # Try to parse closing date
    cd = payload.get("closing_date")
    if cd:
        try:
            t.closing_date = date.fromisoformat(str(cd)[:10])
        except Exception:
            pass
    # Try to parse estimated value
    ev = payload.get("estimated_value")
    if ev:
        try:
            # Extract numeric part
            import re
            nums = re.findall(r"[\d,.]+", str(ev).replace(",", ""))
            if nums:
                t.estimated_value = float(nums[0])
        except Exception:
            pass
    db.add(t)
    db.commit()
    db.refresh(t)
    _build_default_checklist(t.id, db)
    db.commit()
    db.refresh(t)
    return _serialize_tender(t)


# ---------------------- AI Tender Readiness Report ----------------------

@app.post("/api/tenders/{tender_id}/readiness-report")
def generate_readiness_report(tender_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    """
    THE MOST IMPORTANT REQUIREMENT.
    Generates a comprehensive readiness report that tells the user:
    - What the tender requires
    - What they have
    - What they are missing
    - Deadlines
    - Risks
    - What needs to be done before submission
    - A readiness score out of 100
    """
    tender = db.query(Tender).filter(Tender.id == tender_id).first()
    if not tender:
        raise HTTPException(status_code=404, detail="Tender not found")

    # Build tender data
    tender_data = {
        "reference_number": tender.reference_number,
        "title": tender.title,
        "client_company": tender.client_company,
        "closing_date": tender.closing_date.isoformat() if tender.closing_date else None,
        "closing_time": tender.closing_time.strftime("%H:%M") if tender.closing_time else None,
        "days_until_close": (tender.closing_date - date.today()).days if tender.closing_date else None,
        "contract_period": tender.contract_period,
        "estimated_value": tender.estimated_value,
        "location_site": tender.location_site,
        "scope_of_work": tender.scope_of_work,
        "status": tender.status,
        "outcome": tender.outcome,
        "person_responsible": tender.person_responsible,
        "submission_method": tender.submission_method,
        "ai_summary": tender.ai_summary,
    }

    extracted = tender.ai_extracted_info or {}

    # Build checklist data
    checklist = [
        {
            "name": c.name, "status": c.status, "category": c.category,
            "mandatory": c.mandatory, "description": c.description,
            "library_category": c.library_category,
            "linked_library_doc_id": c.linked_library_doc_id,
        }
        for c in tender.checklist_items
    ]

    # Get compliance library docs
    library_docs = []
    for d in db.query(LibraryDocument).all():
        days_to_expiry = None
        doc_status = "Active"
        if d.expiry_date:
            days_to_expiry = (d.expiry_date - date.today()).days
            if days_to_expiry < 0:
                doc_status = "Expired"
            elif days_to_expiry <= 30:
                doc_status = "Expiring Soon"
        library_docs.append({
            "name": d.name, "category": d.category,
            "expiry_date": d.expiry_date.isoformat() if d.expiry_date else None,
            "days_to_expiry": days_to_expiry, "status": doc_status,
        })

    # Get company profile
    profile = db.query(CompanyProfile).filter(CompanyProfile.user_id == user.id).first()
    company = {
        "company_name": profile.company_name if profile else (user.company_name or user.full_name),
        "registration_number": profile.registration_number if profile else None,
        "psira_number": profile.psira_number if profile else None,
        "bbbbee_level": profile.bbbbee_level if profile else None,
    }

    # Generate the report
    report = ai_module.generate_readiness_report(tender_data, extracted, checklist, library_docs, company)
    return {"report": report, "tender_id": tender_id}


# ---------------------- AI Assistant ----------------------

def _build_full_system_context(db: Session, user: User, tender_id: Optional[int] = None) -> dict:
    """
    Build a COMPREHENSIVE context containing ALL data from every tab in the system:
    - Dashboard stats
    - All tenders with full details, AI-extracted info, checklists, documents, briefings, pricing, submissions, communications, addendums
    - The compliance document library with expiry dates
    - Extracted text from uploaded tender documents (capped per doc to fit context)
    """
    import os as _os
    import ai_agent as _agent

    today = date.today()
    # COMPANY-SCOPED: the AI may only see data belonging to the caller's
    # bidder company (or the caller's own rows when they have no company).
    scope = _agent.resolve_scope(db, user)
    member_ids = scope["member_ids"]
    all_tenders = db.query(Tender).filter(Tender.created_by.in_(member_ids)).all()
    active_statuses = {"New Opportunity", "Under Review", "Interested", "Preparing",
                       "Documents Outstanding", "Pricing in Progress", "Awaiting Information",
                       "Ready for Submission", "Submitted", "Clarification Requested",
                       "Clarification Submitted", "Shortlisted", "Interview/Presentation",
                       "Negotiation"}
    active = [t for t in all_tenders if t.status in active_statuses]
    closing_this_week = [t for t in all_tenders if t.closing_date and t.status in active_statuses
                         and 0 <= (t.closing_date - today).days <= 7]

    # ---- Compliance library (scope-filtered) ----
    library_docs = (
        db.query(LibraryDocument)
        .filter(LibraryDocument.created_by.in_(member_ids))
        .all()
    )
    library_data = []
    for d in library_docs:
        days_to_expiry = None
        status = "Active"
        if d.expiry_date:
            days_to_expiry = (d.expiry_date - today).days
            if days_to_expiry < 0:
                status = "Expired"
            elif days_to_expiry <= 30:
                status = "Expiring Soon"
        library_data.append({
            "id": d.id, "name": d.name, "category": d.category,
            "issue_date": d.issue_date.isoformat() if d.issue_date else None,
            "expiry_date": d.expiry_date.isoformat() if d.expiry_date else None,
            "days_to_expiry": days_to_expiry, "status": status,
            "notes": d.notes,
        })

    # ---- All tenders with FULL detail ----
    tenders_data = []
    for t in all_tenders:
        tender_dict = {
            "id": t.id,
            "reference_number": t.reference_number,
            "title": t.title,
            "client_company": t.client_company,
            "description": t.description,
            "scope_of_work": t.scope_of_work,
            "category": t.category,
            "location_site": t.location_site,
            "closing_date": t.closing_date.isoformat() if t.closing_date else None,
            "closing_time": t.closing_time.strftime("%H:%M") if t.closing_time else None,
            "days_until_close": (t.closing_date - today).days if t.closing_date else None,
            "estimated_value": t.estimated_value,
            "contract_period": t.contract_period,
            "status": t.status,
            "outcome": t.outcome,
            "unsuccessful_reason": t.unsuccessful_reason,
            "person_responsible": t.person_responsible,
            "submission_method": t.submission_method,
            "validity_period": t.validity_period,
            "contact_person": t.contact_person,
            "contact_email": t.contact_email,
            "contact_telephone": t.contact_telephone,
            "notes": t.notes,
            "ai_extracted_info": t.ai_extracted_info,
            "ai_summary": t.ai_summary,
        }

        # Checklist
        tender_dict["checklist"] = [
            {"name": c.name, "status": c.status, "notes": c.notes,
             "linked_library_doc_id": c.linked_library_doc_id}
            for c in t.checklist_items
        ]
        tender_dict["checklist_summary"] = {
            "total": len(t.checklist_items),
            "complete": len([c for c in t.checklist_items if c.status == "Complete"]),
            "outstanding": len([c for c in t.checklist_items if c.status == "Outstanding"]),
            "expired": len([c for c in t.checklist_items if c.status == "Expired"]),
            "outstanding_items": [c.name for c in t.checklist_items if c.status == "Outstanding"],
        }

        # Documents — include extracted text (capped)
        docs_data = []
        for doc in t.documents:
            full_path = _os.path.join(UPLOAD_DIR, doc.file_path)
            doc_text = ""
            if _os.path.exists(full_path):
                try:
                    doc_text = ai_module.extract_text_from_file(full_path, doc.original_filename)
                    # Cap each document's text to 3000 chars to fit context
                    if len(doc_text) > 3000:
                        doc_text = doc_text[:3000] + "...[truncated]"
                except Exception:
                    doc_text = ""
            docs_data.append({
                "id": doc.id,
                "filename": doc.original_filename,
                "file_type": doc.file_type,
                "file_size": doc.file_size,
                "is_primary": doc.is_primary,
                "uploaded_at": doc.uploaded_at.isoformat() if doc.uploaded_at else None,
                "extracted_text": doc_text,
            })
        tender_dict["documents"] = docs_data

        # Briefings
        tender_dict["briefings"] = [
            {"id": b.id, "type": b.briefing_type,
             "date": b.date.isoformat() if b.date else None,
             "time": b.time.strftime("%H:%M") if b.time else None,
             "location": b.location, "contact_person": b.contact_person,
             "attendance_required": b.attendance_required,
             "attendance_confirmed": b.attendance_confirmed,
             "person_attending": b.person_attending,
             "days_until_briefing": (b.date - today).days if b.date else None,
             "notes": b.notes}
            for b in t.briefings
        ]

        # Pricing versions
        tender_dict["pricing_versions"] = [
            {"version": p.version_number, "label": p.version_label,
             "line_items": p.line_items,
             "subtotal": p.subtotal, "vat": p.vat, "total": p.total,
             "notes": p.notes}
            for p in t.pricing_versions
        ]
        if t.pricing_versions:
            latest = t.pricing_versions[-1]
            tender_dict["latest_pricing"] = {
                "version": latest.version_number, "total": latest.total,
                "vat": latest.vat, "subtotal": latest.subtotal,
            }

        # Submission
        if t.submission:
            tender_dict["submission"] = {
                "submission_date": t.submission.submission_date.isoformat() if t.submission.submission_date else None,
                "submission_time": t.submission.submission_time.strftime("%H:%M") if t.submission.submission_time else None,
                "submission_method": t.submission.submission_method,
                "submitted_by": t.submission.submitted_by,
                "confirmation_reference": t.submission.confirmation_reference,
                "final_pricing": t.submission.final_pricing,
                "notes": t.submission.notes,
            }

        # Communications
        tender_dict["communications"] = [
            {"type": c.comm_type, "subject": c.subject,
             "body": (c.body or "")[:500],
             "date": c.comm_date.isoformat() if c.comm_date else None,
             "from": c.from_party, "to": c.to_party}
            for c in t.communications
        ]

        # Addendums (with AI-detected changes)
        tender_dict["addendums"] = [
            {"number": a.addendum_number, "title": a.title,
             "description": a.description,
             "issued_date": a.issued_date.isoformat() if a.issued_date else None,
             "ai_changes": a.ai_changes}
            for a in t.addendums
        ]

        tenders_data.append(tender_dict)

    context = {
        "user": {"full_name": user.full_name, "company_name": user.company_name, "email": user.email},
        "system_date": today.isoformat(),
        "company_scope": {
            "company_id": scope["company_id"],
            "company_name": scope["company_name"],
        },
        "dashboard": {
            "total_tenders": len(all_tenders),
            "active_tenders": len(active),
            "closing_this_week": len(closing_this_week),
            "closing_this_week_list": [
                {"ref": t.reference_number, "title": t.title,
                 "closing_date": t.closing_date.isoformat(),
                 "days_remaining": (t.closing_date - today).days}
                for t in closing_this_week
            ],
            "awarded_this_year": len([t for t in all_tenders if t.outcome == "Awarded" and t.updated_at and t.updated_at.year == today.year]),
            "unsuccessful": len([t for t in all_tenders if t.outcome == "Unsuccessful"]),
        },
        "compliance_library": library_data,
        "tenders": tenders_data,
        "company_profile": None,
        "ai_memory": {"mission": None, "goals": [], "preferences": None},
        "recent_chat": [],
        "ai_opportunities": [],
    }

    # ---- The AI's own identity: company profile, memory, chat, opportunities ----
    profile = db.query(CompanyProfile).filter(CompanyProfile.user_id == user.id).first()
    if profile:
        context["company_profile"] = {
            "company_name": profile.company_name,
            "registration_number": profile.registration_number,
            "vat_number": profile.vat_number,
            "psira_number": profile.psira_number,
            "bbbbee_level": profile.bbbbee_level,
            "address": profile.address,
            "phone": profile.phone,
            "email": profile.email,
            "website": profile.website,
            "director_name": profile.director_name,
            "director_title": profile.director_title,
        }
    memory = _agent.get_or_create_memory(db, scope)
    context["ai_memory"] = {
        "mission": memory.mission,
        "goals": memory.goals or [],
        "preferences": memory.preferences,
    }
    context["recent_chat"] = [
        {"role": m.role, "content": (m.content or "")[:500]}
        for m in _agent.list_chat_messages(db, scope, limit=20)
    ]
    context["ai_opportunities"] = _agent.recent_opportunity_summaries(db, scope)

    # If a focus tender is specified, verify it belongs to the caller's scope
    if tender_id:
        t = db.query(Tender).filter(
            Tender.id == tender_id, Tender.created_by.in_(member_ids)
        ).first()
        if t:
            context["focus_tender_id"] = tender_id

    return context


@app.post("/api/ai/assistant")
def ai_assistant(payload: AIQuestion, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    question = payload.question.strip()
    if not question:
        raise HTTPException(status_code=400, detail="Question is required")
    import ai_agent
    scope = ai_agent.resolve_scope(db, user)
    # Build the context BEFORE saving the question so recent_chat holds the
    # prior exchange, not a duplicate of the current one.
    context = _build_full_system_context(db, user, tender_id=payload.tender_id)
    # Ask the AI first: a failed call must surface as an error, never a fake
    # reply, and must not leave a half-recorded exchange in the history.
    try:
        answer = ai_module.assistant_answer(question, context)
    except Exception as exc:
        if not ai_module.gemini_available():
            # Daily AI quota spent — say so plainly instead of leaking a raw
            # provider error. Nothing is saved, and we never fake a reply.
            raise HTTPException(
                status_code=503,
                detail=(
                    "The AI assistant has reached its daily free usage limit and is "
                    "paused until the quota resets. Your tenders, documents and "
                    "opportunities are all still available."
                ),
            )
        raise HTTPException(
            status_code=502,
            detail=f"The AI is unavailable right now. Please try again. ({exc})",
        )
    ai_agent.add_chat_message(db, scope, user, "user", question)
    ai_agent.add_chat_message(
        db, scope, user, "assistant", answer, context_tenders=len(context["tenders"])
    )
    return {
        "answer": answer,
        "context_tenders": len(context["tenders"]),
        "context_documents": sum(len(t["documents"]) for t in context["tenders"]),
        "context_library_docs": len(context["compliance_library"]),
    }


# ---------------------- AI Agent: chat history + memory ----------------------

@app.get("/api/ai/chat-history")
def ai_chat_history(
    limit: int = Query(50, ge=1, le=200),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    import ai_agent
    scope = ai_agent.resolve_scope(db, user)
    messages = ai_agent.list_chat_messages(db, scope, limit=limit)
    return {"items": ai_agent.serialize_chat(db, messages)}


@app.delete("/api/ai/chat-history")
def ai_clear_chat(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Clears the WHOLE TEAM's stored chat for the caller's company."""
    import ai_agent
    scope = ai_agent.resolve_scope(db, user)
    deleted = ai_agent.clear_chat_messages(db, scope)
    return {"deleted": deleted}


@app.get("/api/ai/memory")
def ai_get_memory(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    import ai_agent
    scope = ai_agent.resolve_scope(db, user)
    m = ai_agent.get_or_create_memory(db, scope)
    return {"mission": m.mission, "goals": m.goals or [], "preferences": m.preferences}


@app.put("/api/ai/memory")
def ai_update_memory(
    payload: dict,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    import ai_agent
    scope = ai_agent.resolve_scope(db, user)
    m = ai_agent.get_or_create_memory(db, scope)
    if "mission" in payload:
        m.mission = str(payload["mission"] or "")
    if "goals" in payload:
        goals = payload["goals"]
        m.goals = [str(g)[:500] for g in goals][:20] if isinstance(goals, list) else []
    if "preferences" in payload:
        m.preferences = str(payload["preferences"] or "")
    db.commit()
    # The narrative reflects the memory — refresh it in the background budget.
    try:
        ai_agent.build_briefing(db, user, force_refresh=True)
    except Exception:
        pass
    return {"mission": m.mission, "goals": m.goals or [], "preferences": m.preferences}


# ---------------------- AI Agent: the daily briefing ----------------------

@app.get("/api/ai/briefing")
def ai_briefing(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    """Everything the AI greets the user with when they open the tab:
    closing-soon tenders, researched funding/tenders, and the cached narrative."""
    import ai_agent
    return ai_agent.build_briefing(db, user)


@app.post("/api/ai/research")
def ai_research(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    """Run an on-demand research pass for the caller's company scope."""
    import ai_agent
    return ai_agent.run_research(db, user)


# ---------------------- Proactive research (no user prompt) ----------------------

@app.post("/api/ai/cron/research")
def ai_cron_research(
    request: Request,
    authorization: Optional[str] = Header(default=None),
    x_cloudscheduler: Optional[str] = Header(default=None),
    db: Session = Depends(get_db),
):
    """Periodic sweep that researches tenders + funding for EVERY organisation
    without any user having to ask.

    Each company is researched inside its own isolated scope, so one
    organisation's AI never sees another's data.

    Scheduled via Cloud Scheduler, e.g.:
      gcloud scheduler jobs create http tmflow-research \
        --uri https://tmflow-api-....run.app/api/ai/cron/research \
        --http-method POST --schedule "0 */6 * * *" --oidc-service-account-email ... \
        --headers "Authorization=Bearer $CRON_SECRET"

    When CRON_SECRET is unset, the Cloud Scheduler `X-CloudScheduler: true`
    header is accepted; with neither present the call is rejected."""
    import os as _os
    secret = (_os.environ.get("CRON_SECRET") or "").strip()
    authorized = (x_cloudscheduler or "").lower() in ("true", "1")
    if not authorized and secret:
        authorized = (authorization or "") == f"Bearer {secret}"
    if not authorized:
        raise HTTPException(status_code=403, detail="Not authorized")

    import ai_agent
    return ai_agent.cron_research_all(db)


def _estimated_value_float(value):
    """Best-effort 'R1.2m' -> 1200000.0; None when not numeric."""
    if value is None:
        return None
    if isinstance(value, (int, float)):
        return float(value)
    text = str(value).lower().replace("r", "").replace(",", "").replace(" ", "")
    multiplier = 1.0
    if text.endswith("m"):
        multiplier, text = 1_000_000.0, text[:-1]
    elif text.endswith("k"):
        multiplier, text = 1_000.0, text[:-1]
    try:
        return float(text) * multiplier
    except ValueError:
        return None


@app.post("/api/ai/opportunities/{opp_id}/import")
def ai_import_opportunity(
    opp_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)
):
    """Promote a researched opportunity into a tracked Tender (with checklist)."""
    import ai_agent
    scope = ai_agent.resolve_scope(db, user)
    opp = ai_agent.get_opportunity_checked(db, scope, opp_id)
    if opp is None:
        raise HTTPException(status_code=404, detail="Opportunity not found")

    if opp.status == "imported" and opp.imported_tender_id:
        return {"tender_id": opp.imported_tender_id, "opportunity_id": opp.id}

    tender = Tender(
        reference_number=(opp.reference_number or f"AI-{opp.id}"),
        title=opp.title,
        client_company=(opp.provider or opp.source_site or "Unknown"),
        description=opp.description,
        category=opp.category,
        location_site=opp.location,
        closing_date=opp.closing_date,
        estimated_value=_estimated_value_float(opp.estimated_value),
        status="Interested",
        created_by=user.id,
    )
    db.add(tender)
    db.commit()
    db.refresh(tender)
    _build_default_checklist(tender.id, db)
    db.commit()

    opp.status = "imported"
    opp.imported_tender_id = tender.id
    db.commit()
    return {"tender_id": tender.id, "opportunity_id": opp.id}


@app.post("/api/ai/opportunities/{opp_id}/dismiss")
def ai_dismiss_opportunity(
    opp_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)
):
    """Hide a researched opportunity from the briefing."""
    import ai_agent
    scope = ai_agent.resolve_scope(db, user)
    opp = ai_agent.get_opportunity_checked(db, scope, opp_id)
    if opp is None:
        raise HTTPException(status_code=404, detail="Opportunity not found")
    opp.status = "dismissed"
    db.commit()
    return {"opportunity_id": opp.id, "status": opp.status}


# ---------------------- Search/Filter helper ----------------------

@app.get("/api/tenders/search")
def search_tenders(
    q: str = "",
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Quick search for typeahead."""
    if not q:
        return {"items": []}
    like = f"%{q}%"
    tenders = db.query(Tender).filter(or_(
        Tender.reference_number.ilike(like),
        Tender.title.ilike(like),
        Tender.client_company.ilike(like),
    )).limit(20).all()
    return {"items": [
        {"id": t.id, "label": f"{t.reference_number} - {t.title}", "client": t.client_company}
        for t in tenders
    ]}


# ---------------------- Reminder Settings ----------------------

@app.get("/api/reminders")
def get_reminders(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    return {"items": [{"id": r.id, "days_before": r.days_before, "enabled": r.enabled} for r in db.query(ReminderSetting).order_by(ReminderSetting.days_before.desc()).all()]}


@app.put("/api/reminders/{reminder_id}")
def update_reminder(reminder_id: int, enabled: bool = True, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    r = db.query(ReminderSetting).filter(ReminderSetting.id == reminder_id).first()
    if not r:
        raise HTTPException(status_code=404, detail="Reminder not found")
    r.enabled = enabled
    db.commit()
    return {"id": r.id, "enabled": r.enabled}


@app.post("/api/reminders")
def add_reminder(days_before: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    """Add a custom reminder period."""
    if days_before < 1 or days_before > 365:
        raise HTTPException(status_code=400, detail="Days before must be between 1 and 365")
    existing = db.query(ReminderSetting).filter(ReminderSetting.days_before == days_before).first()
    if existing:
        raise HTTPException(status_code=400, detail=f"Reminder for {days_before} days already exists")
    r = ReminderSetting(days_before=days_before, enabled=True)
    db.add(r)
    db.commit()
    db.refresh(r)
    return {"id": r.id, "days_before": r.days_before, "enabled": r.enabled}


@app.delete("/api/reminders/{reminder_id}")
def delete_reminder(reminder_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    r = db.query(ReminderSetting).filter(ReminderSetting.id == reminder_id).first()
    if not r:
        raise HTTPException(status_code=404, detail="Reminder not found")
    db.delete(r)
    db.commit()
    return {"deleted": True}


# ---------------------- Deadline Management ----------------------

@app.get("/api/deadlines")
def get_deadlines(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    """
    Comprehensive deadline tracking for all tenders.
    Returns each tender with:
    - closing_date, closing_time
    - days_remaining, hours_remaining (when close to deadline)
    - is_closed (whether the tender has already closed)
    - urgency level (critical/urgent/soon/normal/closed)
    - which reminders should currently fire
    """
    now = datetime.utcnow()
    today = now.date()
    active_statuses = {"New Opportunity", "Under Review", "Interested", "Preparing",
                       "Documents Outstanding", "Pricing in Progress", "Awaiting Information",
                       "Ready for Submission", "Submitted", "Clarification Requested",
                       "Clarification Submitted", "Shortlisted", "Interview/Presentation",
                       "Negotiation"}

    all_tenders = db.query(Tender).all()
    reminders = db.query(ReminderSetting).filter(ReminderSetting.enabled == True).order_by(ReminderSetting.days_before.desc()).all()
    reminder_days = [r.days_before for r in reminders]

    deadlines = []
    for t in all_tenders:
        if not t.closing_date:
            continue
        # Combine closing date + time
        closing_dt = datetime.combine(t.closing_date, t.closing_time or datetime.min.time())
        diff = closing_dt - now
        days_remaining = diff.days
        hours_remaining = int(diff.total_seconds() / 3600)
        is_closed = diff.total_seconds() <= 0

        # Urgency level
        if is_closed:
            urgency = "closed"
        elif hours_remaining <= 24:
            urgency = "critical"
        elif days_remaining <= 3:
            urgency = "critical"
        elif days_remaining <= 7:
            urgency = "urgent"
        elif days_remaining <= 14:
            urgency = "soon"
        elif days_remaining <= 30:
            urgency = "normal"
        else:
            urgency = "normal"

        # Which reminders should fire (the largest reminder period that is >= days_remaining)
        active_reminders = []
        if not is_closed and days_remaining >= 0:
            for rd in reminder_days:
                if days_remaining <= rd:
                    active_reminders.append(rd)

        # Check if tender is still active (not awarded/unsuccessful/withdrawn)
        is_active = t.status in active_statuses

        deadlines.append({
            "id": t.id,
            "reference_number": t.reference_number,
            "title": t.title,
            "client_company": t.client_company,
            "status": t.status,
            "outcome": t.outcome,
            "closing_date": t.closing_date.isoformat(),
            "closing_time": t.closing_time.strftime("%H:%M") if t.closing_time else None,
            "days_remaining": days_remaining if not is_closed else None,
            "hours_remaining": hours_remaining if (not is_closed and hours_remaining <= 72) else None,
            "is_closed": is_closed,
            "is_active": is_active,
            "urgency": urgency,
            "active_reminders": active_reminders,
            "person_responsible": t.person_responsible,
            "estimated_value": t.estimated_value,
            "location_site": t.location_site,
        })

    # Sort: active first (by days_remaining ascending), then closed
    deadlines.sort(key=lambda d: (
        d["is_closed"],  # False (0) before True (1)
        d["days_remaining"] if d["days_remaining"] is not None else 9999,
    ))

    # Summary
    summary = {
        "total_with_deadlines": len(deadlines),
        "active_count": len([d for d in deadlines if d["is_active"] and not d["is_closed"]]),
        "critical_count": len([d for d in deadlines if d["urgency"] == "critical"]),
        "urgent_count": len([d for d in deadlines if d["urgency"] == "urgent"]),
        "soon_count": len([d for d in deadlines if d["urgency"] == "soon"]),
        "closed_count": len([d for d in deadlines if d["is_closed"]]),
        "next_deadline": deadlines[0] if deadlines and not deadlines[0]["is_closed"] else None,
        "reminder_periods": reminder_days,
    }

    return {"items": deadlines, "summary": summary, "reminders": [
        {"id": r.id, "days_before": r.days_before, "enabled": r.enabled}
        for r in db.query(ReminderSetting).order_by(ReminderSetting.days_before.desc()).all()
    ]}


# ---------------------- Health ----------------------

@app.get("/api/health")
def health():
    return {"status": "ok", "service": "tenderflow-api", "version": "1.0.0"}


# ============================================================
# BIDDER COMPANY — team management for applicants
# ============================================================

def _get_bidder_membership(db: Session, user: User):
    """Return (company, member) for the user's bidder company, or raise 403."""
    member = db.query(BidderMember).filter(
        BidderMember.user_id == user.id,
        BidderMember.status == "approved"
    ).first()
    if not member:
        raise HTTPException(status_code=403, detail="You are not a member of any bidder company. Ask your company admin to approve your registration.")
    company = db.query(BidderCompany).filter(BidderCompany.id == member.company_id).first()
    return company, member


def _get_company_member_ids(db: Session, company_id: int):
    """Get all approved member user_ids for a bidder company."""
    members = db.query(BidderMember).filter(
        BidderMember.company_id == company_id,
        BidderMember.status == "approved"
    ).all()
    return [m.user_id for m in members]


@app.post("/api/bidder/register-company")
def bidder_register_company(
    payload: dict,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Create a new bidder company. The registering user becomes the admin."""
    if user.account_type == "issuer":
        raise HTTPException(status_code=400, detail="Issuer accounts cannot create bidder companies.")
    existing = db.query(BidderMember).filter(
        BidderMember.user_id == user.id,
        BidderMember.status == "approved"
    ).first()
    if existing:
        raise HTTPException(status_code=400, detail="You are already a member of a bidder company.")
    name = (payload.get("name") or "").strip()
    if not name:
        raise HTTPException(status_code=400, detail="Company name is required")
    company = BidderCompany(
        name=name,
        description=payload.get("description"),
        industry=payload.get("industry"),
        phone=payload.get("phone"),
        email=payload.get("email"),
        created_by=user.id,
    )
    db.add(company)
    db.commit()
    db.refresh(company)
    member = BidderMember(
        company_id=company.id,
        user_id=user.id,
        role="admin",
        status="approved",
        approved_at=datetime.utcnow(),
    )
    db.add(member)
    user.onboarding_completed = True
    if not user.company_name:
        user.company_name = company.name
    db.commit()
    db.refresh(company)
    return {
        "id": company.id,
        "name": company.name,
        "description": company.description,
        "industry": company.industry,
        "member_count": 1,
    }


@app.post("/api/bidder/join-company")
def bidder_join_company(
    payload: dict,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Request to join an existing bidder company by name."""
    company_name = (payload.get("company_name") or "").strip()
    if not company_name:
        raise HTTPException(status_code=400, detail="company_name is required")
    company = db.query(BidderCompany).filter(
        BidderCompany.name.ilike(f"%{company_name}%")
    ).first()
    if not company:
        raise HTTPException(status_code=404, detail=f"No bidder company found matching '{company_name}'.")
    existing = db.query(BidderMember).filter(
        BidderMember.company_id == company.id,
        BidderMember.user_id == user.id
    ).first()
    if existing:
        return {"message": f"Already requested to join {company.name}", "status": existing.status}
    member = BidderMember(
        company_id=company.id,
        user_id=user.id,
        role="member",
        status="pending",
        job_title=payload.get("job_title"),
    )
    db.add(member)
    db.commit()
    db.refresh(member)
    return {"message": f"Join request submitted for {company.name}. An admin must approve your access.", "status": "pending"}


@app.get("/api/bidder/company")
def bidder_get_company(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Get the bidder company the current user belongs to."""
    company, member = _get_bidder_membership(db, user)
    member_count = db.query(BidderMember).filter(
        BidderMember.company_id == company.id,
        BidderMember.status == "approved"
    ).count()
    return {
        "id": company.id,
        "name": company.name,
        "description": company.description,
        "industry": company.industry,
        "phone": company.phone,
        "email": company.email,
        "member_count": member_count,
        "your_role": member.role,
    }


@app.get("/api/bidder/members")
def bidder_list_members(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """List all members (and pending requests) for the bidder company."""
    company, member = _get_bidder_membership(db, user)
    members = db.query(BidderMember).filter(
        BidderMember.company_id == company.id
    ).order_by(BidderMember.joined_at.desc()).all()
    result = []
    for m in members:
        u = db.query(User).filter(User.id == m.user_id).first()
        result.append({
            "id": m.id,
            "user_id": m.user_id,
            "email": u.email if u else None,
            "full_name": u.full_name if u else None,
            "role": m.role,
            "status": m.status,
            "job_title": m.job_title,
            "joined_at": m.joined_at.isoformat() if m.joined_at else None,
            "approved_at": m.approved_at.isoformat() if m.approved_at else None,
        })
    return {"items": result}


@app.put("/api/bidder/members/{member_id}")
def bidder_update_member(
    member_id: int,
    payload: dict,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Approve or reject a pending member (admin only)."""
    company, member = _get_bidder_membership(db, user)
    if member.role != "admin":
        raise HTTPException(status_code=403, detail="Only company admins can approve members.")
    target = db.query(BidderMember).filter(
        BidderMember.id == member_id,
        BidderMember.company_id == company.id
    ).first()
    if not target:
        raise HTTPException(status_code=404, detail="Member not found")
    target.status = payload.get("status", target.status)
    if payload.get("status") == "approved":
        target.approved_at = datetime.utcnow()
        u = db.query(User).filter(User.id == target.user_id).first()
        if u:
            u.onboarding_completed = True
            if not u.company_name:
                u.company_name = company.name
    db.commit()
    db.refresh(target)
    u = db.query(User).filter(User.id == target.user_id).first()
    return {
        "id": target.id,
        "email": u.email if u else None,
        "full_name": u.full_name if u else None,
        "role": target.role,
        "status": target.status,
    }


@app.delete("/api/bidder/members/{member_id}")
def bidder_remove_member(
    member_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Remove a member from the bidder company (admin only)."""
    company, member = _get_bidder_membership(db, user)
    if member.role != "admin":
        raise HTTPException(status_code=403, detail="Only company admins can remove members.")
    target = db.query(BidderMember).filter(
        BidderMember.id == member_id,
        BidderMember.company_id == company.id
    ).first()
    if not target:
        raise HTTPException(status_code=404, detail="Member not found")
    if target.role == "admin" and target.user_id == user.id:
        raise HTTPException(status_code=400, detail="You cannot remove yourself.")
    db.delete(target)
    db.commit()
    return {"deleted": True, "id": member_id}


@app.get("/api/bidder/companies/search")
def bidder_search_companies(
    q: str = "",
    db: Session = Depends(get_db),
):
    """Search for bidder companies by name (for the join flow)."""
    query = db.query(BidderCompany)
    if q:
        query = query.filter(BidderCompany.name.ilike(f"%{q}%"))
    companies = query.order_by(BidderCompany.name.asc()).limit(20).all()
    return {"items": [{"id": c.id, "name": c.name, "industry": c.industry} for c in companies]}


# ============================================================
# PUBLIC TENDER BOARD — browse published tenders (no auth)
# ============================================================

def _serialize_public_tender_list(t: IssuedTender, company: IssuerCompany, bid_count: int) -> dict:
    return {
        "id": t.id,
        "reference_number": t.reference_number,
        "title": t.title,
        "description": (t.description or "")[:300],
        "category": t.category,
        "location": t.location,
        "closing_date": t.closing_date.isoformat() if t.closing_date else None,
        "budget": t.budget,
        "contract_period": t.contract_period,
        "status": t.status,
        "company_name": company.name if company else None,
        "company_industry": company.industry if company else None,
        "company_description": (company.description or "")[:300] if company else None,
        "bid_count": bid_count,
    }


def _serialize_public_tender_detail(t: IssuedTender, company: IssuerCompany, bid_count: int) -> dict:
    return {
        "id": t.id,
        "reference_number": t.reference_number,
        "title": t.title,
        "description": t.description,
        "scope_of_work": t.scope_of_work,
        "category": t.category,
        "location": t.location,
        "issue_date": t.issue_date.isoformat() if t.issue_date else None,
        "closing_date": t.closing_date.isoformat() if t.closing_date else None,
        "closing_time": t.closing_time.isoformat() if t.closing_time else None,
        "budget": t.budget,
        "contract_period": t.contract_period,
        "evaluation_criteria": t.evaluation_criteria,
        "submission_method": t.submission_method,
        "contact_person": t.contact_person,
        "contact_email": t.contact_email,
        "contact_phone": t.contact_phone,
        "status": t.status,
        "ai_generated_content": t.ai_generated_content,
        "company_name": company.name if company else None,
        "company_industry": company.industry if company else None,
        "company_description": company.description if company else None,
        "bid_count": bid_count,
    }


@app.get("/api/public/tenders")
def public_list_tenders(
    category: Optional[str] = None,
    q: Optional[str] = None,
    db: Session = Depends(get_db),
):
    """List all published tenders. No auth required."""
    query = db.query(IssuedTender).filter(IssuedTender.is_published == True)
    if category and category != "All":
        query = query.filter(IssuedTender.category == category)
    if q:
        like = f"%{q}%"
        query = query.filter(or_(
            IssuedTender.title.ilike(like),
            IssuedTender.reference_number.ilike(like),
            IssuedTender.description.ilike(like),
            IssuedTender.category.ilike(like),
        ))
    tenders = query.order_by(desc(IssuedTender.created_at)).all()
    items = []
    for t in tenders:
        company = db.query(IssuerCompany).filter(IssuerCompany.id == t.company_id).first()
        bid_count = db.query(Bid).filter(Bid.tender_id == t.id).count()
        items.append(_serialize_public_tender_list(t, company, bid_count))
    return {"items": items, "total": len(items)}


@app.get("/api/public/categories")
def public_list_categories(db: Session = Depends(get_db)):
    """List distinct categories from published tenders."""
    rows = db.query(IssuedTender.category).filter(
        IssuedTender.is_published == True,
        IssuedTender.category.isnot(None),
    ).distinct().all()
    cats = sorted([r[0] for r in rows if r[0]])
    return {"items": cats}


@app.get("/api/public/tenders/{tender_id}")
def public_get_tender(tender_id: int, db: Session = Depends(get_db)):
    """Get full details of a single published tender."""
    t = db.query(IssuedTender).filter(
        IssuedTender.id == tender_id,
        IssuedTender.is_published == True,
    ).first()
    if not t:
        raise HTTPException(status_code=404, detail="Tender not found or not published.")
    company = db.query(IssuerCompany).filter(IssuerCompany.id == t.company_id).first()
    bid_count = db.query(Bid).filter(Bid.tender_id == t.id).count()
    return _serialize_public_tender_detail(t, company, bid_count)


@app.post("/api/public/tenders/{tender_id}/submit-bid")
async def public_submit_bid(
    tender_id: int,
    bidder_company_name: str = Form(...),
    bidder_contact_person: str = Form(...),
    bidder_email: str = Form(""),
    bidder_phone: str = Form(""),
    bidder_bbbee_level: str = Form(""),
    total_amount: float = Form(0),
    proposal_summary: str = Form(""),
    files: List[UploadFile] = File(default=[]),
    db: Session = Depends(get_db),
):
    """Submit a bid for a published tender. Creates a Bid record + stores documents."""
    t = db.query(IssuedTender).filter(
        IssuedTender.id == tender_id,
        IssuedTender.is_published == True,
    ).first()
    if not t:
        raise HTTPException(status_code=404, detail="Tender not found or not published.")
    # Check closing date
    if t.closing_date and t.closing_date < date.today():
        raise HTTPException(status_code=400, detail="This tender has closed. Bids are no longer accepted.")

    bid = Bid(
        tender_id=tender_id,
        bidder_company_name=bidder_company_name,
        bidder_contact_person=bidder_contact_person,
        bidder_email=bidder_email or None,
        bidder_phone=bidder_phone or None,
        bidder_bbbee_level=bidder_bbbee_level or None,
        total_amount=total_amount,
        proposal_summary=proposal_summary or None,
        status="Pending",
    )
    db.add(bid)
    db.flush()

    # Save uploaded documents
    for f in files:
        if not f.filename:
            continue
        ext = os.path.splitext(f.filename)[1] or ""
        safe_name = f"{uuid.uuid4().hex}{ext}"
        file_path = os.path.join(UPLOAD_DIR, safe_name)
        with open(file_path, "wb") as out:
            out.write(await f.read())
        db.add(BidDocument(
            bid_id=bid.id,
            doc_type=f.filename.rsplit(".", 1)[0][:200] if "." in f.filename else "document",
            filename=safe_name,
            original_filename=f.filename,
            file_path=file_path,
            file_type=f.content_type,
            file_size=os.path.getsize(file_path),
        ))

    db.commit()
    db.refresh(bid)
    return {
        "id": bid.id,
        "tender_id": tender_id,
        "status": bid.status,
        "submitted_at": bid.submitted_at.isoformat() if bid.submitted_at else None,
        "message": "Bid submitted successfully.",
    }


@app.post("/api/public/tenders/{tender_id}/compliance-check")
def public_compliance_check(
    tender_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Check the logged-in bidder's library against a tender's required documents.
    Returns a list of required docs with matched/missing status."""
    t = db.query(IssuedTender).filter(IssuedTender.id == tender_id).first()
    if not t:
        raise HTTPException(status_code=404, detail="Tender not found.")
    # Get the bidder's company + library docs
    member = db.query(BidderMember).filter(
        BidderMember.user_id == user.id,
        BidderMember.status == "approved",
    ).first()
    company = None
    library_docs = []
    if member:
        company = db.query(BidderCompany).filter(BidderCompany.id == member.company_id).first()
        member_ids = _get_company_member_ids(db, member.company_id)
        library_docs = db.query(LibraryDocument).filter(
            LibraryDocument.created_by.in_(member_ids)
        ).all()

    # Required documents (from compulsory_documents list or default list)
    required_raw = []
    if t.ai_generated_content:
        # Try to parse compulsory documents from the AI content heuristically
        for line in t.ai_generated_content.split("\n"):
            low = line.lower().strip()
            if any(kw in low for kw in ["compulsory", "required document", "must submit"]):
                continue
    # Use a default South African compliance list
    default_required = [
        ("CIPC registration certificate", "CIPC"),
        ("SARS tax clearance certificate", "SARS"),
        ("B-BBEE certificate or affidavit", "B-BBEE"),
        ("COIDA letter of good standing", "COIDA"),
        ("Company profile", "Company profile"),
        ("PSIRA certificate (if applicable)", "PSIRA"),
        ("Recent financial statements", "Financial statements"),
        ("References / past contracts", "References"),
        ("Insurance documents", "Insurance documents"),
        ("Signed declarations", "Standard declarations"),
    ]
    # Build compliance result
    lib_by_cat = {}
    for ld in library_docs:
        lib_by_cat.setdefault(ld.category, []).append(ld)

    results = []
    matched_count = 0
    for doc_name, cat in default_required:
        matched = cat in lib_by_cat and len(lib_by_cat[cat]) > 0
        if matched:
            matched_count += 1
        results.append({
            "document": doc_name,
            "category": cat,
            "status": "matched" if matched else "missing",
            "matched_count": len(lib_by_cat.get(cat, [])),
        })
    return {
        "tender_id": tender_id,
        "tender_title": t.title,
        "company_name": company.name if company else (user.company_name or "Not set"),
        "total_required": len(default_required),
        "matched": matched_count,
        "missing": len(default_required) - matched_count,
        "compliance_percentage": round((matched_count / len(default_required)) * 100, 1) if default_required else 0,
        "items": results,
    }


# ============================================================
# ISSUER PORTAL — for tender-issuing organisations (auth required)
# ============================================================

def _get_issuer_membership(db: Session, user: User):
    """Return (company, member) for the user's issuer company, or raise 403."""
    member = db.query(CompanyMember).filter(
        CompanyMember.user_id == user.id,
        CompanyMember.status == "approved",
    ).first()
    if not member:
        raise HTTPException(status_code=403, detail="You are not a member of any issuer company. Ask your company admin to approve your registration, or create/join a company.")
    company = db.query(IssuerCompany).filter(IssuerCompany.id == member.company_id).first()
    return company, member


def _get_issuer_member_ids(db: Session, company_id: int):
    members = db.query(CompanyMember).filter(
        CompanyMember.company_id == company_id,
        CompanyMember.status == "approved",
    ).all()
    return [m.user_id for m in members]


def _serialize_issued_tender(t: IssuedTender, company: IssuerCompany, bid_count: int, db: Session) -> dict:
    return {
        "id": t.id,
        "reference_number": t.reference_number,
        "title": t.title,
        "description": t.description,
        "scope_of_work": t.scope_of_work,
        "category": t.category,
        "location": t.location,
        "issue_date": t.issue_date.isoformat() if t.issue_date else None,
        "closing_date": t.closing_date.isoformat() if t.closing_date else None,
        "closing_time": t.closing_time.isoformat() if t.closing_time else None,
        "budget": t.budget,
        "contract_period": t.contract_period,
        "evaluation_criteria": t.evaluation_criteria,
        "submission_method": t.submission_method,
        "contact_person": t.contact_person,
        "contact_email": t.contact_email,
        "contact_phone": t.contact_phone,
        "status": t.status,
        "is_published": t.is_published,
        "ai_generated_content": t.ai_generated_content,
        "notes": t.notes,
        "company_name": company.name if company else None,
        "bid_count": bid_count,
        "created_at": t.created_at.isoformat() if t.created_at else None,
    }


def _serialize_bid(b: Bid, tender: Optional[IssuedTender], db: Session) -> dict:
    docs = db.query(BidDocument).filter(BidDocument.bid_id == b.id).all()
    return {
        "id": b.id,
        "tender_id": b.tender_id,
        "tender_title": tender.title if tender else None,
        "tender_reference": tender.reference_number if tender else None,
        "bidder_company_name": b.bidder_company_name,
        "bidder_contact_person": b.bidder_contact_person,
        "bidder_email": b.bidder_email,
        "bidder_phone": b.bidder_phone,
        "bidder_bbbee_level": b.bidder_bbbee_level,
        "total_amount": b.total_amount,
        "proposal_summary": b.proposal_summary,
        "technical_score": b.technical_score,
        "financial_score": b.financial_score,
        "status": b.status,
        "submitted_at": b.submitted_at.isoformat() if b.submitted_at else None,
        "reviewed_at": b.reviewed_at.isoformat() if b.reviewed_at else None,
        "ai_review": b.ai_review,
        "ai_reviewed_at": b.ai_reviewed_at.isoformat() if b.ai_reviewed_at else None,
        "notes": b.notes,
        "documents": [
            {
                "id": d.id,
                "doc_type": d.doc_type,
                "filename": d.original_filename,
                "file_size": d.file_size,
                "uploaded_at": d.uploaded_at.isoformat() if d.uploaded_at else None,
            }
            for d in docs
        ],
    }


@app.post("/api/issuer/register-company")
def issuer_register_company(
    payload: dict,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Create a new issuer company. The registering user becomes the admin."""
    if user.account_type != "issuer":
        raise HTTPException(status_code=400, detail="Only issuer accounts can create issuer companies.")
    existing = db.query(CompanyMember).filter(
        CompanyMember.user_id == user.id,
        CompanyMember.status == "approved",
    ).first()
    if existing:
        raise HTTPException(status_code=400, detail="You are already a member of an issuer company.")
    name = (payload.get("name") or "").strip()
    if not name:
        raise HTTPException(status_code=400, detail="Company name is required.")
    company = IssuerCompany(
        name=name,
        registration_number=payload.get("registration_number"),
        description=payload.get("description"),
        industry=payload.get("industry"),
        address=payload.get("address"),
        phone=payload.get("phone"),
        email=payload.get("email"),
        website=payload.get("website"),
        created_by=user.id,
    )
    db.add(company)
    db.flush()
    member = CompanyMember(
        company_id=company.id,
        user_id=user.id,
        role="admin",
        status="approved",
        job_title=payload.get("job_title", "Administrator"),
        approved_at=datetime.utcnow(),
    )
    db.add(member)
    if not user.company_name:
        user.company_name = name
    user.onboarding_completed = True
    db.commit()
    return {
        "id": company.id,
        "name": company.name,
        "industry": company.industry,
        "description": company.description,
        "role": "admin",
    }


@app.post("/api/issuer/join-company")
def issuer_join_company(
    payload: dict,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Request to join an existing issuer company by name."""
    if user.account_type != "issuer":
        raise HTTPException(status_code=400, detail="Only issuer accounts can join issuer companies.")
    company_name = (payload.get("company_name") or "").strip()
    if not company_name:
        raise HTTPException(status_code=400, detail="Company name is required.")
    company = db.query(IssuerCompany).filter(IssuerCompany.name.ilike(company_name)).first()
    if not company:
        raise HTTPException(status_code=404, detail=f"No issuer company named '{company_name}' found. Ask your admin to confirm the exact name, or create a new company.")
    existing = db.query(CompanyMember).filter(
        CompanyMember.company_id == company.id,
        CompanyMember.user_id == user.id,
    ).first()
    if existing:
        return {"id": existing.id, "status": existing.status, "company_name": company.name,
                "message": f"Your membership is already '{existing.status}'."}
    member = CompanyMember(
        company_id=company.id,
        user_id=user.id,
        role="member",
        status="pending",
        job_title=payload.get("job_title"),
    )
    db.add(member)
    db.commit()
    return {
        "id": member.id,
        "status": "pending",
        "company_name": company.name,
        "message": f"Join request submitted. An admin of {company.name} will approve your membership.",
    }


@app.get("/api/issuer/company")
def issuer_get_company(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Get the issuer company the current user belongs to (and membership info)."""
    member = db.query(CompanyMember).filter(
        CompanyMember.user_id == user.id,
    ).first()
    if not member:
        return {"company": None, "member": None}
    company = db.query(IssuerCompany).filter(IssuerCompany.id == member.company_id).first()
    return {
        "company": {
            "id": company.id,
            "name": company.name,
            "registration_number": company.registration_number,
            "description": company.description,
            "industry": company.industry,
            "address": company.address,
            "phone": company.phone,
            "email": company.email,
            "website": company.website,
            "logo_path": company.logo_path,
        } if company else None,
        "member": {
            "id": member.id,
            "role": member.role,
            "status": member.status,
            "job_title": member.job_title,
        },
    }


@app.get("/api/issuer/members")
def issuer_list_members(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """List all members of the issuer company."""
    company, member = _get_issuer_membership(db, user)
    members = db.query(CompanyMember).filter(
        CompanyMember.company_id == company.id,
    ).order_by(CompanyMember.joined_at.desc()).all()
    items = []
    for m in members:
        u = db.query(User).filter(User.id == m.user_id).first()
        items.append({
            "id": m.id,
            "user_id": m.user_id,
            "email": u.email if u else None,
            "full_name": u.full_name if u else None,
            "role": m.role,
            "status": m.status,
            "job_title": m.job_title,
            "joined_at": m.joined_at.isoformat() if m.joined_at else None,
            "approved_at": m.approved_at.isoformat() if m.approved_at else None,
        })
    return {"items": items}


@app.put("/api/issuer/members/{member_id}")
def issuer_update_member(
    member_id: int,
    payload: dict,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Approve or reject a membership request (admin only)."""
    company, member = _get_issuer_membership(db, user)
    if member.role != "admin":
        raise HTTPException(status_code=403, detail="Only company admins can approve members.")
    target = db.query(CompanyMember).filter(
        CompanyMember.id == member_id,
        CompanyMember.company_id == company.id,
    ).first()
    if not target:
        raise HTTPException(status_code=404, detail="Member not found.")
    target.status = payload.get("status", target.status)
    if payload.get("status") == "approved":
        target.approved_at = datetime.utcnow()
        u = db.query(User).filter(User.id == target.user_id).first()
        if u:
            u.onboarding_completed = True
            if not u.company_name:
                u.company_name = company.name
    db.commit()
    db.refresh(target)
    u = db.query(User).filter(User.id == target.user_id).first()
    return {
        "id": target.id,
        "email": u.email if u else None,
        "full_name": u.full_name if u else None,
        "role": target.role,
        "status": target.status,
    }


@app.delete("/api/issuer/members/{member_id}")
def issuer_remove_member(
    member_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Remove a member from the issuer company (admin only)."""
    company, member = _get_issuer_membership(db, user)
    if member.role != "admin":
        raise HTTPException(status_code=403, detail="Only company admins can remove members.")
    target = db.query(CompanyMember).filter(
        CompanyMember.id == member_id,
        CompanyMember.company_id == company.id,
    ).first()
    if not target:
        raise HTTPException(status_code=404, detail="Member not found.")
    if target.role == "admin" and target.user_id == user.id:
        raise HTTPException(status_code=400, detail="You cannot remove yourself.")
    db.delete(target)
    db.commit()
    return {"deleted": True, "id": member_id}


@app.get("/api/issuer/companies/search")
def issuer_search_companies(
    q: str = "",
    db: Session = Depends(get_db),
):
    """Search for issuer companies by name."""
    query = db.query(IssuerCompany)
    if q:
        query = query.filter(IssuerCompany.name.ilike(f"%{q}%"))
    companies = query.order_by(IssuerCompany.name.asc()).limit(20).all()
    return {"items": [{"id": c.id, "name": c.name, "industry": c.industry} for c in companies]}


@app.get("/api/issuer/tenders")
def issuer_list_tenders(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """List all tenders issued by the issuer company."""
    company, member = _get_issuer_membership(db, user)
    tenders = db.query(IssuedTender).filter(
        IssuedTender.company_id == company.id,
    ).order_by(desc(IssuedTender.created_at)).all()
    items = []
    for t in tenders:
        bid_count = db.query(Bid).filter(Bid.tender_id == t.id).count()
        items.append(_serialize_issued_tender(t, company, bid_count, db))
    return {"items": items, "total": len(items)}


@app.post("/api/issuer/tenders")
def issuer_create_tender(
    payload: dict,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Create a new issued tender (draft by default)."""
    company, member = _get_issuer_membership(db, user)
    title = (payload.get("title") or "").strip()
    if not title:
        raise HTTPException(status_code=400, detail="Title is required.")
    # Generate a reference number if not provided
    ref = payload.get("reference_number") or f"TMD-{company.id}-{datetime.utcnow().strftime('%Y%m%d%H%M%S')}"
    status = (payload.get("status") or "Draft").strip() or "Draft"
    # Honour "Published" at creation: otherwise the tender stays invisible to
    # bidders and the issuer and bidder portals never connect.
    wants_published = status.lower() in ("published", "open", "live")
    t = IssuedTender(
        company_id=company.id,
        reference_number=ref,
        title=title,
        description=payload.get("description"),
        scope_of_work=payload.get("scope_of_work"),
        category=payload.get("category") or company.industry or "General",
        location=payload.get("location"),
        issue_date=_parse_date(payload.get("issue_date")),
        closing_date=_parse_date(payload.get("closing_date")),
        budget=payload.get("budget") or 0,
        contract_period=payload.get("contract_period"),
        evaluation_criteria=payload.get("evaluation_criteria"),
        submission_method=payload.get("submission_method") or "Bids must be submitted online through the TM Flow portal by the closing date. No physical or email submissions will be accepted.",
        contact_person=payload.get("contact_person"),
        contact_email=payload.get("contact_email"),
        contact_phone=payload.get("contact_phone"),
        status=status,
        is_published=wants_published,
        ai_generated_content=payload.get("ai_generated_content"),
        notes=payload.get("notes"),
        created_by=user.id,
    )
    db.add(t)
    db.commit()
    db.refresh(t)
    return _serialize_issued_tender(t, company, 0, db)


@app.get("/api/issuer/tenders/{tender_id}")
def issuer_get_tender(
    tender_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Get a single issued tender."""
    company, member = _get_issuer_membership(db, user)
    t = db.query(IssuedTender).filter(
        IssuedTender.id == tender_id,
        IssuedTender.company_id == company.id,
    ).first()
    if not t:
        raise HTTPException(status_code=404, detail="Tender not found.")
    bid_count = db.query(Bid).filter(Bid.tender_id == t.id).count()
    return _serialize_issued_tender(t, company, bid_count, db)


@app.put("/api/issuer/tenders/{tender_id}")
def issuer_update_tender(
    tender_id: int,
    payload: dict,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Update an issued tender."""
    company, member = _get_issuer_membership(db, user)
    t = db.query(IssuedTender).filter(
        IssuedTender.id == tender_id,
        IssuedTender.company_id == company.id,
    ).first()
    if not t:
        raise HTTPException(status_code=404, detail="Tender not found.")
    for field in ["title", "description", "scope_of_work", "category", "location",
                  "contract_period", "evaluation_criteria", "submission_method",
                  "contact_person", "contact_email", "contact_phone", "status",
                  "ai_generated_content", "notes"]:
        if field in payload:
            setattr(t, field, payload[field])
    if "reference_number" in payload and payload["reference_number"]:
        t.reference_number = payload["reference_number"]
    if "budget" in payload:
        t.budget = payload["budget"]
    if "issue_date" in payload:
        t.issue_date = _parse_date(payload["issue_date"])
    if "closing_date" in payload:
        t.closing_date = _parse_date(payload["closing_date"])
    db.commit()
    db.refresh(t)
    bid_count = db.query(Bid).filter(Bid.tender_id == t.id).count()
    return _serialize_issued_tender(t, company, bid_count, db)


@app.delete("/api/issuer/tenders/{tender_id}")
def issuer_delete_tender(
    tender_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Delete an issued tender."""
    company, member = _get_issuer_membership(db, user)
    t = db.query(IssuedTender).filter(
        IssuedTender.id == tender_id,
        IssuedTender.company_id == company.id,
    ).first()
    if not t:
        raise HTTPException(status_code=404, detail="Tender not found.")
    db.delete(t)
    db.commit()
    return {"deleted": True, "id": tender_id}


@app.post("/api/issuer/tenders/{tender_id}/publish")
def issuer_publish_tender(
    tender_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Publish a tender so it appears on the public board."""
    company, member = _get_issuer_membership(db, user)
    t = db.query(IssuedTender).filter(
        IssuedTender.id == tender_id,
        IssuedTender.company_id == company.id,
    ).first()
    if not t:
        raise HTTPException(status_code=404, detail="Tender not found.")
    if not t.title or not t.description:
        raise HTTPException(status_code=400, detail="Tender must have a title and description before publishing.")
    t.is_published = True
    t.status = "Open"
    if not t.issue_date:
        t.issue_date = date.today()
    db.commit()
    db.refresh(t)
    bid_count = db.query(Bid).filter(Bid.tender_id == t.id).count()
    return _serialize_issued_tender(t, company, bid_count, db)


@app.post("/api/issuer/tenders/{tender_id}/unpublish")
def issuer_unpublish_tender(
    tender_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Unpublish a tender (remove from public board)."""
    company, member = _get_issuer_membership(db, user)
    t = db.query(IssuedTender).filter(
        IssuedTender.id == tender_id,
        IssuedTender.company_id == company.id,
    ).first()
    if not t:
        raise HTTPException(status_code=404, detail="Tender not found.")
    t.is_published = False
    t.status = "Draft"
    db.commit()
    db.refresh(t)
    bid_count = db.query(Bid).filter(Bid.tender_id == t.id).count()
    return _serialize_issued_tender(t, company, bid_count, db)


# In-memory store for AI generation jobs (job_id -> {status, result, error})
_AI_JOBS: dict = {}


@app.post("/api/issuer/tenders/ai-generate")
def issuer_ai_generate_tender(
    payload: dict,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """AI Tender Writer — start async generation and return a job ID immediately.
    The frontend polls /api/issuer/tenders/ai-generate/{job_id} for the result."""
    company, member = _get_issuer_membership(db, user)
    prompt = (payload.get("prompt") or "").strip()
    if not prompt:
        raise HTTPException(status_code=400, detail="A prompt describing the tender is required.")
    industry = payload.get("industry") or company.industry or "General"
    company_name = company.name

    job_id = str(uuid.uuid4())
    _AI_JOBS[job_id] = {"status": "pending", "result": None, "error": None, "created_at": datetime.utcnow().isoformat()}

    def _run_job():
        try:
            result = ai_module.generate_tender_from_prompt(
                prompt=prompt,
                industry=industry,
                company_name=company_name,
            )
            _AI_JOBS[job_id] = {"status": "done", "result": result, "error": None, "created_at": _AI_JOBS[job_id]["created_at"]}
        except Exception as e:
            _AI_JOBS[job_id] = {"status": "error", "result": None, "error": str(e), "created_at": _AI_JOBS[job_id]["created_at"]}

    threading.Thread(target=_run_job, daemon=True).start()
    return {"job_id": job_id, "status": "pending"}


@app.get("/api/issuer/tenders/ai-generate/{job_id}")
def issuer_ai_generate_status(
    job_id: str,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Poll the status of an AI tender generation job."""
    # Verify membership (keep endpoint secure)
    _get_issuer_membership(db, user)
    job = _AI_JOBS.get(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found.")
    return job


@app.get("/api/issuer/tenders/{tender_id}/bids")
def issuer_list_tender_bids(
    tender_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """List all bids for a specific tender."""
    company, member = _get_issuer_membership(db, user)
    t = db.query(IssuedTender).filter(
        IssuedTender.id == tender_id,
        IssuedTender.company_id == company.id,
    ).first()
    if not t:
        raise HTTPException(status_code=404, detail="Tender not found.")
    bids = db.query(Bid).filter(Bid.tender_id == tender_id).order_by(desc(Bid.submitted_at)).all()
    return {"items": [_serialize_bid(b, t, db) for b in bids], "total": len(bids)}


@app.get("/api/issuer/bids")
def issuer_list_all_bids(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """List all bids across all tenders issued by the company."""
    company, member = _get_issuer_membership(db, user)
    tender_ids = [t.id for t in db.query(IssuedTender).filter(IssuedTender.company_id == company.id).all()]
    if not tender_ids:
        return {"items": [], "total": 0}
    bids = db.query(Bid).filter(Bid.tender_id.in_(tender_ids)).order_by(desc(Bid.submitted_at)).all()
    items = []
    for b in bids:
        t = db.query(IssuedTender).filter(IssuedTender.id == b.tender_id).first()
        items.append(_serialize_bid(b, t, db))
    return {"items": items, "total": len(items)}


@app.delete("/api/issuer/bids/{bid_id}")
def issuer_delete_bid(
    bid_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Delete a bid."""
    company, member = _get_issuer_membership(db, user)
    bid = db.query(Bid).filter(Bid.id == bid_id).first()
    if not bid:
        raise HTTPException(status_code=404, detail="Bid not found.")
    t = db.query(IssuedTender).filter(IssuedTender.id == bid.tender_id).first()
    if not t or t.company_id != company.id:
        raise HTTPException(status_code=403, detail="You can only delete bids on your own tenders.")
    db.delete(bid)
    db.commit()
    return {"deleted": True, "id": bid_id}


@app.post("/api/issuer/bids/{bid_id}/ai-review")
def issuer_ai_review_bid(
    bid_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """AI Bid Review — analyse a bid against the tender requirements."""
    company, member = _get_issuer_membership(db, user)
    bid = db.query(Bid).filter(Bid.id == bid_id).first()
    if not bid:
        raise HTTPException(status_code=404, detail="Bid not found.")
    t = db.query(IssuedTender).filter(IssuedTender.id == bid.tender_id).first()
    if not t or t.company_id != company.id:
        raise HTTPException(status_code=403, detail="You can only review bids on your own tenders.")
    tender_data = {
        "title": t.title,
        "description": t.description,
        "scope_of_work": t.scope_of_work,
        "evaluation_criteria": t.evaluation_criteria,
    }
    bid_data = {
        "bidder_company_name": bid.bidder_company_name,
        "bidder_contact_person": bid.bidder_contact_person,
        "bidder_bbbee_level": bid.bidder_bbbee_level,
        "proposal_summary": bid.proposal_summary,
        "total_amount": bid.total_amount,
    }
    review = ai_module.review_bid(bid_data, tender_data)
    # Store the review text + scores
    bid.ai_review = review.get("summary", "")
    bid.ai_reviewed_at = datetime.utcnow()
    bid.technical_score = review.get("technical_score", 0)
    bid.financial_score = review.get("financial_score", 0)
    bid.reviewed_at = datetime.utcnow()
    bid.reviewed_by = user.id
    if review.get("recommendation") == "Award":
        bid.status = "Recommended"
    elif review.get("recommendation") == "Do Not Award":
        bid.status = "Not Recommended"
    else:
        bid.status = "Under Review"
    db.commit()
    db.refresh(bid)
    return _serialize_bid(b, t, db)


@app.post("/api/issuer/bids/{bid_id}/award")
def issuer_award_bid(
    bid_id: int,
    payload: dict,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Mark a bid as awarded (or revoke)."""
    company, member = _get_issuer_membership(db, user)
    bid = db.query(Bid).filter(Bid.id == bid_id).first()
    if not bid:
        raise HTTPException(status_code=404, detail="Bid not found.")
    t = db.query(IssuedTender).filter(IssuedTender.id == bid.tender_id).first()
    if not t or t.company_id != company.id:
        raise HTTPException(status_code=403, detail="You can only award bids on your own tenders.")
    awarded = payload.get("awarded", True)
    if awarded:
        # Mark this bid as Awarded and all others for this tender as Unsuccessful
        other_bids = db.query(Bid).filter(
            Bid.tender_id == bid.tender_id,
            Bid.id != bid.id,
        ).all()
        for ob in other_bids:
            ob.status = "Unsuccessful"
        bid.status = "Awarded"
        bid.reviewed_at = datetime.utcnow()
        bid.reviewed_by = user.id
        t.status = "Awarded"
    else:
        bid.status = "Under Review"
        t.status = "Open"
    db.commit()
    db.refresh(bid)
    return _serialize_bid(b, t, db)


@app.get("/api/issuer/stats")
def issuer_stats(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Overview stats for the issuer dashboard."""
    company, member = _get_issuer_membership(db, user)
    tenders = db.query(IssuedTender).filter(IssuedTender.company_id == company.id).all()
    tender_ids = [t.id for t in tenders]
    bids = db.query(Bid).filter(Bid.tender_id.in_(tender_ids)).all() if tender_ids else []
    # Top bidders by number of bids
    bidder_counts = {}
    for b in bids:
        bidder_counts[b.bidder_company_name] = bidder_counts.get(b.bidder_company_name, 0) + 1
    top_bidders = sorted(bidder_counts.items(), key=lambda x: x[1], reverse=True)[:5]
    return {
        "company_name": company.name,
        "total_tenders": len(tenders),
        "published_tenders": len([t for t in tenders if t.is_published]),
        "draft_tenders": len([t for t in tenders if not t.is_published]),
        "open_tenders": len([t for t in tenders if t.status == "Open"]),
        "awarded_tenders": len([t for t in tenders if t.status == "Awarded"]),
        "total_bids": len(bids),
        "pending_bids": len([b for b in bids if b.status == "Pending"]),
        "reviewed_bids": len([b for b in bids if b.status in ("Recommended", "Not Recommended", "Under Review", "Awarded", "Unsuccessful")]),
        "awarded_bids": len([b for b in bids if b.status == "Awarded"]),
        "top_bidders": [{"company_name": name, "bid_count": cnt} for name, cnt in top_bidders],
        "member_count": db.query(CompanyMember).filter(CompanyMember.company_id == company.id).count(),
    }


def _parse_date(s):
    if not s:
        return None
    try:
        return datetime.strptime(s[:10], "%Y-%m-%d").date()
    except Exception:
        return None


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
