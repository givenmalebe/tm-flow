"""
TenderFlow - Database Models & SQLAlchemy Setup
"""
import os
import sqlite3
from datetime import datetime, date
from typing import List, Optional

from sqlalchemy import (
    create_engine, Column, Integer, String, Text, DateTime, Date, Time,
    Boolean, Float, ForeignKey, JSON, Enum as SAEnum, event
)
from sqlalchemy.orm import declarative_base, relationship, sessionmaker
from sqlalchemy.engine import Engine

# SQLite database path. DATA_DIR points at the mounted volume on Cloud Run;
# locally the file sits beside this module.
DATA_DIR = os.environ.get("DATA_DIR", os.path.dirname(__file__))
os.makedirs(DATA_DIR, exist_ok=True)
DB_PATH = os.environ.get("DB_PATH", os.path.join(DATA_DIR, "tender.db"))
DB_URL = f"sqlite:///{DB_PATH}"

# Enable foreign key constraints for SQLite.
#
# This listener is attached to the Engine *class*, so it also fires for the
# Postgres engine used to reach the Data Connect tables. PRAGMA is SQLite-only
# and raises a syntax error there, so guard on the DBAPI connection type.
@event.listens_for(Engine, "connect")
def set_sqlite_pragma(dbapi_connection, connection_record):
    if not isinstance(dbapi_connection, sqlite3.Connection):
        return
    cursor = dbapi_connection.cursor()
    cursor.execute("PRAGMA foreign_keys=ON")
    cursor.close()


engine = create_engine(DB_URL, connect_args={"check_same_thread": False}, echo=False)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


# ---------------------- Models ----------------------

class User(Base):
    __tablename__ = "users"
    id = Column(Integer, primary_key=True, index=True)
    email = Column(String(255), unique=True, nullable=False, index=True)
    full_name = Column(String(255), nullable=False)
    company_name = Column(String(255), nullable=True)
    # Firebase Auth owns credentials, so this is never populated for new
    # accounts. Kept NOT NULL-compatible by storing an empty string; rows
    # created before the migration keep their real bcrypt hash.
    hashed_password = Column(String(255), nullable=False, default="")
    role = Column(String(50), default="admin")  # admin / user
    account_type = Column(String(50), default="applicant")  # applicant / issuer
    onboarding_completed = Column(Boolean, default=False)
    created_at = Column(DateTime, default=datetime.utcnow)


