"""
TM Flow - tenancy helpers.

Pure logic only: no FastAPI imports, so every function here is directly
unit-testable without an app or a request.
"""
import uuid

from sqlalchemy import func, inspect, text
from sqlalchemy.orm import Session

from database import (
    CompanyProfile,
    LibraryDocument,
    Membership,
    Organisation,
    Tender,
    User,
)

LEGACY_ORG_NAME = "Legacy Workspace"

# Tables that existed before tenancy and therefore need org_id added to them.
# SQLAlchemy's create_all() only creates missing tables; it never ALTERs an
# existing one, so these columns must be added explicitly on upgrade.
_ORG_SCOPED_TABLES = ("tenders", "library_documents", "company_profile")


def generate_join_code() -> str:
    return uuid.uuid4().hex[:12]


def ensure_org_columns(db: Session) -> list:
    """Add org_id to pre-tenancy tables if it is missing. Idempotent.

    SQLite has no "ADD COLUMN IF NOT EXISTS", so this inspects the existing
    columns first and only issues ALTERs that are actually needed.
    """
    inspector = inspect(db.get_bind())
    existing_tables = set(inspector.get_table_names())
    added = []
    for table in _ORG_SCOPED_TABLES:
        if table not in existing_tables:
            continue
        columns = {c["name"] for c in inspector.get_columns(table)}
        if "org_id" in columns:
            continue
        db.execute(
            text(f"ALTER TABLE {table} ADD COLUMN org_id INTEGER")
        )
        db.execute(
            text(
                f"CREATE INDEX IF NOT EXISTS ix_{table}_org_id "
                f"ON {table} (org_id)"
            )
        )
        added.append(table)
    if added:
        db.commit()
    return added


def find_org_by_name(db: Session, name: str):
    return (
        db.query(Organisation)
        .filter(func.lower(Organisation.name) == name.strip().lower())
        .first()
    )


def ensure_legacy_org(db: Session) -> Organisation:
    """Backfill pre-tenancy data into a single bidder org. Idempotent."""
    ensure_org_columns(db)

    org = find_org_by_name(db, LEGACY_ORG_NAME)
    if org is None:
        org = Organisation(
            name=LEGACY_ORG_NAME,
            join_code=generate_join_code(),
            account_type="bidder",
        )
        db.add(org)
        db.flush()

    existing_member_ids = {
        row[0]
        for row in db.query(Membership.user_id)
        .filter(Membership.org_id == org.id)
        .all()
    }
    for user in db.query(User).all():
        if user.id not in existing_member_ids:
            db.add(Membership(user_id=user.id, org_id=org.id, role="owner"))

    for model in (Tender, LibraryDocument, CompanyProfile):
        db.query(model).filter(model.org_id.is_(None)).update(
            {model.org_id: org.id}, synchronize_session=False
        )

    db.commit()
    db.refresh(org)
    return org
