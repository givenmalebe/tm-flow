# Tender Bidder Evaluation & Tracking Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (- [ ]) syntax for tracking.

**Goal:** Add competitive bidding evaluation capabilities - track multiple bidders per tender, manage required qualification documents, AI-powered compliance checking, and AI-driven top bidder determination with analytics.

**Architecture:** Extend existing FastAPI backend (SQLAlchemy models, Pydantic schemas, API routes) with bidder models and evaluation endpoints. Add AI functions to ai_module.py using z-ai CLI. Create new Bidders tab in Next.js frontend following established emerald-theme shadcn/ui patterns. All changes are additive and backward compatible.

**Tech Stack:** Python/FastAPI/SQLAlchemy (SQLite), Next.js 16/TypeScript/shadcn/ui/Tailwind, z-ai CLI for AI operations, FormData for file uploads.

## Global Constraints

- Maintain backward compatibility - no breaking changes to existing models/endpoints
- Follow existing code style and patterns (emerald theme, no blue/indigo chrome except semantic states)
- All new API endpoints require JWT auth (follow existing auth pattern)
- File storage under uploads/ with organized subdirs (uploads/bidders/{bidder_id}/)
- AI operations use z-ai CLI via subprocess with proper timeouts and error handling
- TypeScript strict - no any unless necessary with justification
- Preserve full AI reasoning in JSON for audit trail
- Single bidder submission per bidder initially (no versioning)

---
### Task 1: Backend - Add Database Models

**Files:**
- Modify: mini-services/tender-api/database.py

**Interfaces:**
- Consumes: Existing Base, datetime, Column types, relationships, JSON, ForeignKey
- Produces: TenderBidder, TenderBidderDocument, TenderRequiredDocument, TenderEvaluation model classes

- [ ] **Step 1: Add TenderBidder model**
`python
class TenderBidder(Base):
    __tablename__ = "tender_bidders"
    id = Column(Integer, primary_key=True, index=True)
    tender_id = Column(Integer, ForeignKey("tenders.id", ondelete="CASCADE"), nullable=False)
    company_name = Column(String(500), nullable=False, index=True)
    contact_name = Column(String(255), nullable=True)
    contact_email = Column(String(255), nullable=True)
    contact_phone = Column(String(255), nullable=True)
    registration_number = Column(String(255), nullable=True)
    vat_number = Column(String(100), nullable=True)
    bbbbee_level = Column(String(100), nullable=True)
    bid_amount = Column(Float, nullable=True)
    currency = Column(String(10), default="ZAR")
    submitted_at = Column(DateTime, nullable=True)
    is_compliant = Column(Boolean, nullable=True)
    compliance_score = Column(Integer, nullable=True)
    technical_score = Column(Integer, nullable=True)
    overall_score = Column(Integer, nullable=True)
    evaluation_status = Column(String(50), default="pending")  # pending, evaluating, evaluated, needs_review
    evaluation_summary = Column(Text, nullable=True)
    evaluation_details = Column(JSON, nullable=True)
    is_top_bidder = Column(Boolean, default=False)
    rank = Column(Integer, nullable=True)
    awarded = Column(Boolean, default=False)
    notes = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    tender = relationship("Tender", back_populates="bidders")
    documents = relationship("TenderBidderDocument", back_populates="bidder", cascade="all, delete-orphan")
`

- [ ] **Step 2: Add TenderBidderDocument model**
`python
class TenderBidderDocument(Base):
    __tablename__ = "tender_bidder_documents"
    id = Column(Integer, primary_key=True, index=True)
    bidder_id = Column(Integer, ForeignKey("tender_bidders.id", ondelete="CASCADE"), nullable=False)
    requirement_name = Column(String(500), nullable=False)
    requirement_category = Column(String(255), nullable=True)
    is_required = Column(Boolean, default=True)
    status = Column(String(50), default="missing")  # missing, received, compliant, non_compliant, expired, under_review
    filename = Column(String(500), nullable=True)
    file_path = Column(String(1000), nullable=True)
    original_filename = Column(String(500), nullable=True)
    file_size = Column(Integer, nullable=True)
    file_type = Column(String(100), nullable=True)
    issue_date = Column(Date, nullable=True)
    expiry_date = Column(Date, nullable=True)
    is_certified = Column(Boolean, nullable=True)
    compliance_notes = Column(Text, nullable=True)
    ai_checked = Column(Boolean, default=False)
    ai_check_result = Column(JSON, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    bidder = relationship("TenderBidder", back_populates="documents")
`

- [ ] **Step 3: Add TenderRequiredDocument model**
`python
class TenderRequiredDocument(Base):
    __tablename__ = "tender_required_documents"
    id = Column(Integer, primary_key=True, index=True)
    tender_id = Column(Integer, ForeignKey("tenders.id", ondelete="CASCADE"), nullable=False)
    name = Column(String(500), nullable=False)
    category = Column(String(255), nullable=True)
    description = Column(Text, nullable=True)
    is_mandatory = Column(Boolean, default=True)
    reference_source = Column(String(100), nullable=True)  # extracted_from_tender, uploaded_ref_doc, library_template, manual
    source_file_path = Column(String(1000), nullable=True)
    order_index = Column(Integer, default=0)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    tender = relationship("Tender", back_populates="required_documents")
`

- [ ] **Step 4: Add TenderEvaluation model**
`python
class TenderEvaluation(Base):
    __tablename__ = "tender_evaluations"
    id = Column(Integer, primary_key=True, index=True)
    tender_id = Column(Integer, ForeignKey("tenders.id"), nullable=False)
    evaluation_type = Column(String(100), nullable=False)  # document_qualification, full_evaluation, top_bidder
    status = Column(String(50), default="running")  # running, completed, failed
    prompt_used = Column(Text, nullable=True)
    result = Column(JSON, nullable=True)
    reasoning = Column(Text, nullable=True)
    top_bidder_id = Column(Integer, ForeignKey("tender_bidders.id"), nullable=True)
    evaluated_by = Column(String(100), default="system")
    created_at = Column(DateTime, default=datetime.utcnow)
    completed_at = Column(DateTime, nullable=True)
    tender = relationship("Tender", back_populates="evaluations")
`