class Tender(Base):
    __tablename__ = "tenders"
    id = Column(Integer, primary_key=True, index=True)
    reference_number = Column(String(255), nullable=False, index=True)
    title = Column(String(500), nullable=False)
    client_company = Column(String(255), nullable=False)
    description = Column(Text, nullable=True)
    scope_of_work = Column(Text, nullable=True)
    category = Column(String(255), nullable=True)
    location_site = Column(String(500), nullable=True)
    issue_date = Column(Date, nullable=True)
    closing_date = Column(Date, nullable=True)
    closing_time = Column(Time, nullable=True)
    validity_period = Column(String(255), nullable=True)
    estimated_value = Column(Float, nullable=True)
    contract_period = Column(String(255), nullable=True)
    status = Column(String(100), default="New Opportunity", index=True)
    contact_person = Column(String(255), nullable=True)
    contact_email = Column(String(255), nullable=True)
    contact_telephone = Column(String(100), nullable=True)
    submission_method = Column(String(255), nullable=True)
    person_responsible = Column(String(255), nullable=True)
    notes = Column(Text, nullable=True)
    outcome = Column(String(100), nullable=True)  # Awarded / Unsuccessful / Pending / Withdrawn
    unsuccessful_reason = Column(Text, nullable=True)
    # Set when this tender was published by an issuer inside this system, which
    # lets the bidder submit their bid directly instead of exporting a bundle.
    issued_tender_id = Column(Integer, ForeignKey("issued_tenders.id"), nullable=True, index=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    created_by = Column(Integer, ForeignKey("users.id"), nullable=True)

    # AI extracted info (JSON)
    ai_extracted_info = Column(JSON, nullable=True)
    ai_summary = Column(Text, nullable=True)

    # Relationships
    documents = relationship("TenderDocument", back_populates="tender", cascade="all, delete-orphan")
    checklist_items = relationship("ChecklistItem", back_populates="tender", cascade="all, delete-orphan")
    briefings = relationship("Briefing", back_populates="tender", cascade="all, delete-orphan")
    pricing_versions = relationship("PricingVersion", back_populates="tender", cascade="all, delete-orphan")
    submission = relationship("Submission", back_populates="tender", uselist=False, cascade="all, delete-orphan")
    communications = relationship("Communication", back_populates="tender", cascade="all, delete-orphan")
    addendums = relationship("Addendum", back_populates="tender", cascade="all, delete-orphan")
    generated_documents = relationship("GeneratedDocument", back_populates="tender", cascade="all, delete-orphan")


class TenderDocument(Base):
    __tablename__ = "tender_documents"
    id = Column(Integer, primary_key=True, index=True)
    tender_id = Column(Integer, ForeignKey("tenders.id", ondelete="CASCADE"), nullable=False)
    filename = Column(String(500), nullable=False)
    original_filename = Column(String(500), nullable=False)
    file_path = Column(String(1000), nullable=False)
    file_type = Column(String(100), nullable=True)
    file_size = Column(Integer, nullable=True)
    uploaded_at = Column(DateTime, default=datetime.utcnow)
    is_primary = Column(Boolean, default=False)
    tender = relationship("Tender", back_populates="documents")


class ChecklistItem(Base):
    __tablename__ = "checklist_items"
    id = Column(Integer, primary_key=True, index=True)
    tender_id = Column(Integer, ForeignKey("tenders.id", ondelete="CASCADE"), nullable=False)
    name = Column(String(500), nullable=False)
    description = Column(Text, nullable=True)
    category = Column(String(100), nullable=True)  # Compliance / Technical / Pricing / Forms / Personnel / Company / Methodology / References / Other
    mandatory = Column(Boolean, default=True)
    library_category = Column(String(100), nullable=True)  # matching library category for auto-linking
    status = Column(String(50), default="Outstanding")  # Complete / Outstanding / Expired / Not Applicable
    linked_library_doc_id = Column(Integer, ForeignKey("library_documents.id", ondelete="SET NULL"), nullable=True)
    notes = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    tender = relationship("Tender", back_populates="checklist_items")


class LibraryDocument(Base):
    __tablename__ = "library_documents"
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(500), nullable=False)
    category = Column(String(255), nullable=False, index=True)  # CIPC, SARS, B-BBEE, PSIRA, COIDA, etc.
    description = Column(Text, nullable=True)
    filename = Column(String(500), nullable=False)
    file_path = Column(String(1000), nullable=False)
    file_type = Column(String(100), nullable=True)
    file_size = Column(Integer, nullable=True)
    issue_date = Column(Date, nullable=True)
    expiry_date = Column(Date, nullable=True, index=True)
    uploaded_at = Column(DateTime, default=datetime.utcnow)
    notes = Column(Text, nullable=True)
    created_by = Column(Integer, ForeignKey("users.id"), nullable=True)


class Briefing(Base):
    __tablename__ = "briefings"
    id = Column(Integer, primary_key=True, index=True)
    tender_id = Column(Integer, ForeignKey("tenders.id", ondelete="CASCADE"), nullable=False)
    briefing_type = Column(String(100), default="Briefing")  # Briefing / Site Inspection
    date = Column(Date, nullable=False)
    time = Column(Time, nullable=True)
    location = Column(String(500), nullable=True)
    contact_person = Column(String(255), nullable=True)
    attendance_required = Column(Boolean, default=True)
    attendance_confirmed = Column(Boolean, default=False)
    person_attending = Column(String(255), nullable=True)
    certificate_path = Column(String(1000), nullable=True)
    notes = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    tender = relationship("Tender", back_populates="briefings")


