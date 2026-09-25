"""
TenderFlow - Database Models & SQLAlchemy Setup
"""
import os
from datetime import datetime, date
from typing import List, Optional

from sqlalchemy import (
    create_engine, Column, Integer, String, Text, DateTime, Date, Time,
    Boolean, Float, ForeignKey, JSON, Enum as SAEnum, event
)
from sqlalchemy.orm import declarative_base, relationship, sessionmaker
from sqlalchemy.engine import Engine

# SQLite database path
DB_PATH = os.path.join(os.path.dirname(__file__), "tender.db")
DB_URL = f"sqlite:///{DB_PATH}"

# Enable foreign key constraints for SQLite
@event.listens_for(Engine, "connect")
def set_sqlite_pragma(dbapi_connection, connection_record):
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
    hashed_password = Column(String(255), nullable=False)
    role = Column(String(50), default="admin")  # admin / user
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



def init_db():
    Base.metadata.create_all(bind=engine)
    # Seed default reminder settings
    db = SessionLocal()
    try:
        if db.query(ReminderSetting).count() == 0:
            for d in [30, 14, 7, 3, 1]:
                db.add(ReminderSetting(days_before=d, enabled=True))
            db.commit()
    finally:
        db.close()


if __name__ == "__main__":
    init_db()
    print("Database initialized at", DB_PATH)