- [ ] **Step 5: Add relationships to Tender model**
Add to Tender class (after addendums relationship):
`python
bidders = relationship("TenderBidder", back_populates="tender", cascade="all, delete-orphan")
required_documents = relationship("TenderRequiredDocument", back_populates="tender", cascade="all, delete-orphan")
evaluations = relationship("TenderEvaluation", back_populates="tender", cascade="all, delete-orphan")
`

- [ ] **Step 6: Verify database imports and test model loading**
Run: cd mini-services/tender-api && python -c "from database import TenderBidder, TenderBidderDocument, TenderRequiredDocument, TenderEvaluation; print('ok')" 2>&1
Expected: 'ok' with no errors
### Task 2: Backend - Add Pydantic Schemas in main.py

**Files:**
- Modify: mini-services/tender-api/main.py

**Interfaces:**
- Consumes: TenderBidder models, BaseModel from pydantic, typing (List, Optional, Any)
- Produces: Pydantic request/response schemas for bidders and required docs

- [ ] **Step 1: Add TenderRequiredDocument schemas**
After TenderOut class, add:
`python
# ---- Tender Required Documents ----
class TenderRequiredDocumentBase(BaseModel):
    name: str
    category: Optional[str] = None
    description: Optional[str] = None
    is_mandatory: bool = True
    reference_source: Optional[str] = None
    source_file_path: Optional[str] = None
    order_index: int = 0


class TenderRequiredDocumentCreate(TenderRequiredDocumentBase):
    pass


class TenderRequiredDocumentUpdate(BaseModel):
    name: Optional[str] = None
    category: Optional[str] = None
    description: Optional[str] = None
    is_mandatory: Optional[bool] = None
    reference_source: Optional[str] = None
    source_file_path: Optional[str] = None
    order_index: Optional[int] = None


class TenderRequiredDocumentOut(TenderRequiredDocumentBase):
    id: int
    tender_id: int
    created_at: datetime
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True
`

- [ ] **Step 2: Add TenderBidderDocument schemas**
`python
# ---- Tender Bidder Documents ----
class TenderBidderDocumentBase(BaseModel):
    requirement_name: str
    requirement_category: Optional[str] = None
    is_required: bool = True
    status: str = "missing"
    notes: Optional[str] = None


class TenderBidderDocumentUpdate(BaseModel):
    requirement_name: Optional[str] = None
    requirement_category: Optional[str] = None
    is_required: Optional[bool] = None
    status: Optional[str] = None
    compliance_notes: Optional[str] = None
    issue_date: Optional[date] = None
    expiry_date: Optional[date] = None
    is_certified: Optional[bool] = None


class TenderBidderDocumentOut(TenderBidderDocumentBase):
    id: int
    bidder_id: int
    filename: Optional[str] = None
    file_path: Optional[str] = None
    original_filename: Optional[str] = None
    file_size: Optional[int] = None
    file_type: Optional[str] = None
    issue_date: Optional[date] = None
    expiry_date: Optional[date] = None
    is_certified: Optional[bool] = None
    compliance_notes: Optional[str] = None
    ai_checked: bool = False
    ai_check_result: Optional[Any] = None
    created_at: datetime
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True
`

- [ ] **Step 3: Add TenderBidder schemas**
`python
# ---- Tender Bidders ----
class TenderBidderBase(BaseModel):
    company_name: str
    contact_name: Optional[str] = None
    contact_email: Optional[str] = None
    contact_phone: Optional[str] = None
    registration_number: Optional[str] = None
    vat_number: Optional[str] = None
    bbbbee_level: Optional[str] = None
    bid_amount: Optional[float] = None
    currency: str = "ZAR"
    submitted_at: Optional[datetime] = None
    notes: Optional[str] = None


class TenderBidderCreate(TenderBidderBase):
    pass


class TenderBidderUpdate(BaseModel):
    company_name: Optional[str] = None
    contact_name: Optional[str] = None
    contact_email: Optional[str] = None
    contact_phone: Optional[str] = None
    registration_number: Optional[str] = None
    vat_number: Optional[str] = None
    bbbbee_level: Optional[str] = None
    bid_amount: Optional[float] = None
    currency: Optional[str] = None
    submitted_at: Optional[datetime] = None
    is_compliant: Optional[bool] = None
    compliance_score: Optional[int] = None
    technical_score: Optional[int] = None
    overall_score: Optional[int] = None
    evaluation_status: Optional[str] = None
    evaluation_summary: Optional[str] = None
    evaluation_details: Optional[Any] = None
    is_top_bidder: Optional[bool] = None
    rank: Optional[int] = None
    awarded: Optional[bool] = None
    notes: Optional[str] = None


class TenderBidderOut(TenderBidderBase):
    id: int
    tender_id: int
    is_compliant: Optional[bool] = None
    compliance_score: Optional[int] = None
    technical_score: Optional[int] = None
    overall_score: Optional[int] = None
    evaluation_status: str = "pending"
    evaluation_summary: Optional[str] = None
    evaluation_details: Optional[Any] = None
    is_top_bidder: bool = False
    rank: Optional[int] = None
    awarded: bool = False
    created_at: datetime
    updated_at: Optional[datetime] = None
    documents: List[TenderBidderDocumentOut] = []

    class Config:
        from_attributes = True
`

- [ ] **Step 4: Add TenderEvaluation schemas**
`python
# ---- Tender Evaluations ----
class TenderEvaluationOut(BaseModel):
    id: int
    tender_id: int
    evaluation_type: str
    status: str
    reasoning: Optional[str] = None
    result: Optional[Any] = None
    top_bidder_id: Optional[int] = None
    evaluated_by: str
    created_at: datetime
    completed_at: Optional[datetime] = None

    class Config:
        from_attributes = True
`