class PricingVersion(Base):
    __tablename__ = "pricing_versions"
    id = Column(Integer, primary_key=True, index=True)
    tender_id = Column(Integer, ForeignKey("tenders.id", ondelete="CASCADE"), nullable=False)
    version_number = Column(Integer, nullable=False)
    version_label = Column(String(100), nullable=True)
    line_items = Column(JSON, nullable=True)  # list of {category, description, qty, rate, total}
    subtotal = Column(Float, default=0)
    vat = Column(Float, default=0)
    total = Column(Float, default=0)
    notes = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    tender = relationship("Tender", back_populates="pricing_versions")


class Submission(Base):
    __tablename__ = "submissions"
    id = Column(Integer, primary_key=True, index=True)
    tender_id = Column(Integer, ForeignKey("tenders.id", ondelete="CASCADE"), nullable=False, unique=True)
    submission_date = Column(Date, nullable=True)
    submission_time = Column(Time, nullable=True)
    submission_method = Column(String(255), nullable=True)
    submitted_by = Column(String(255), nullable=True)
    confirmation_reference = Column(String(255), nullable=True)
    confirmation_file_path = Column(String(1000), nullable=True)  # submission confirmation/receipt file
    final_documents_path = Column(String(1000), nullable=True)  # final submitted documents (PDF bundle)
    final_pricing = Column(Float, nullable=True)
    notes = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    tender = relationship("Tender", back_populates="submission")


class Communication(Base):
    __tablename__ = "communications"
    id = Column(Integer, primary_key=True, index=True)
    tender_id = Column(Integer, ForeignKey("tenders.id", ondelete="CASCADE"), nullable=False)
    comm_type = Column(String(100), nullable=False)  # Email / Clarification Request / Clarification Response / Meeting Invitation / Meeting Notes / Addendum / Extension / Tender Validity Extension / Pricing Clarification / Client Correspondence / Other
    subject = Column(String(500), nullable=True)
    body = Column(Text, nullable=True)
    comm_date = Column(DateTime, nullable=True)
    meeting_date = Column(DateTime, nullable=True)  # for meeting invitations/notes
    meeting_location = Column(String(500), nullable=True)  # for meetings
    from_party = Column(String(255), nullable=True)
    to_party = Column(String(255), nullable=True)
    attachment_path = Column(String(1000), nullable=True)
    attachment_original_filename = Column(String(500), nullable=True)
    notes = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    tender = relationship("Tender", back_populates="communications")


class Addendum(Base):
    __tablename__ = "addendums"
    id = Column(Integer, primary_key=True, index=True)
    tender_id = Column(Integer, ForeignKey("tenders.id", ondelete="CASCADE"), nullable=False)
    addendum_number = Column(String(50), nullable=True)
    title = Column(String(500), nullable=False)
    description = Column(Text, nullable=True)
    file_path = Column(String(1000), nullable=True)
    issued_date = Column(Date, nullable=True)
    ai_changes = Column(JSON, nullable=True)  # {new_requirements, removed, changed_dates, ...}
    created_at = Column(DateTime, default=datetime.utcnow)
    tender = relationship("Tender", back_populates="addendums")


class ReminderSetting(Base):
    __tablename__ = "reminder_settings"
    id = Column(Integer, primary_key=True, index=True)
    days_before = Column(Integer, nullable=False)  # 30, 14, 7, 3, 1
    enabled = Column(Boolean, default=True)


