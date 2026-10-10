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


# ---------------------- briefing ----------------------

def _closing_soon_facts(db: Session, scope: Dict[str, Any]) -> List[Dict[str, Any]]:
    """The scope's own tenders with a future closing date, soonest first."""
    today = date.today()
    libs = (
        db.query(LibraryDocument)
        .filter(LibraryDocument.created_by.in_(scope["member_ids"]))
        .all()
    )
    rows = (
        db.query(Tender)
        .filter(Tender.created_by.in_(scope["member_ids"]), Tender.closing_date.isnot(None))
        .all()
    )
    out: List[Dict[str, Any]] = []
    for t in rows:
        days = (t.closing_date - today).days
        if days < 0:
            continue
        total = len(t.checklist_items)
        complete = len([c for c in t.checklist_items if c.status == "Complete"])
        expiring = [
            d.name
            for d in libs
            if d.expiry_date and 0 <= (d.expiry_date - today).days <= days
        ]
        out.append(
            {
                "id": t.id,
                "reference_number": t.reference_number,
                "title": t.title,
                "closing_date": t.closing_date.isoformat(),
                "days_left": days,
                "status": t.status,
                "readiness_pct": round(100 * complete / total) if total else None,
                "expiring_docs": expiring,
            }
        )
    out.sort(key=lambda x: x["days_left"])
    return out


def _serialize_opportunity(o: AIOpportunity, today: date) -> Dict[str, Any]:
    days = (o.closing_date - today).days if o.closing_date else None
    return {
        "id": o.id,
        "type": o.type,
        "title": o.title,
        "provider": o.provider,
        "category": o.category,
        "location": o.location,
        "closing_date": o.closing_date.isoformat() if o.closing_date else None,
        "days_left": days if (days is None or days >= 0) else None,
        "match_score": o.match_score,
        "match_reason": o.match_reason,
        "url": o.url,
        "source_site": o.source_site,
        "status": o.status,
    }


def _opportunity_facts(db: Session, scope: Dict[str, Any]) -> Dict[str, List[Dict[str, Any]]]:
    """Open (new/seen, not-yet-closed) opportunities, best match first."""
    today = date.today()
    opps = list_opportunities(db, scope, statuses=("new", "seen"), limit=100)
    tenders, funding = [], []
    for o in opps:
        if o.closing_date and o.closing_date < today:
            continue
        item = _serialize_opportunity(o, today)
        if o.type == "tender":
            tenders.append(item)
        elif o.type in ("funding", "finance"):
            funding.append(item)
    tenders.sort(key=lambda x: (x["match_score"] is None, -(x["match_score"] or 0)))
    funding.sort(key=lambda x: (x["match_score"] is None, -(x["match_score"] or 0)))
    return {"tenders": tenders, "funding": funding}


def _template_narrative(
    scope: Dict[str, Any],
    closing: List[Dict[str, Any]],
    opps: Dict[str, List[Dict[str, Any]]],
) -> str:
    name = scope["company_name"] or "your company"
    parts = []
    if closing:
        top = closing[0]
        parts.append(
            f"Your most urgent tender is {top['reference_number']} — {top['title']} — "
            f"closing in {top['days_left']} day(s)."
        )
        incomplete = [c for c in closing if (c["readiness_pct"] or 0) < 100]
        if incomplete:
            parts.append(
                f"{len(incomplete)} of your closing tenders still have outstanding checklist items."
            )
    else:
        parts.append("You have no tracked tenders closing soon.")
    t_count, f_count = len(opps["tenders"]), len(opps["funding"])
    if t_count or f_count:
        parts.append(
            f"I've found {t_count} open tender(s) and {f_count} funding option(s) "
            f"matching {name} — review them below and ask me about any of them."
        )
    else:
        parts.append(
            f"Run your first research below and I'll hunt open tenders and funding for {name}."
        )
    return (
        f"Hi! I'm your dedicated procurement success AI for {name}. " + " ".join(parts)
    )


def _refresh_narrative(
    db: Session,
    user: User,
    scope: Dict[str, Any],
    memory: AICompanyMemory,
    closing: List[Dict[str, Any]],
    opps: Dict[str, List[Dict[str, Any]]],
) -> None:
    """Regenerate + cache the narrative; template fallback never fails."""
    try:
        facts = {
            "closing_soon": closing[:5],
            "tenders_found": len(opps["tenders"]),
            "funding_found": len(opps["funding"]),
            "top_opportunities": (opps["tenders"][:3] + opps["funding"][:3]),
        }
        mem_facts = {
            "mission": memory.mission,
            "goals": memory.goals,
            "preferences": memory.preferences,
        }
        memory.last_briefing_text = ai_module.generate_briefing(
            scope["company_name"] or "", facts, mem_facts
        )
    except Exception:
        memory.last_briefing_text = _template_narrative(scope, closing, opps)
    memory.last_briefing_at = datetime.utcnow()
    db.commit()


def build_briefing(db: Session, user: User, force_refresh: bool = False) -> Dict[str, Any]:
    """The full greeting payload. No Gemini on the hot path when cached."""
    scope = resolve_scope(db, user)
    closing = _closing_soon_facts(db, scope)
    opps = _opportunity_facts(db, scope)
    memory = get_or_create_memory(db, scope)

    stale = (
        memory.last_briefing_at is None
        or datetime.utcnow() - memory.last_briefing_at > timedelta(hours=BRIEFING_TTL_HOURS)
    )
    if force_refresh or stale:
        _refresh_narrative(db, user, scope, memory, closing, opps)

    last_run = (
        _scope_filter(db.query(AIResearchRun), AIResearchRun, scope)
        .order_by(AIResearchRun.created_at.desc())
        .first()
    )
    return {
        "scope": {"company_id": scope["company_id"], "company_name": scope["company_name"]},
        "narrative": memory.last_briefing_text,
        "narrative_generated_at": (
            memory.last_briefing_at.isoformat() if memory.last_briefing_at else None
        ),
        "closing_soon": closing,
        "opportunities": opps,
        "last_research_at": (
            last_run.created_at.isoformat()
            if last_run and last_run.created_at
            else None
        ),
        "memory": {
            "mission": memory.mission,
            "goals": memory.goals or [],
            "preferences": memory.preferences,
        },
    }