- [ ] **Step 5: Update TenderOut to include new relationships**
Add to TenderOut fields (after addendums):
`python
required_documents: List[TenderRequiredDocumentOut] = []
bidders: List[TenderBidderOut] = []
evaluations: List[TenderEvaluationOut] = []
`

- [ ] **Step 6: Test schema imports**
Run: cd mini-services/tender-api && python -c "from main import TenderBidderOut, TenderRequiredDocumentOut; print('ok')" 2>&1
Expected: 'ok'
### Task 3: Backend - Add API Endpoints (Required Documents & Bidders)

**Files:**
- Modify: mini-services/tender-api/main.py

**Interfaces:**
- Consumes: Schemas from Task 2, models from Task 1, get_db, get_current_user, os, pathlib
- Produces: REST endpoints for required docs and bidders CRUD

- [ ] **Step 1: Add uploads/bidders directory helper logic (implicit) - ensure dirs created**
Note: In upload endpoints we'll create dirs as needed using os.makedirs

- [ ] **Step 2: Required Documents endpoints - GET list**
`python
@app.get("/api/tenders/{tender_id}/required-documents", response_model=List[TenderRequiredDocumentOut])
def list_required_docs(tender_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    tender = db.query(Tender).filter(Tender.id == tender_id).first()
    if not tender:
        raise HTTPException(status_code=404, detail="Tender not found")
    items = db.query(TenderRequiredDocument).filter(TenderRequiredDocument.tender_id == tender_id).order_by(TenderRequiredDocument.order_index, TenderRequiredDocument.id).all()
    return items
`

- [ ] **Step 3: Required Documents - POST create**
`python
@app.post("/api/tenders/{tender_id}/required-documents", response_model=TenderRequiredDocumentOut)
def create_required_doc(tender_id: int, payload: TenderRequiredDocumentCreate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    tender = db.query(Tender).filter(Tender.id == tender_id).first()
    if not tender:
        raise HTTPException(status_code=404, detail="Tender not found")
    item = TenderRequiredDocument(tender_id=tender_id, **payload.dict())
    db.add(item)
    db.commit()
    db.refresh(item)
    return item
`

- [ ] **Step 4: Required Documents - PUT update**
`python
@app.put("/api/required-documents/{req_id}", response_model=TenderRequiredDocumentOut)
def update_required_doc(req_id: int, payload: TenderRequiredDocumentUpdate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    item = db.query(TenderRequiredDocument).filter(TenderRequiredDocument.id == req_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Not found")
    for k, v in payload.dict(exclude_unset=True).items():
        setattr(item, k, v)
    item.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(item)
    return item
`

- [ ] **Step 5: Required Documents - DELETE**
`python
@app.delete("/api/required-documents/{req_id}")
def delete_required_doc(req_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    item = db.query(TenderRequiredDocument).filter(TenderRequiredDocument.id == req_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Not found")
    db.delete(item)
    db.commit()
    return {"deleted": True}
`

- [ ] **Step 6: Bidders - GET list for tender**
`python
@app.get("/api/tenders/{tender_id}/bidders", response_model=List[TenderBidderOut])
def list_bidders(tender_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    tender = db.query(Tender).filter(Tender.id == tender_id).first()
    if not tender:
        raise HTTPException(status_code=404, detail="Tender not found")
    bidders = db.query(TenderBidder).filter(TenderBidder.tender_id == tender_id).order_by(TenderBidder.rank.asc().nullslast(), TenderBidder.created_at.desc()).all()
    return bidders
`

- [ ] **Step 7: Bidders - POST create**
`python
@app.post("/api/tenders/{tender_id}/bidders", response_model=TenderBidderOut)
def create_bidder(tender_id: int, payload: TenderBidderCreate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    tender = db.query(Tender).filter(Tender.id == tender_id).first()
    if not tender:
        raise HTTPException(status_code=404, detail="Tender not found")
    data = payload.dict()
    if data.get("submitted_at") is None:
        pass  # keep None
    bidder = TenderBidder(tender_id=tender_id, **data)
    db.add(bidder)
    db.commit()
    db.refresh(bidder)
    return bidder
`

- [ ] **Step 8: Bidders - GET single, PUT update, DELETE**
Add these endpoints following existing patterns. GET: @app.get("/api/bidders/{bidder_id}"), PUT: @app.put("/api/bidders/{bidder_id}"), DELETE: @app.delete("/api/bidders/{bidder_id}") returning {"deleted": True}

- [ ] **Step 9: Quick smoke test - import main**
Run: cd mini-services/tender-api && python -c "import main; print('ok')" 2>&1 | tail -5
Expected: no import errors, 'ok' appears
### Task 4: Backend - Bidder Documents Upload & Management

**Files:**
- Modify: mini-services/tender-api/main.py

**Interfaces:**
- Consumes: TenderBidderDocument models, upload helpers pattern (os, uuid, pathlib), FormData handling
- Produces: Upload endpoint for bidder docs, delete, match requirement

- [ ] **Step 1: Create bidder documents upload endpoint**
`python
@app.post("/api/bidders/{bidder_id}/documents")
async def upload_bidder_documents(bidder_id: int, files: List[UploadFile] = File(...), db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    bidder = db.query(TenderBidder).filter(TenderBidder.id == bidder_id).first()
    if not bidder:
        raise HTTPException(status_code=404, detail="Bidder not found")
    upload_dir = os.path.join(UPLOAD_DIR, "bidders", str(bidder_id))
    os.makedirs(upload_dir, exist_ok=True)
    results = []
    for f in files:
        ext = os.path.splitext(f.filename)[1]
        unique_name = f"{uuid.uuid4().hex}{ext}"
        file_path = os.path.join(upload_dir, unique_name)
        with open(file_path, "wb") as fh:
            content = await f.read()
            fh.write(content)
        rel_path = os.path.join("bidders", str(bidder_id), unique_name)
        size = len(content)
        doc = TenderBidderDocument(
            bidder_id=bidder_id,
            requirement_name=f.filename,
            status="received",
            filename=unique_name,
            file_path=rel_path,
            original_filename=f.filename,
            file_size=size,
            file_type=f.content_type or "",
        )
        db.add(doc)
        db.commit()
        db.refresh(doc)
        results.append(doc)
    return {"uploaded": len(results), "documents": results}
`