class CompanyProfile(Base):
    """Company branding/profile for generating tender documents on letterhead."""
    __tablename__ = "company_profile"
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    company_name = Column(String(500), nullable=False)
    registration_number = Column(String(100), nullable=True)  # CIPC registration
    vat_number = Column(String(50), nullable=True)
    psira_number = Column(String(50), nullable=True)
    bbbbee_level = Column(String(50), nullable=True)  # e.g. "Level 2"
    address = Column(Text, nullable=True)
    phone = Column(String(100), nullable=True)
    email = Column(String(255), nullable=True)
    website = Column(String(255), nullable=True)
    # Branding
    logo_path = Column(String(1000), nullable=True)  # path in uploads
    primary_color = Column(String(20), default="#0f766e")  # emerald-700
    font_family = Column(String(100), default="Arial, sans-serif")
    letterhead_tagline = Column(String(500), nullable=True)
    director_name = Column(String(255), nullable=True)  # for signatures
    director_title = Column(String(255), nullable=True)
    # Organogram
    organogram_path = Column(String(1000), nullable=True)  # uploaded organogram file
    organogram_text = Column(Text, nullable=True)  # AI-extracted text from the organogram
    # Signature
    signature_path = Column(String(1000), nullable=True)  # uploaded or drawn signature image
    # Letterhead
    letterhead_path = Column(String(1000), nullable=True)  # uploaded letterhead image/template
    # Company profile document
    company_profile_doc_path = Column(String(1000), nullable=True)  # uploaded company profile document
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class GeneratedDocument(Base):
    """AI-generated tender-specific documents (method statements, implementation plans, etc.)."""
    __tablename__ = "generated_documents"
    id = Column(Integer, primary_key=True, index=True)
    tender_id = Column(Integer, ForeignKey("tenders.id", ondelete="CASCADE"), nullable=False, index=True)
    doc_type = Column(String(100), nullable=False)  # method_statement, implementation_plan, technical_proposal, risk_assessment, sops, table_of_contents
    title = Column(String(500), nullable=False)
    content = Column(Text, nullable=False)  # the full generated document (markdown/text)
    table_of_contents = Column(Text, nullable=True)  # for documents with TOC
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    tender = relationship("Tender", back_populates="generated_documents")


# ============================================================
# ISSUER PORTAL MODELS — for tender-issuing organisations
# ============================================================

class IssuerCompany(Base):
    """A company that issues tenders (the buyer/procurement side). Multi-tenant root."""
    __tablename__ = "issuer_companies"
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(500), nullable=False, index=True)
    registration_number = Column(String(100), nullable=True)
    description = Column(Text, nullable=True)
    industry = Column(String(255), nullable=True)
    address = Column(Text, nullable=True)
    phone = Column(String(100), nullable=True)
    email = Column(String(255), nullable=True)
    website = Column(String(255), nullable=True)
    logo_path = Column(String(1000), nullable=True)
    primary_color = Column(String(20), default="#0f766e")
    created_at = Column(DateTime, default=datetime.utcnow)
    created_by = Column(Integer, ForeignKey("users.id"), nullable=True)
    members = relationship("CompanyMember", back_populates="company", cascade="all, delete-orphan")
    tenders = relationship("IssuedTender", back_populates="company", cascade="all, delete-orphan")


