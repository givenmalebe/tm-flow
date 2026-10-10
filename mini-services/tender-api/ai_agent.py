"""
TM Flow - AI agent module.

The company-scoped AI brain: resolves the caller's data scope (bidder
company or solo), keeps per-scope memory / chat / opportunities, assembles
the daily briefing, and orchestrates research.

Pure logic + AI calls only — imports nothing from main to avoid cycles.
"""
import time
from datetime import date, datetime, timedelta
from typing import Any, Dict, List, Optional, Tuple

from sqlalchemy import func
from sqlalchemy.orm import Session

import ai_module
from database import (
    AIChatMessage,
    AICompanyMemory,
    AIOpportunity,
    AIResearchRun,
    BidderCompany,
    BidderMember,
    CompanyProfile,
    LibraryDocument,
    Tender,
    User,
)

# The briefing narrative is cached for this long before a Gemini call regenerates it.
BRIEFING_TTL_HOURS = 12

RESEARCH_SOFT_DEADLINE_S = 50.0
SCRAPER_TIMEOUT_S = 20.0


# ---------------------- scope resolution ----------------------

def ensure_company_bootstrap(db: Session, user: User) -> Optional[BidderCompany]:
    """Give every real (non-issuer) user a bidder company they admin.

    Never merges strangers: if a company with the same name already exists
    the user stays solo-scoped and can use the join-with-approval flow.
    Idempotent.
    """
    if user is None or user.account_type == "issuer":
        return None
    member = (
        db.query(BidderMember)
        .filter(BidderMember.user_id == user.id, BidderMember.status == "approved")
        .first()
    )
    if member:
        return (
            db.query(BidderCompany)
            .filter(BidderCompany.id == member.company_id)
            .first()
        )
    name = (user.company_name or "").strip()
    if not name:
        return None
    clash = (
        db.query(BidderCompany)
        .filter(func.lower(BidderCompany.name) == name.lower())
        .first()
    )
    if clash:
        return None
    company = BidderCompany(name=name, created_by=user.id)
    db.add(company)
    db.flush()
    db.add(
        BidderMember(
            company_id=company.id,
            user_id=user.id,
            role="admin",
            status="approved",
            approved_at=datetime.utcnow(),
        )
    )
    db.commit()
    db.refresh(company)
    return company


def _company_member_ids(db: Session, company_id: int) -> List[int]:
    rows = (
        db.query(BidderMember.user_id)
        .filter(BidderMember.company_id == company_id, BidderMember.status == "approved")
        .all()
    )
    return [r[0] for r in rows]


def resolve_scope(db: Session, user: User) -> Dict[str, Any]:
    """Resolve the caller's data scope. NEVER returns "all rows".

    Company scope = every approved member of the caller's bidder company.
    Solo scope   = the caller's own rows only.
    """
    ensure_company_bootstrap(db, user)
    member = (
        db.query(BidderMember)
        .filter(BidderMember.user_id == user.id, BidderMember.status == "approved")
        .first()
    )
    if member:
        company = (
            db.query(BidderCompany)
            .filter(BidderCompany.id == member.company_id)
            .first()
        )
        return {
            "company_id": member.company_id,
            "company_name": company.name if company else None,
            "member_ids": _company_member_ids(db, member.company_id),
        }
    return {
        "company_id": None,
        "company_name": user.company_name if user else None,
        "member_ids": [user.id] if user else [],
    }


def _scope_user_id(scope: Dict[str, Any]) -> Optional[int]:
    """The user_id solo-scoped rows are tagged with (None for company scope)."""
    return None if scope["company_id"] else scope["member_ids"][0]


def _scope_filter(q, model, scope: Dict[str, Any]):
    """Apply the scope filter to a query over an AI-agent table."""
    if scope["company_id"] is not None:
        return q.filter(model.company_id == scope["company_id"])
    return q.filter(model.company_id.is_(None), model.user_id == _scope_user_id(scope))


# ---------------------- memory + chat + opportunities ----------------------

def get_or_create_memory(db: Session, scope: Dict[str, Any]) -> AICompanyMemory:
    mem = _scope_filter(db.query(AICompanyMemory), AICompanyMemory, scope).first()
    if mem is None:
        mem = AICompanyMemory(company_id=scope["company_id"], user_id=_scope_user_id(scope))
        db.add(mem)
        db.commit()
        db.refresh(mem)
    return mem


def add_chat_message(
    db: Session,
    scope: Dict[str, Any],
    user: Optional[User],
    role: str,
    content: str,
    error: bool = False,
    context_tenders: Optional[int] = None,
) -> AIChatMessage:
    msg = AIChatMessage(
        company_id=scope["company_id"],
        user_id=user.id if (user and role == "user") else None,
        role=role,
        content=content,
        error=error,
        context_tenders=context_tenders,
    )
    db.add(msg)
    db.commit()
    db.refresh(msg)
    return msg


def list_chat_messages(db: Session, scope: Dict[str, Any], limit: int = 50) -> List[AIChatMessage]:
    q = _scope_filter(db.query(AIChatMessage), AIChatMessage, scope)
    rows = q.order_by(AIChatMessage.created_at.desc(), AIChatMessage.id.desc()).limit(limit).all()
    return list(reversed(rows))


def clear_chat_messages(db: Session, scope: Dict[str, Any]) -> int:
    q = _scope_filter(db.query(AIChatMessage), AIChatMessage, scope)
    count = q.delete(synchronize_session=False)
    db.commit()
    return count


def serialize_chat(db: Session, messages: List[AIChatMessage]) -> List[Dict[str, Any]]:
    user_ids = {m.user_id for m in messages if m.user_id}
    names = {}
    if user_ids:
        names = {
            u.id: u.full_name
            for u in db.query(User).filter(User.id.in_(user_ids)).all()
        }
    return [
        {
            "id": m.id,
            "role": m.role,
            "content": m.content,
            "error": bool(m.error),
            "context_tenders": m.context_tenders,
            "user_name": names.get(m.user_id),
            "created_at": m.created_at.isoformat() if m.created_at else None,
        }
        for m in messages
    ]


def list_opportunities(
    db: Session,
    scope: Dict[str, Any],
    statuses: Tuple[str, ...] = ("new", "seen"),
    limit: int = 100,
) -> List[AIOpportunity]:
    q = _scope_filter(db.query(AIOpportunity), AIOpportunity, scope)
    q = q.filter(AIOpportunity.status.in_(statuses))
    return (
        q.order_by(AIOpportunity.match_score.is_(None), AIOpportunity.match_score.desc())
        .limit(limit)
        .all()
    )


def get_opportunity_checked(
    db: Session, scope: Dict[str, Any], opp_id: int
) -> Optional[AIOpportunity]:
    q = _scope_filter(db.query(AIOpportunity), AIOpportunity, scope)
    return q.filter(AIOpportunity.id == opp_id).first()


def recent_opportunity_summaries(
    db: Session, scope: Dict[str, Any], limit: int = 20
) -> List[Dict[str, Any]]:
    return [
        {
            "id": o.id,
            "type": o.type,
            "title": o.title,
            "provider": o.provider,
            "match_score": o.match_score,
            "status": o.status,
            "closing_date": o.closing_date.isoformat() if o.closing_date else None,
        }
        for o in list_opportunities(db, scope, limit=limit)
    ]