- [ ] **Step 2: Delete bidder document endpoint**
`python
@app.delete("/api/bidder-documents/{doc_id}")
def delete_bidder_document(doc_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    doc = db.query(TenderBidderDocument).filter(TenderBidderDocument.id == doc_id).first()
    if not doc:
        raise HTTPException(status_code=404, detail="Not found")
    db.delete(doc)
    db.commit()
    return {"deleted": True}
`

- [ ] **Step 3: Match document to requirement endpoint**
`python
@app.put("/api/bidder-documents/{doc_id}/match-requirement", response_model=TenderBidderDocumentOut)
def match_bidder_doc_requirement(doc_id: int, payload: TenderBidderDocumentUpdate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    doc = db.query(TenderBidderDocument).filter(TenderBidderDocument.id == doc_id).first()
    if not doc:
        raise HTTPException(status_code=404, detail="Not found")
    for k, v in payload.dict(exclude_unset=True).items():
        setattr(doc, k, v)
    doc.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(doc)
    return doc
`

- [ ] **Step 4: Verify imports include UploadFile, File, List if needed**
Ensure rom fastapi import UploadFile, File and List from typing are available (they exist in file)

- [ ] **Step 5: Quick import check**
Run: cd mini-services/tender-api && python -c "import main; print('ok')" 2>&1 | tail -2
Expected: ok
### Task 5: Backend - AI Module Extensions (extract, evaluate docs, evaluate top bidder)

**Files:**
- Modify: mini-services/tender-api/ai_module.py

**Interfaces:**
- Consumes: z_ai_chat, z_ai_vision, subprocess pattern, existing AI functions
- Produces: extract_required_documents, evaluate_bidder_documents, evaluate_top_bidder functions

- [ ] **Step 1: Add extract_required_documents function**
`python
def extract_required_documents(tender_id: int, reference_doc_path: str = None) -> Dict[str, Any]:
    try:
        from database import SessionLocal, Tender, TenderDocument, TenderRequiredDocument
        db = SessionLocal()
        tender = db.query(Tender).filter(Tender.id == tender_id).first()
        if not tender:
            db.close()
            return {"success": False, "error": "Tender not found", "requirements": []}
        context_parts = []
        if tender.description:
            context_parts.append(f"Tender Description:\n{tender.description}")
        if tender.scope_of_work:
            context_parts.append(f"Scope of Work:\n{tender.scope_of_work}")
        if tender.title:
            context_parts.append(f"Title: {tender.title}")
        if tender.client_company:
            context_parts.append(f"Client: {tender.client_company}")
        # Include primary tender docs content if available
        docs = db.query(TenderDocument).filter(TenderDocument.tender_id == tender_id).all()
        for d in docs[:2]:  # limit
            context_parts.append(f"Document: {d.original_filename}")
        context = "\n\n".join(context_parts)
        ref_note = ""
        if reference_doc_path and os.path.exists(reference_doc_path):
            ref_note = f"\nReference requirements doc provided at: {reference_doc_path}"
        system_prompt = """You are an expert tender procurement analyst. Extract ALL required qualification/compliance documents from tender information.
Return ONLY valid JSON with this exact schema:
{
  "requirements": [
    {
      "name": "Tax Clearance Certificate",
      "category": "SARS",
      "description": "Valid tax clearance certificate",
      "is_mandatory": true,
      "reference_source": "extracted_from_tender"
    }
  ]
}
Be comprehensive - include all mandatory and important supporting docs. Use standard names. Categories: CIPC, SARS, B-BBEE, PSIRA, COIDA, CIDB, UIF, Workmen's Comp, Insurance, Company Profile, Financials, Experience, References, Other."""
        user_prompt = f"{context}{ref_note}\n\nExtract required qualification documents."
        result = z_ai_chat(system_prompt, user_prompt, model="gpt-4o-mini")
        try:
            parsed = json.loads(result)
            if "requirements" not in parsed:
                parsed = {"requirements": []}
            db.close()
            return {"success": True, "requirements": parsed["requirements"]}
        except Exception as e:
            db.close()
            return {"success": False, "error": str(e), "raw": result, "requirements": []}
    except Exception as e:
        return {"success": False, "error": str(e), "requirements": []}
`