class CompanyMember(Base):
    """Users belonging to an issuer company (multi-tenant membership with approval)."""
    __tablename__ = "company_members"
    id = Column(Integer, primary_key=True, index=True)
    company_id = Column(Integer, ForeignKey("issuer_companies.id", ondelete="CASCADE"), nullable=False, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    role = Column(String(50), default="member")
    status = Column(String(50), default="pending")
    job_title = Column(String(255), nullable=True)
    joined_at = Column(DateTime, default=datetime.utcnow)
    approved_at = Column(DateTime, nullable=True)
    company = relationship("IssuerCompany", back_populates="members")


class IssuedTender(Base):
    """A tender published by an issuer company for bidding."""
    __tablename__ = "issued_tenders"
    id = Column(Integer, primary_key=True, index=True)
    company_id = Column(Integer, ForeignKey("issuer_companies.id", ondelete="CASCADE"), nullable=False, index=True)
    reference_number = Column(String(255), nullable=False)
    title = Column(String(500), nullable=False)
    description = Column(Text, nullable=True)
    scope_of_work = Column(Text, nullable=True)
    category = Column(String(255), nullable=True)
    location = Column(String(500), nullable=True)
    issue_date = Column(Date, nullable=True)
    closing_date = Column(Date, nullable=True)
    closing_time = Column(Time, nullable=True)
    budget = Column(Float, nullable=True)
    contract_period = Column(String(255), nullable=True)
    evaluation_criteria = Column(Text, nullable=True)
    submission_method = Column(String(500), nullable=True)
    contact_person = Column(String(255), nullable=True)
    contact_email = Column(String(255), nullable=True)
    contact_phone = Column(String(100), nullable=True)
    status = Column(String(50), default="Open", index=True)
    is_published = Column(Boolean, default=False, index=True)
    ai_generated_content = Column(Text, nullable=True)
    notes = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    created_by = Column(Integer, ForeignKey("users.id"), nullable=True)
    company = relationship("IssuerCompany", back_populates="tenders")
    bids = relationship("Bid", back_populates="tender", cascade="all, delete-orphan")


class Bid(Base):
    """A bid submitted by a bidder company for an issued tender."""
    __tablename__ = "bids"
    id = Column(Integer, primary_key=True, index=True)
    tender_id = Column(Integer, ForeignKey("issued_tenders.id", ondelete="CASCADE"), nullable=False, index=True)
    bidder_company_name = Column(String(500), nullable=False)
    bidder_email = Column(String(255), nullable=True)
    bidder_contact_person = Column(String(255), nullable=True)
    bidder_phone = Column(String(100), nullable=True)
    bidder_bbbee_level = Column(String(50), nullable=True)
    total_amount = Column(Float, nullable=False)
    proposal_summary = Column(Text, nullable=True)
    technical_score = Column(Float, nullable=True)
    financial_score = Column(Float, nullable=True)
    status = Column(String(50), default="Pending", index=True)
    submitted_at = Column(DateTime, default=datetime.utcnow)
    reviewed_at = Column(DateTime, nullable=True)
    reviewed_by = Column(Integer, ForeignKey("users.id"), nullable=True)
    notes = Column(Text, nullable=True)
    ai_review = Column(Text, nullable=True)
    ai_reviewed_at = Column(DateTime, nullable=True)
    tender = relationship("IssuedTender", back_populates="bids")
    documents = relationship("BidDocument", back_populates="bid", cascade="all, delete-orphan")


class BidDocument(Base):
    """Documents submitted as part of a bid."""
    __tablename__ = "bid_documents"
    id = Column(Integer, primary_key=True, index=True)
    bid_id = Column(Integer, ForeignKey("bids.id", ondelete="CASCADE"), nullable=False, index=True)
    doc_type = Column(String(255), nullable=True)
    filename = Column(String(500), nullable=False)
    original_filename = Column(String(500), nullable=False)
    file_path = Column(String(1000), nullable=False)
    file_type = Column(String(100), nullable=True)
    file_size = Column(Integer, nullable=True)
    uploaded_at = Column(DateTime, default=datetime.utcnow)
    bid = relationship("Bid", back_populates="documents")


# ============================================================
# BIDDER COMPANY MODELS — for applicant team management
# ============================================================

class BidderCompany(Base):
    """A company that bids on tenders (the applicant side). Multi-tenant root for bidders."""
    __tablename__ = "bidder_companies"
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(500), nullable=False, index=True)
    description = Column(Text, nullable=True)
    industry = Column(String(255), nullable=True)
    phone = Column(String(100), nullable=True)
    email = Column(String(255), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    created_by = Column(Integer, ForeignKey("users.id"), nullable=True)
    members = relationship("BidderMember", back_populates="company", cascade="all, delete-orphan")


class BidderMember(Base):
    """Users belonging to a bidder company (with admin approval workflow)."""
    __tablename__ = "bidder_members"
    id = Column(Integer, primary_key=True, index=True)
    company_id = Column(Integer, ForeignKey("bidder_companies.id", ondelete="CASCADE"), nullable=False, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    role = Column(String(50), default="member")  # admin / member
    status = Column(String(50), default="pending")  # pending / approved / rejected
    job_title = Column(String(255), nullable=True)
    joined_at = Column(DateTime, default=datetime.utcnow)
    approved_at = Column(DateTime, nullable=True)
    company = relationship("BidderCompany", back_populates="members")


# ============================================================
# AI AGENT MODELS — company-scoped chat, memory, research, opportunities
# ============================================================

class AIChatMessage(Base):
    """Persisted assistant chat, visible to the whole bidder company."""
    __tablename__ = "ai_chat_messages"
    id = Column(Integer, primary_key=True, index=True)
    company_id = Column(Integer, ForeignKey("bidder_companies.id"), nullable=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=True, index=True)
    role = Column(String(20), nullable=False)  # "user" | "assistant"
    content = Column(Text, nullable=False)
    error = Column(Boolean, default=False)
    context_tenders = Column(Integer, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, index=True)


class AICompanyMemory(Base):
    """One row per scope: success profile + cached briefing narrative."""
    __tablename__ = "ai_company_memory"
    id = Column(Integer, primary_key=True, index=True)
    company_id = Column(Integer, ForeignKey("bidder_companies.id"), nullable=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=True, index=True)
    mission = Column(Text, nullable=True)
    goals = Column(JSON, nullable=True)  # list of strings
    preferences = Column(Text, nullable=True)
    last_briefing_text = Column(Text, nullable=True)
    last_briefing_at = Column(DateTime, nullable=True)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class AIResearchRun(Base):
    """Audit trail for research runs; the Phase 2 scheduler reuses this."""
    __tablename__ = "ai_research_runs"
    id = Column(Integer, primary_key=True, index=True)
    company_id = Column(Integer, ForeignKey("bidder_companies.id"), nullable=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=True, index=True)
    query = Column(Text, nullable=True)
    status = Column(String(20), default="running")  # running | complete | failed
    tenders_found = Column(Integer, default=0)
    funding_found = Column(Integer, default=0)
    finance_found = Column(Integer, default=0)
    error = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    finished_at = Column(DateTime, nullable=True)


class AIOpportunity(Base):
    """A researched tender / funding programme / finance option, per scope."""
    __tablename__ = "ai_opportunities"
    id = Column(Integer, primary_key=True, index=True)
    company_id = Column(Integer, ForeignKey("bidder_companies.id"), nullable=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=True, index=True)
    run_id = Column(Integer, ForeignKey("ai_research_runs.id"), nullable=True)
    type = Column(String(20), nullable=False)  # tender | funding | finance
    title = Column(String(500), nullable=False)
    provider = Column(String(500), nullable=True)
    category = Column(String(255), nullable=True)
    location = Column(String(255), nullable=True)
    closing_date = Column(Date, nullable=True)
    description = Column(Text, nullable=True)
    url = Column(String(1000), nullable=True)
    source_site = Column(String(255), nullable=True)
    reference_number = Column(String(255), nullable=True)
    estimated_value = Column(String(255), nullable=True)
    match_score = Column(Integer, nullable=True)
    match_reason = Column(Text, nullable=True)
    status = Column(String(20), default="new", index=True)  # new | seen | imported | dismissed
    imported_tender_id = Column(Integer, ForeignKey("tenders.id"), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    run = relationship("AIResearchRun")


def _sanitize_login_wall_urls(db) -> None:
    """Null out AI-opportunity links that point at members-only login walls.

    Earlier versions stored security.co.za detail URLs, which always redirect
    to a sign-in page. They can never resolve, so drop them on startup.
    """
    try:
        from scraper import public_url_or_none

        rows = db.query(AIOpportunity).filter(AIOpportunity.url.isnot(None)).all()
        changed = False
        for o in rows:
            safe = public_url_or_none(o.url)
            if safe != o.url:
                o.url = safe
                changed = True
        if changed:
            db.commit()
    except Exception:
        db.rollback()


def _ensure_tender_issued_link() -> None:
    """Add tenders.issued_tender_id to databases created before it existed.

    create_all() never alters existing tables, so the column is added here.
    Safe to run repeatedly: it is a no-op once the column is present.
    """
    try:
        from sqlalchemy import inspect, text

        inspector = inspect(engine)
        if "tenders" not in inspector.get_table_names():
            return
        columns = {c["name"] for c in inspector.get_columns("tenders")}
        if "issued_tender_id" in columns:
            return
        with engine.begin() as conn:
            conn.execute(text("ALTER TABLE tenders ADD COLUMN issued_tender_id INTEGER"))
    except Exception:
        pass


def init_db():
    Base.metadata.create_all(bind=engine)
    _ensure_tender_issued_link()
    # Seed default reminder settings
    db = SessionLocal()
    try:
        if db.query(ReminderSetting).count() == 0:
            for d in [30, 14, 7, 3, 1]:
                db.add(ReminderSetting(days_before=d, enabled=True))
            db.commit()
        _sanitize_login_wall_urls(db)
    finally:
        db.close()


if __name__ == "__main__":
    init_db()
    print("Database initialized at", DB_PATH)
