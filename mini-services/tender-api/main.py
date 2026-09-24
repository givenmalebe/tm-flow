"""
TenderFlow - Main FastAPI Application
Tender Management System API
"""
import os
import shutil
import uuid
from datetime import datetime, date, timedelta
from typing import List, Optional, Any
from pathlib import Path

from fastapi import FastAPI, Depends, HTTPException, UploadFile, File, Form, Query, Header
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, EmailStr, Field
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import or_, and_, desc, asc

from database import (
    Base, engine, get_db, init_db,
    User, Tender, TenderDocument, ChecklistItem, LibraryDocument,
    Briefing, PricingVersion, Submission, Communication, Addendum, ReminderSetting,
    CompanyProfile, GeneratedDocument
)
from auth import (
    hash_password, verify_password, create_access_token, get_current_user
)
import ai_module

# Initialize DB on import
init_db()

# Upload directory
UPLOAD_DIR = os.path.join(os.path.dirname(__file__), "uploads")
os.makedirs(UPLOAD_DIR, exist_ok=True)

app = FastAPI(title="TenderFlow API", version="1.0.0")

# CORS - allow the Next.js frontend (and preview origin)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Serve uploaded files
app.mount("/uploads", StaticFiles(directory=UPLOAD_DIR), name="uploads")

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
                "final_pricing": t.submission.final_pricing,
                "notes": t.submission.notes,
            } if t.submission else None
        ),
        "communications": [
            {
                "id": c.id, "comm_type": c.comm_type, "subject": c.subject,
                "body": c.body,
                "comm_date": c.comm_date.isoformat() if c.comm_date else None,
                "from_party": c.from_party, "to_party": c.to_party,
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
    """Save an uploaded file to UPLOAD_DIR/subdir and return relative path."""
    target_dir = os.path.join(UPLOAD_DIR, subdir) if subdir else UPLOAD_DIR
    os.makedirs(target_dir, exist_ok=True)
    safe_name = f"{uuid.uuid4().hex}_{Path(upload.filename).name}"
    target_path = os.path.join(target_dir, safe_name)
    with open(target_path, "wb") as out:
        shutil.copyfileobj(upload.file, out)
    return os.path.relpath(target_path, UPLOAD_DIR)


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

@app.post("/api/auth/register", response_model=TokenOut)
def register(payload: UserCreate, db: Session = Depends(get_db)):
    existing = db.query(User).filter(User.email == payload.email.lower()).first()
    if existing:
        raise HTTPException(status_code=400, detail="Email already registered")
    user = User(
        email=payload.email.lower(),
        full_name=payload.full_name,
        company_name=payload.company_name,
        hashed_password=hash_password(payload.password),
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    token = create_access_token({"sub": str(user.id)})
    return TokenOut(access_token=token, user=UserOut.model_validate(user))


@app.post("/api/auth/login", response_model=TokenOut)
def login(payload: UserLogin, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == payload.email.lower()).first()
    if not user or not verify_password(payload.password, user.hashed_password):
        raise HTTPException(status_code=401, detail="Invalid email or password")
    token = create_access_token({"sub": str(user.id)})
    return TokenOut(access_token=token, user=UserOut.model_validate(user))


@app.get("/api/auth/me", response_model=UserOut)
def me(user: User = Depends(get_current_user)):
    return user


# ---------------------- Tender Routes ----------------------

@app.get("/api/tenders")
def list_tenders(
    search: Optional[str] = None,
    status: Optional[str] = None,
    category: Optional[str] = None,
    person_responsible: Optional[str] = None,
    outcome: Optional[str] = None,
    sort: str = "updated_at",
    order: str = "desc",
    skip: int = 0,
    limit: int = 200,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    q = db.query(Tender)
    if search:
        like = f"%{search}%"
        q = q.filter(or_(
            Tender.reference_number.ilike(like),
            Tender.title.ilike(like),
            Tender.client_company.ilike(like),
            Tender.location_site.ilike(like),
            Tender.person_responsible.ilike(like),
        ))
    if status:
        q = q.filter(Tender.status == status)
    if category:
        q = q.filter(Tender.category == category)
    if person_responsible:
        q = q.filter(Tender.person_responsible == person_responsible)
    if outcome:
        q = q.filter(Tender.outcome == outcome)
    # Sorting
    sort_col = {
        "updated_at": Tender.updated_at,
        "created_at": Tender.created_at,
        "closing_date": Tender.closing_date,
        "estimated_value": Tender.estimated_value,
        "reference_number": Tender.reference_number,
        "title": Tender.title,
    }.get(sort, Tender.updated_at)
    q = q.order_by(asc(sort_col) if order == "asc" else desc(sort_col))
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
    file_size = os.path.getsize(os.path.join(UPLOAD_DIR, rel_path))
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
        full_path = os.path.join(UPLOAD_DIR, doc.file_path)
        if os.path.exists(full_path):
            combined_text += f"\n\n=== {doc.original_filename} ===\n"
            combined_text += ai_module.extract_text_from_file(full_path, doc.original_filename)
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
    # Save the uploaded file temporarily
    rel_path = _save_upload(file, subdir="ai_reader")
    full_path = os.path.join(UPLOAD_DIR, rel_path)
    file_size = os.path.getsize(full_path)

    # Extract text
    document_text = ai_module.extract_text_from_file(full_path, file.filename)
    if not document_text or len(document_text.strip()) < 50:
        # Clean up the file
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

    # Generate and save AI summary
    if extracted and not extracted.get("_error"):
        try:
            summary = ai_module.generate_tender_summary(
                {"reference_number": t.reference_number, "title": t.title,
                 "client_company": t.client_company, "closing_date": t.closing_date.isoformat() if t.closing_date else None,
                 "contract_period": t.contract_period, "location_site": t.location_site,
                 "scope_of_work": t.scope_of_work, "status": t.status},
                extracted
            )
            t.ai_summary = summary
        except Exception:
            pass

    t.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(t)
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


# ---------------------- Library Document Routes ----------------------

@app.get("/api/library")
def list_library(
    category: Optional[str] = None,
    search: Optional[str] = None,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    q = db.query(LibraryDocument)
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
    file_size = os.path.getsize(os.path.join(UPLOAD_DIR, rel_path))
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
        from_party=payload.from_party,
        to_party=payload.to_party,
        notes=payload.notes,
    )
    db.add(c)
    db.commit()
    db.refresh(c)
    return {"id": c.id, "comm_type": c.comm_type}


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
    # Get addendum text
    addendum_path = os.path.join(UPLOAD_DIR, addendum.file_path)
    addendum_text = ""
    if os.path.exists(addendum_path):
        addendum_text = ai_module.extract_text_from_file(addendum_path, addendum.title)
    if len(addendum_text.strip()) < 50:
        raise HTTPException(status_code=400, detail="Could not extract addendum text")
    changes = ai_module.detect_addendum_changes(original_text, addendum_text)
    addendum.ai_changes = changes
    db.commit()
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
    all_tenders = db.query(Tender).all()
    active_statuses = {"New Opportunity", "Under Review", "Interested", "Preparing",
                       "Documents Outstanding", "Pricing in Progress", "Awaiting Information",
                       "Ready for Submission", "Submitted", "Clarification Requested",
                       "Clarification Submitted", "Shortlisted", "Interview/Presentation",
                       "Negotiation"}
    active = [t for t in all_tenders if t.status in active_statuses]
    preparing = [t for t in all_tenders if t.status in {"Preparing", "Documents Outstanding", "Pricing in Progress", "Awaiting Information"}]
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
    library_docs = db.query(LibraryDocument).all()
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

    # Get company profile
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
    }

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


@app.get("/api/document-types")
def list_document_types():
    """List all available AI document types that can be generated."""
    return {"types": [
        {"key": k, "title": v["title"], "description": v["description"]}
        for k, v in ai_module.DOCUMENT_TYPE_INFO.items()
    ]}


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
    """AI-powered tender discovery. Searches the web for open tenders matching the criteria."""
    if not payload.category or not payload.category.strip():
        raise HTTPException(status_code=400, detail="Category is required")
    result = ai_module.discover_tenders(
        category=payload.category.strip(),
        keywords=(payload.keywords or "").strip(),
        location=(payload.location or "South Africa").strip(),
        num_results=min(max(payload.num_results, 5), 30),
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

    # ---- Dashboard stats ----
    today = date.today()
    all_tenders = db.query(Tender).all()
    active_statuses = {"New Opportunity", "Under Review", "Interested", "Preparing",
                       "Documents Outstanding", "Pricing in Progress", "Awaiting Information",
                       "Ready for Submission", "Submitted", "Clarification Requested",
                       "Clarification Submitted", "Shortlisted", "Interview/Presentation",
                       "Negotiation"}
    active = [t for t in all_tenders if t.status in active_statuses]
    closing_this_week = [t for t in all_tenders if t.closing_date and t.status in active_statuses
                         and 0 <= (t.closing_date - today).days <= 7]

    # ---- Compliance library ----
    library_docs = db.query(LibraryDocument).all()
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
    }

    # If a focus tender is specified, also include its full serialized form
    if tender_id:
        t = db.query(Tender).filter(Tender.id == tender_id).first()
        if t:
            context["focus_tender_id"] = tender_id

    return context


@app.post("/api/ai/assistant")
def ai_assistant(payload: AIQuestion, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    question = payload.question.strip()
    if not question:
        raise HTTPException(status_code=400, detail="Question is required")
    # Build COMPREHENSIVE context: all tenders, all documents (with text), library, etc.
    context = _build_full_system_context(db, user, tender_id=payload.tender_id)
    answer = ai_module.assistant_answer(question, context)
    return {
        "answer": answer,
        "context_tenders": len(context["tenders"]),
        "context_documents": sum(len(t["documents"]) for t in context["tenders"]),
        "context_library_docs": len(context["compliance_library"]),
    }


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


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