- [ ] **Step 2: Add evaluate_bidder_documents function**
`python
def evaluate_bidder_documents(bidder_id: int) -> Dict[str, Any]:
    try:
        from database import SessionLocal, TenderBidder, TenderBidderDocument, TenderRequiredDocument
        from datetime import date
        db = SessionLocal()
        bidder = db.query(TenderBidder).filter(TenderBidder.id == bidder_id).first()
        if not bidder:
            db.close()
            return {"success": False, "error": "Bidder not found"}
        docs = db.query(TenderBidderDocument).filter(TenderBidderDocument.bidder_id == bidder_id).all()
        reqs = db.query(TenderRequiredDocument).filter(TenderRequiredDocument.tender_id == bidder.tender_id).all()
        doc_list = []
        for d in docs:
            doc_list.append({
                "id": d.id,
                "req_name": d.requirement_name,
                "filename": d.original_filename,
                "has_file": bool(d.file_path),
                "issue_date": str(d.issue_date) if d.issue_date else None,
                "expiry_date": str(d.expiry_date) if d.expiry_date else None,
            })
        req_list = [{"name": r.name, "category": r.category, "mandatory": r.is_mandatory} for r in reqs]
        system_prompt = """You are a compliance officer evaluating tender bidder documents.
Check each document for: compliance with requirement, certification validity, expiry dates, completeness.
Return ONLY valid JSON:
{
  "overall_compliant": true,
  "compliance_score": 85,
  "document_results": [
    {
      "doc_id": 1,
      "status": "compliant|non_compliant|expired|missing|under_review",
      "is_certified": true,
      "compliance_notes": "Valid cert, not expired",
      "ai_check_result": {"details": "..."}
    }
  ],
  "summary": "Overall assessment"
}"""
        user_prompt = f"Bidder: {bidder.company_name}\nRequired: {json.dumps(req_list)}\nSubmitted: {json.dumps(doc_list)}\nToday: {date.today().isoformat()}"
        result = z_ai_chat(system_prompt, user_prompt, model="gpt-4o-mini")
        try:
            parsed = json.loads(result)
            # Update docs
            if "document_results" in parsed:
                for dr in parsed["document_results"]:
                    d = db.query(TenderBidderDocument).filter(TenderBidderDocument.id == dr.get("doc_id")).first()
                    if d:
                        d.status = dr.get("status", d.status)
                        d.is_certified = dr.get("is_certified", d.is_certified)
                        d.compliance_notes = dr.get("compliance_notes", d.compliance_notes)
                        d.ai_checked = True
                        d.ai_check_result = dr.get("ai_check_result")
            bidder.is_compliant = parsed.get("overall_compliant")
            bidder.compliance_score = parsed.get("compliance_score")
            bidder.evaluation_status = "evaluated"
            bidder.evaluation_summary = parsed.get("summary")
            db.commit()
            db.close()
            return {"success": True, **parsed}
        except Exception as e:
            db.close()
            return {"success": False, "error": str(e), "raw": result}
    except Exception as e:
        return {"success": False, "error": str(e)}
`

- [ ] **Step 3: Add evaluate_top_bidder function**
`python
def evaluate_top_bidder(tender_id: int) -> Dict[str, Any]:
    try:
        from database import SessionLocal, Tender, TenderBidder, TenderRequiredDocument
        db = SessionLocal()
        tender = db.query(Tender).filter(Tender.id == tender_id).first()
        if not tender:
            db.close()
            return {"success": False, "error": "Tender not found"}
        bidders = db.query(TenderBidder).filter(TenderBidder.tender_id == tender_id).all()
        bidder_data = []
        for b in bidders:
            bidder_data.append({
                "id": b.id,
                "company": b.company_name,
                "bid_amount": b.bid_amount,
                "compliance_score": b.compliance_score,
                "is_compliant": b.is_compliant,
                "overall_score": b.overall_score,
                "evaluation_summary": b.evaluation_summary,
            })
        system_prompt = """You are an expert bid evaluator. Determine the best/top bidder based on tender requirements.
Be fully AI-driven in your assessment - consider price, compliance, capability from available info.
Return ONLY valid JSON:
{
  "ranked_bidders": [
    {"bidder_id": 1, "rank": 1, "overall_score": 95, "reasoning": "..."}
  ],
  "top_bidder_id": 1,
  "reasoning": "Overall justification for top bidder selection",
  "confidence": 0.9,
  "ties": false
}"""
        user_prompt = f"Tender: {tender.title}\nClient: {tender.client_company}\nBidders: {json.dumps(bidder_data)}"
        result = z_ai_chat(system_prompt, user_prompt, model="gpt-4o-mini")
        try:
            parsed = json.loads(result)
            # Update bidders
            top_id = parsed.get("top_bidder_id")
            for b in bidders:
                b.is_top_bidder = (b.id == top_id)
                b.rank = None
                b.evaluation_status = "evaluated"
            for rb in parsed.get("ranked_bidders", []):
                for b in bidders:
                    if b.id == rb.get("bidder_id"):
                        b.rank = rb.get("rank")
                        b.overall_score = rb.get("overall_score")
                        if rb.get("reasoning"):
                            b.evaluation_summary = rb.get("reasoning")
            db.commit()
            db.close()
            return {"success": True, **parsed}
        except Exception as e:
            db.close()
            return {"success": False, "error": str(e), "raw": result}
    except Exception as e:
        return {"success": False, "error": str(e)}
`

- [ ] **Step 4: Test AI module imports**
Run: cd mini-services/tender-api && python -c "
from ai_module import extract_required_documents, evaluate_bidder_documents, evaluate_top_bidder
print('ok')
" 2>&1 | tail -10
Expected: ok (functions defined)
### Task 6: Backend - API Endpoints for AI Evaluation & Required Doc Extraction

**Files:**
- Modify: mini-services/tender-api/main.py

**Interfaces:**
- Consumes: ai_module functions (extract_required_documents, evaluate_bidder_documents, evaluate_top_bidder), models
- Produces: AI-powered endpoints for extraction and evaluation

- [ ] **Step 1: Extract required docs from tender**
`python
@app.post("/api/tenders/{tender_id}/required-documents/extract-from-tender")
def extract_required_from_tender(tender_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    from ai_module import extract_required_documents
    res = extract_required_documents(tender_id)
    if not res.get("success"):
        raise HTTPException(status_code=500, detail=res.get("error") or "Extraction failed")
    # Save requirements
    for i, r in enumerate(res.get("requirements", [])):
        item = TenderRequiredDocument(
            tender_id=tender_id,
            name=r.get("name"),
            category=r.get("category"),
            description=r.get("description"),
            is_mandatory=r.get("is_mandatory", True),
            reference_source="extracted_from_tender",
            order_index=i,
        )
        db.add(item)
    db.commit()
    items = db.query(TenderRequiredDocument).filter(TenderRequiredDocument.tender_id == tender_id).all()
    return {"extracted": len(items), "requirements": items}
`

- [ ] **Step 2: From reference doc upload**
`python
@app.post("/api/tenders/{tender_id}/required-documents/from-reference")
async def required_from_reference(tender_id: int, file: UploadFile = File(...), db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    from ai_module import extract_required_documents
    tender_dir = os.path.join(UPLOAD_DIR, "tenders", str(tender_id))
    os.makedirs(tender_dir, exist_ok=True)
    ext = os.path.splitext(file.filename)[1]
    unique = f"{uuid.uuid4().hex}{ext}"
    fpath = os.path.join(tender_dir, unique)
    content = await file.read()
    with open(fpath, "wb") as fh:
        fh.write(content)
    rel = os.path.join("tenders", str(tender_id), unique)
    res = extract_required_documents(tender_id, reference_doc_path=fpath)
    if not res.get("success"):
        raise HTTPException(status_code=500, detail=res.get("error") or "Extraction failed")
    for i, r in enumerate(res.get("requirements", [])):
        item = TenderRequiredDocument(
            tender_id=tender_id,
            name=r.get("name"),
            category=r.get("category"),
            description=r.get("description"),
            is_mandatory=r.get("is_mandatory", True),
            reference_source="uploaded_ref_doc",
            source_file_path=rel,
            order_index=i,
        )
        db.add(item)
    db.commit()
    items = db.query(TenderRequiredDocument).filter(TenderRequiredDocument.tender_id == tender_id).all()
    return {"extracted": len(items), "requirements": items}
`

- [ ] **Step 3: Evaluate documents for all bidders**
`python
@app.post("/api/tenders/{tender_id}/bidders/evaluate-documents")
def evaluate_all_documents(tender_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    from ai_module import evaluate_bidder_documents
    bidders = db.query(TenderBidder).filter(TenderBidder.tender_id == tender_id).all()
    results = []
    for b in bidders:
        b.evaluation_status = "evaluating"
    db.commit()
    for b in bidders:
        r = evaluate_bidder_documents(b.id)
        results.append({"bidder_id": b.id, "result": r})
    return {"bidders_evaluated": len(results), "results": results}
`

- [ ] **Step 4: Evaluate single bidder**
`python
@app.post("/api/bidders/{bidder_id}/evaluate")
def evaluate_single_bidder(bidder_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    from ai_module import evaluate_bidder_documents
    b = db.query(TenderBidder).filter(TenderBidder.id == bidder_id).first()
    if not b:
        raise HTTPException(status_code=404, detail="Bidder not found")
    b.evaluation_status = "evaluating"
    db.commit()
    r = evaluate_bidder_documents(bidder_id)
    return r
`

- [ ] **Step 5: Full evaluation to find top bidder**
`python
@app.post("/api/tenders/{tender_id}/bidders/evaluate")
def evaluate_top_bidder_endpoint(tender_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    from ai_module import evaluate_top_bidder
    # Create evaluation record
    ev = TenderEvaluation(tender_id=tender_id, evaluation_type="top_bidder", status="running")
    db.add(ev)
    db.commit()
    res = evaluate_top_bidder(tender_id)
    ev.status = "completed" if res.get("success") else "failed"
    ev.result = res
    ev.reasoning = res.get("reasoning")
    ev.top_bidder_id = res.get("top_bidder_id")
    ev.completed_at = datetime.utcnow()
    db.commit()
    return res
`

- [ ] **Step 6: Set top bidder manually, mark awarded**
`python
@app.post("/api/tenders/{tender_id}/bidders/set-top-bidder")
def set_top_bidder(tender_id: int, bidder_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    bidders = db.query(TenderBidder).filter(TenderBidder.tender_id == tender_id).all()
    for b in bidders:
        b.is_top_bidder = (b.id == bidder_id)
    db.commit()
    return {"ok": True, "top_bidder_id": bidder_id}

@app.post("/api/bidders/{bidder_id}/mark-awarded")
def mark_awarded(bidder_id: int, awarded: bool = True, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    b = db.query(TenderBidder).filter(TenderBidder.id == bidder_id).first()
    if not b:
        raise HTTPException(status_code=404, detail="Not found")
    b.awarded = awarded
    db.commit()
    return {"ok": True, "awarded": awarded}
`

- [ ] **Step 7: Analytics endpoint**
`python
@app.get("/api/analytics/tenders-summary")
def tenders_summary(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    total_tenders = db.query(Tender).count()
    active_tenders = db.query(Tender).filter(Tender.status.notin_(["Awarded", "Unsuccessful", "Cancelled", "Withdrawn", "Expired"])).count()
    successful_tenders = db.query(Tender).join(TenderBidder).filter(TenderBidder.awarded == True).distinct().count()
    # Or simpler: count tenders that have awarded bidder
    total_applications = db.query(TenderBidder).count()
    total_awarded_amount = db.query(func.sum(TenderBidder.bid_amount)).filter(TenderBidder.awarded == True).scalar() or 0
    return {
        "total_tenders": total_tenders,
        "active_tenders": active_tenders,
        "successful_tenders": successful_tenders,
        "total_applications_received": total_applications,
        "total_awarded_amount": total_awarded_amount,
    }
`
Note: need unc from sqlalchemy - add import if needed: rom sqlalchemy import func

- [ ] **Step 8: Add func import if missing**
Check - at top of main.py we have rom sqlalchemy.orm import Session. Add unc to sqlalchemy import: rom sqlalchemy import create_engine, Column, Integer, String, Text, Boolean, DateTime, Date, Time, Float, JSON, ForeignKey, func

- [ ] **Step 9: Test API imports**
Run: cd mini-services/tender-api && python -c "import main; print('ok')" 2>&1 | tail -3
Expected: ok
### Task 7: Frontend - Add API Client Methods

**Files:**
- Modify: src/lib/api.ts

**Interfaces:**
- Consumes: existing request() helper, api object
- Produces: API methods for bidders, required docs, evaluation, analytics

- [ ] **Step 1: Add Required Documents API methods**
After deleteBriefingCertificate or in appropriate section, add:
`	ypescript
  // ---- Required Documents ----
  async listRequiredDocuments(tenderId: number) {
    return request<any[]>(/tenders//required-documents);
  },
  async createRequiredDocument(tenderId: number, payload: any) {
    return request<any>(/tenders//required-documents, { method: "POST", body: payload });
  },
  async updateRequiredDocument(reqId: number, payload: any) {
    return request<any>(/required-documents/, { method: "PUT", body: payload });
  },
  async deleteRequiredDocument(reqId: number) {
    return request<{ deleted: boolean }>(/required-documents/, { method: "DELETE" });
  },
  async extractRequiredFromTender(tenderId: number) {
    return request<any>(/tenders//required-documents/extract-from-tender, { method: "POST" });
  },
  async requiredFromReference(tenderId: number, file: File) {
    const form = new FormData();
    form.append("file", file);
    return request<any>(/tenders//required-documents/from-reference, { method: "POST", body: form, isForm: true });
  },
`

- [ ] **Step 2: Add Bidders API methods**
`	ypescript
  // ---- Bidders ----
  async listBidders(tenderId: number) {
    return request<any[]>(/tenders//bidders);
  },
  async createBidder(tenderId: number, payload: any) {
    return request<any>(/tenders//bidders, { method: "POST", body: payload });
  },
  async getBidder(bidderId: number) {
    return request<any>(/bidders/);
  },
  async updateBidder(bidderId: number, payload: any) {
    return request<any>(/bidders/, { method: "PUT", body: payload });
  },
  async deleteBidder(bidderId: number) {
    return request<{ deleted: boolean }>(/bidders/, { method: "DELETE" });
  },
  async uploadBidderDocuments(bidderId: number, files: File[]) {
    const form = new FormData();
    files.forEach((f) => form.append("files", f));
    return request<any>(/bidders//documents, { method: "POST", body: form, isForm: true });
  },
  async deleteBidderDocument(docId: number) {
    return request<{ deleted: boolean }>(/bidder-documents/, { method: "DELETE" });
  },
  async matchBidderDocRequirement(docId: number, payload: any) {
    return request<any>(/bidder-documents//match-requirement, { method: "PUT", body: payload });
  },
`

- [ ] **Step 3: Add Evaluation API methods**
`	ypescript
  // ---- Bidder Evaluation ----
  async evaluateAllBidderDocuments(tenderId: number) {
    return request<any>(/tenders//bidders/evaluate-documents, { method: "POST" });
  },
  async evaluateSingleBidder(bidderId: number) {
    return request<any>(/bidders//evaluate, { method: "POST" });
  },
  async evaluateTopBidder(tenderId: number) {
    return request<any>(/tenders//bidders/evaluate, { method: "POST" });
  },
  async setTopBidder(tenderId: number, bidderId: number) {
    return request<any>(/tenders//bidders/set-top-bidder?bidder_id=, { method: "POST" });
  },
  async markBidderAwarded(bidderId: number, awarded = true) {
    return request<any>(/bidders//mark-awarded?awarded=, { method: "POST" });
  },
`

- [ ] **Step 4: Add Analytics method**
`	ypescript
  // ---- Analytics ----
  async tendersSummary() {
    return request<any>(/analytics/tenders-summary);
  },
`

- [ ] **Step 5: Type-check API file**
Run: cd "C:\Users\Surf\Documents\TM flow" && npx tsc --noEmit 2>&1 | tail -30
Expected: no new errors in api.ts (may have pre-existing unrelated errors)
### Task 8: Frontend - Add Bidders Tab to Navigation

**Files:**
- Modify: src/components/dashboard/dashboard-shell.tsx

**Interfaces:**
- Consumes: NAV_ITEMS array, Users icon from lucide-react
- Produces: Updated navigation with Bidders item

- [ ] **Step 1: Import Users icon**
Add Users to lucide-react imports (if not present). Check existing imports; add Users to the import list from lucide-react.

- [ ] **Step 2: Add Bidders nav item**
In NAV_ITEMS array, add after submissions or in logical position (suggest after "Submissions" or before "Assistant"):
`	ypescript
  { id: "bidders", label: "Bidders", icon: Users, description: "Bidder responses & evaluation" },
`
Note: "bidders" needs to be added to DashboardTab type in dashboard-store.ts? Check - DashboardTab is a union type. Need to update it.

- [ ] **Step 3: Update DashboardTab type in dashboard-store.ts**
**Files:** Modify src/lib/dashboard-store.ts
Add "bidders" to DashboardTab union type:
`	ypescript
export type DashboardTab =
  | "dashboard"
  | "tenders"
  | "preparation"
  | "discover"
  | "reader"
  | "library"
  | "company"
  | "deadlines"
  | "briefings"
  | "pricing"
  | "submissions"
  | "bidders"
  | "clarifications"
  | "addendums"
  | "assistant";
`

- [ ] **Step 4: Import and wire BiddersTab in dashboard-shell.tsx**
Import BiddersTab component (will create next) and add case in render:
`	ypescript
import { BiddersTab } from "./tabs/bidders-tab";
// ...
      case "bidders":
        return <BiddersTab />;
`

- [ ] **Step 5: Lint check**
Run: cd "C:\Users\Surf\Documents\TM flow" && npx eslint src/components/dashboard/dashboard-shell.tsx src/lib/dashboard-store.ts 2>&1 | tail -15
Expected: no new errors
### Task 9: Frontend - Create Bidders Tab Component

**Files:**
- Create: src/components/dashboard/tabs/bidders-tab.tsx

**Interfaces:**
- Consumes: api methods (listBidders, createBidder, uploadBidderDocuments, evaluateAllBidderDocuments, evaluateTopBidder, setTopBidder, markBidderAwarded, extractRequiredFromTender, requiredFromReference, createRequiredDocument, deleteRequiredDocument, deleteBidder, deleteBidderDocument), dashboard store (useDashboardStore, formatCurrency, formatDate), shadcn/ui components, lucide-react icons
- Produces: Full-featured bidders management UI matching existing patterns

- [ ] **Step 1: Create basic component structure with imports and types**
Follow pattern from submissions-tab.tsx. Import needed components: Card, Button, Badge, Dialog, Input, Label, Textarea, Select, Alert, Skeleton, Tabs, etc. Icons: Users, Trophy, FileCheck, AlertTriangle, Upload, Sparkles, Trash2, Plus, Download, etc. Define types for Bidder, RequiredDoc, BidderDoc.

- [ ] **Step 2: Implement state management**
State: tenders[], selectedTenderId, bidders[], requiredDocs[], loading, evaluating, showAddBidder, showAddReq, uploadFiles, activeSection (tabs)

- [ ] **Step 3: Data fetching logic**
fetchTenders, fetchBidders, fetchRequiredDocs. useEffect on selectedTenderId to load related data.

- [ ] **Step 4: Build header with stats cards**
Stats: Total Bidders, Compliant, Non-Compliant, Pending Eval, Top Bidder Identified. Use StatCard pattern with tinted icons.

- [ ] **Step 5: Build tender selector**
Select dropdown to choose tender context.

- [ ] **Step 6: Build Required Documents section**
Panel with actions: Extract from Tender (AI), Upload Reference Doc (AI), Add Manual. List requirements with badges (mandatory), edit/delete.

- [ ] **Step 7: Build Bidders section**
List bidder cards: company, rank badge (#1), Top Bidder (emerald), compliance score, bid amount, status badges. Actions: Upload Docs, Evaluate, Set Top Bidder, Mark Awarded, Delete.

- [ ] **Step 8: Build Add Bidder dialog**
Form with company name (required), contact fields, bid amount, submitted_at, notes.

- [ ] **Step 9: Build AI evaluation UI**
"Find Top Bidder (AI)" button, evaluate documents button, show reasoning in dialog/card with evaluation summary.

- [ ] **Step 10: Build bidder documents management**
For each bidder, expandable section showing uploaded docs mapped to requirements, compliance status chips (Compliant emerald, Expired rose, Missing amber, Non-compliant rose).

- [ ] **Step 11: Add loading states, empty states, error handling**
Follow existing EmptyState pattern with Users icon, skeletons matching layout, Alert for errors with retry.

- [ ] **Step 12: Full implementation - write complete component (~900-1100 lines) following exact styling**
Use emerald theme throughout, Card hover shadow-md, scrollbar-thin, toast feedback. Match existing tab structure.

- [ ] **Step 13: Type-check and lint**
Run: cd "C:\Users\Surf\Documents\TM flow" && npx tsc --noEmit 2>&1 | tail -40
Run: cd "C:\Users\Surf\Documents\TM flow" && npx eslint src/components/dashboard/tabs/bidders-tab.tsx 2>&1 | tail -20
Expected: no errors in new file
### Task 10: Backend - Ensure Table Creation & Initialize DB

**Files:**
- None to modify (init_db already creates all tables via Base.metadata.create_all)

**Interfaces:**
- Consumes: init_db in database.py
- Produces: Verified DB schema

- [ ] **Step 1: Test DB initialization with new models**
Run: cd mini-services/tender-api && python -c "
from database import init_db, engine, Base
# Check tables
from sqlalchemy import inspect
init_db()
inspector = inspect(engine)
tables = inspector.get_table_names()
# Check for our new tables
new = ['tender_bidders', 'tender_bidder_documents', 'tender_required_documents', 'tender_evaluations']
for t in new:
    print(t in tables)
" 2>&1 | tail -30
Expected: True, True, True, True

- [ ] **Step 2: Verify no import or schema errors**
Run: cd mini-services/tender-api && python -m py_compile main.py database.py ai_module.py && echo 'ok' 2>&1 | tail -2
Expected: ok
### Task 11: Integration Testing & Verification

**Files:**
- Test via API and UI

**Interfaces:**
- Consumes: All implemented components
- Produces: Verified working implementation

- [ ] **Step 1: Start backend and verify it loads**
Run backend: cd mini-services/tender-api && python -m uvicorn main:app --host 127.0.0.1 --port 8000 2>&1 & (background) then test: curl/docs or import check. Or just verify no startup errors.

- [ ] **Step 2: Lint all modified/created files**
Run: cd "C:\Users\Surf\Documents\TM flow" && npx eslint src/components/dashboard/tabs/bidders-tab.tsx src/components/dashboard/dashboard-shell.tsx src/lib/dashboard-store.ts src/lib/api.ts 2>&1 | tail -25
Expected: no errors

- [ ] **Step 3: TypeScript compilation check**
Run: cd "C:\Users\Surf\Documents\TM flow" && npx tsc --noEmit 2>&1 | grep -v "examples\|skills" | tail -30
Expected: no new type errors

- [ ] **Step 4: Quick smoke test - API endpoints exist**
Start Python shell and check routes exist or just verify app imports cleanly.

- [ ] **Step 5: Verify Bidders tab renders without errors (build check)**
Run: cd "C:\Users\Surf\Documents\TM flow" && npx next build --no-lint 2>&1 | tail -40
Expected: build succeeds or only pre-existing warnings

- [ ] **Step 6: Commit all changes**
`ash
git add mini-services/tender-api/database.py mini-services/tender-api/main.py mini-services/tender-api/ai_module.py src/lib/api.ts src/lib/dashboard-store.ts src/components/dashboard/dashboard-shell.tsx src/components/dashboard/tabs/bidders-tab.tsx docs/superpowers/plans/2026-10-02-tender-bidder-evaluation.md
git commit -m "feat: add tender bidder evaluation and tracking (models, API, AI, UI)"
`

---
