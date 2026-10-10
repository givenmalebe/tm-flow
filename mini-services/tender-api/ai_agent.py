"""
TM Flow - AI agent module.

The company-scoped AI brain: resolves the caller's data scope (bidder
company or solo), keeps per-scope memory / chat / opportunities, assembles
the daily briefing, and orchestrates research.

Pure logic + AI calls only — imports nothing from main to avoid cycles.
"""
import os
import time
from datetime import date, datetime, timedelta
from typing import Any, Dict, List, Optional, Tuple

from sqlalchemy import func
from sqlalchemy.orm import Session

import ai_module
from scraper import public_url_or_none
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

# Research runs behind a ~60s Hosting proxy, so keep the whole pass well under it.
RESEARCH_SOFT_DEADLINE_S = 45.0
SCRAPER_TIMEOUT_S = 12.0

# Research is considered stale after this long; the briefing auto-triggers a
# fresh proactive pass and the nightly cron keeps every scope topped up.
RESEARCH_STALE_HOURS = 12


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
                "outstanding_items": [
                    c.name for c in t.checklist_items if c.status == "Outstanding"
                ][:3],
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


def _build_news(
    closing: List[Dict[str, Any]],
    opps: Dict[str, List[Dict[str, Any]]],
    limit: int = 6,
) -> List[Dict[str, Any]]:
    """Turn the scope's research results into a short, interesting news feed:

    - upcoming deadlines for the company's own tracked tenders, and
    - the fresh (not-yet-seen) tender / funding / finance matches.

    Derived purely from already-scoped data, so it costs no extra AI calls and
    every organisation's feed is private to them."""
    items: List[Dict[str, Any]] = []

    for c in closing:
        if c["days_left"] > 7:
            continue
        body = c["title"]
        if c["outstanding_items"]:
            body += f' — "{c["outstanding_items"][0]}" still outstanding.'
        items.append(
            {
                "kind": "deadline",
                "title": f"{c['reference_number']} closes in {c['days_left']} day(s)",
                "body": body,
                "days_left": c["days_left"],
                "match_score": None,
                "url": None,
                "opportunity_id": None,
                "tender_id": c["id"],
            }
        )

    for group in (opps["tenders"], opps["funding"]):
        for o in group:
            if o["status"] != "new":
                continue
            items.append(
                {
                    "kind": o["type"],
                    "title": o["title"],
                    "body": o["match_reason"] or (o["provider"] or None),
                    "days_left": o["days_left"],
                    "match_score": o["match_score"],
                    "url": o["url"],
                    "opportunity_id": o["id"],
                    "tender_id": None,
                }
            )

    def sort_key(item: Dict[str, Any]):
        urgency = item["days_left"] if item["days_left"] is not None else 10**6
        score = -(item["match_score"] or 0)
        return (item["kind"] != "deadline", urgency, score)

    items.sort(key=sort_key)
    return items[:limit]


def _template_narrative(
    scope: Dict[str, Any],
    closing: List[Dict[str, Any]],
    opps: Dict[str, List[Dict[str, Any]]],
    user_name: str = "",
) -> str:
    greet = (user_name or "").strip() or "there"
    name = scope["company_name"] or "your company"
    parts = [
        f"Good day, {greet}! I'm the dedicated procurement success AI for {name} — "
        "my mission is to help your company win tenders and secure the funding it needs."
    ]
    if closing:
        top = closing[0]
        parts.append(
            f"Your most urgent tender is {top['reference_number']} — {top['title']} — "
            f"closing in {top['days_left']} day(s)."
        )
        if top["outstanding_items"]:
            parts.append(
                f"Your single most important next step: complete "
                f"\"{top['outstanding_items'][0]}\" on {top['reference_number']}."
            )
        else:
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
            f"I'm already searching for open tenders and funding for {name} — "
            "fresh opportunities will appear here automatically."
        )
    return " ".join(parts)


def _refresh_narrative(
    db: Session,
    user: User,
    scope: Dict[str, Any],
    memory: AICompanyMemory,
    closing: List[Dict[str, Any]],
    opps: Dict[str, List[Dict[str, Any]]],
    user_name: str = "",
) -> None:
    """Regenerate + cache the narrative; template fallback never fails."""
    try:
        urgent = closing[0] if closing else None
        facts = {
            "user_name": (user_name or (user.full_name or "")).strip(),
            "closing_soon": closing[:5],
            "tenders_found": len(opps["tenders"]),
            "funding_found": len(opps["funding"]),
            "top_opportunities": (opps["tenders"][:3] + opps["funding"][:3]),
            "most_urgent_reference": urgent["reference_number"] if urgent else None,
            "most_urgent_days_left": urgent["days_left"] if urgent else None,
            "most_urgent_readiness_pct": urgent["readiness_pct"] if urgent else None,
            "next_action": (
                urgent["outstanding_items"][0]
                if urgent and urgent["outstanding_items"]
                else None
            ),
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
        memory.last_briefing_text = _template_narrative(scope, closing, opps, user_name)
    memory.last_briefing_at = datetime.utcnow()
    db.commit()


def _first_name(user: User) -> str:
    if user is None or not user.full_name:
        return ""
    return (user.full_name or "").strip().split()[0]


def _research_staleness(db: Session, scope: Dict[str, Any]) -> bool:
    """True when this scope's last research pass is missing or too old."""
    last_run = (
        _scope_filter(db.query(AIResearchRun), AIResearchRun, scope)
        .order_by(AIResearchRun.created_at.desc())
        .first()
    )
    if last_run is None:
        return True
    if last_run.status == "complete" and last_run.finished_at:
        return datetime.utcnow() - last_run.finished_at > timedelta(hours=RESEARCH_STALE_HOURS)
    if last_run.status == "running" and last_run.created_at:
        return datetime.utcnow() - last_run.created_at > timedelta(minutes=15)
    return True


def build_briefing(db: Session, user: User, force_refresh: bool = False) -> Dict[str, Any]:
    """The full greeting payload. No Gemini on the hot path when cached."""
    scope = resolve_scope(db, user)
    closing = _closing_soon_facts(db, scope)
    opps = _opportunity_facts(db, scope)
    memory = get_or_create_memory(db, scope)
    user_name = _first_name(user)

    stale = (
        memory.last_briefing_at is None
        or datetime.utcnow() - memory.last_briefing_at > timedelta(hours=BRIEFING_TTL_HOURS)
    )
    if force_refresh or stale:
        _refresh_narrative(db, user, scope, memory, closing, opps, user_name)

    last_run = (
        _scope_filter(db.query(AIResearchRun), AIResearchRun, scope)
        .order_by(AIResearchRun.created_at.desc())
        .first()
    )
    news = _build_news(closing, opps)
    return {
        "scope": {"company_id": scope["company_id"], "company_name": scope["company_name"]},
        "user_name": user_name,
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
        "research_stale": _research_staleness(db, scope),
        "news": news,
        "news_count": len(news),
        "memory": {
            "mission": memory.mission,
            "goals": memory.goals or [],
            "preferences": memory.preferences,
        },
    }


# ---------------------- research orchestration ----------------------

def _parse_date(value: Any) -> Optional[date]:
    if not value:
        return None
    if isinstance(value, datetime):
        return value.date()
    if isinstance(value, date):
        return value
    text = str(value).strip()[:10]
    try:
        return date.fromisoformat(text)
    except ValueError:
        return None


def _best_profile(db: Session, user: User, scope: Dict[str, Any]) -> Optional[CompanyProfile]:
    profile = (
        db.query(CompanyProfile).filter(CompanyProfile.user_id == user.id).first()
    )
    if profile is None and scope["member_ids"]:
        profile = (
            db.query(CompanyProfile)
            .filter(CompanyProfile.user_id.in_(scope["member_ids"]))
            .first()
        )
    return profile


def _company_summary(db: Session, user: User, scope: Dict[str, Any]) -> str:
    """A compact, honest description of the company for search + match scoring.

    Everything here comes from the caller's scope only, so each organisation's
    AI has its own private company card and no scope ever sees another's."""
    profile = _best_profile(db, user, scope)
    name = (
        (profile.company_name if profile else None)
        or scope["company_name"]
        or "The company"
    ).strip()
    parts = [f"Company: {name}"]
    if profile:
        if profile.registration_number:
            parts.append(f"CIPC registration: {profile.registration_number}")
        if profile.vat_number:
            parts.append(f"VAT number: {profile.vat_number}")
        if profile.psira_number:
            parts.append(f"PSIRA registered: {profile.psira_number}")
        if profile.bbbbee_level:
            parts.append(f"B-BBEE: {profile.bbbbee_level}")
        if profile.address:
            parts.append(f"Address: {profile.address}")
        if profile.phone:
            parts.append(f"Phone: {profile.phone}")
        if profile.email:
            parts.append(f"Email: {profile.email}")
        if profile.website:
            parts.append(f"Website: {profile.website}")
        if profile.director_name:
            director = profile.director_name
            if profile.director_title:
                director = f"{director} ({profile.director_title})"
            parts.append(f"Director: {director}")

    categories = [
        str(c[0])
        for c in db.query(Tender.category)
        .filter(Tender.created_by.in_(scope["member_ids"]), Tender.category.isnot(None))
        .distinct()
        .limit(8)
        .all()
    ]
    if categories:
        parts.append("Past tender categories: " + ", ".join(categories))
    locations = [
        str(l[0])
        for l in db.query(Tender.location_site)
        .filter(
            Tender.created_by.in_(scope["member_ids"]),
            Tender.location_site.isnot(None),
        )
        .distinct()
        .limit(8)
        .all()
    ]
    if locations:
        parts.append("Tender locations: " + ", ".join(locations))

    won = (
        db.query(Tender)
        .filter(
            Tender.created_by.in_(scope["member_ids"]),
            Tender.outcome == "Awarded",
        )
        .count()
    )
    if won:
        parts.append(f"Tenders won to date: {won}")

    library_categories = [
        str(c[0])
        for c in db.query(LibraryDocument.category)
        .filter(
            LibraryDocument.created_by.in_(scope["member_ids"]),
            LibraryDocument.category.isnot(None),
        )
        .distinct()
        .limit(8)
        .all()
    ]
    if library_categories:
        parts.append("Compliance documents held: " + ", ".join(library_categories))

    # The organisation's own stated mission / goals / preferences.
    memory = get_or_create_memory(db, scope)
    if memory.mission:
        parts.append("Company mission: " + str(memory.mission).strip()[:600])
    if memory.goals:
        parts.append("Company goals: " + "; ".join(str(g)[:200] for g in memory.goals[:6]))
    if memory.preferences:
        parts.append("Preferences: " + str(memory.preferences).strip()[:600])

    return "\n".join(parts)


# ---------------------- tenant capability profile ----------------------

# How much of the uploaded library we are willing to read, and for how long.
# Research runs behind a ~60s Hosting proxy, so this stays deliberately small.
CAPABILITY_MAX_DOCS = 6
CAPABILITY_MAX_DOC_CHARS = 1400
CAPABILITY_TIME_BUDGET_S = 8.0


def _library_paths(db: Session, scope: Dict[str, Any]):
    """This scope's uploaded library documents, real files first."""
    docs = (
        db.query(LibraryDocument)
        .filter(LibraryDocument.created_by.in_(scope["member_ids"]))
        .all()
    )
    # Deterministic ordering so the same docs drive every run.
    return sorted(docs, key=lambda d: (d.category or "", d.name or ""))[:CAPABILITY_MAX_DOCS]


def _read_doc_excerpt(path: Optional[str], filename: Optional[str], deadline: float) -> str:
    """Extract a short text excerpt from an uploaded document, time-boxed."""
    if not path:
        return ""
    try:
        if time.monotonic() > deadline:
            return ""
    except Exception:
        return ""
    full = os.path.join(os.environ.get("UPLOAD_DIR", "uploads"), path)
    if not os.path.isfile(full):
        # Fall back to the app's uploads dir when the env var is unset.
        alt = os.path.join(os.path.dirname(__file__), path)
        full = alt if os.path.isfile(alt) else None
    if not full:
        return ""
    try:
        import ai_module

        text = ai_module.extract_text_from_file(full, filename or os.path.basename(full))
    except Exception:
        return ""
    if not text or text.startswith("[PDF extraction error"):
        return ""
    text = " ".join(str(text).split())
    return text[:CAPABILITY_MAX_DOC_CHARS]


def _capability_profile(db: Session, user: User, scope: Dict[str, Any]) -> str:
    """A deep, private description of THIS tenant for search + match scoring.

    Unlike _company_summary (structured fields only) this actually opens the
    organisation's uploaded documents — company profile, organogram, capability
    statements, certificates — so the AI searches for what the tenant can really
    do, not just their name. Scoped to the caller; bounded in time and size.
    """
    parts: List[str] = [_company_summary(db, user, scope)]
    deadline = time.monotonic() + CAPABILITY_TIME_BUDGET_S

    # 1. Any AI-extracted organogram / structure text already on the profile.
    profile = _best_profile(db, user, scope)
    if profile is not None:
        if getattr(profile, "letterhead_tagline", None):
            parts.append("Tagline: " + str(profile.letterhead_tagline).strip()[:200])
        if getattr(profile, "organogram_text", None):
            organ = " ".join(str(profile.organogram_text).split())
            if organ:
                parts.append("Organisation structure (from organogram): " + organ[:800])

    # 2. Read the organisation's own uploaded documents.
    docs = _library_paths(db, scope)
    excerpts: List[str] = []
    labels: List[str] = []
    for doc in docs:
        excerpt = _read_doc_excerpt(doc.file_path, doc.filename, deadline)
        if not excerpt:
            continue
        label = f"{doc.category or 'Document'} — {doc.name or doc.filename}"
        if doc.description:
            label += f": {' '.join(str(doc.description).split())[:120]}"
        excerpts.append(f"[{label}] {excerpt}")
        labels.append(doc.category or doc.name or "document")
    if excerpts:
        parts.append(
            "What this organisation can do (from its own uploaded documents):\n"
            + "\n".join(excerpts)
        )
    if labels:
        parts.append("Documents the organisation holds: " + ", ".join(dict.fromkeys(labels)))

    return "\n".join(p for p in parts if p)


def _normalize_result(r: Dict[str, Any], opp_type: str) -> Optional[Dict[str, Any]]:
    if not isinstance(r, dict):
        return None
    title = str(r.get("title") or "").strip()
    if not title:
        return None
    url = str(r.get("url") or "").strip() or None
    url = public_url_or_none(url)
    source_site = str(r.get("source_site") or "").strip() or None
    if not source_site and url:
        try:
            from urllib.parse import urlparse
            source_site = urlparse(url).netloc or None
        except Exception:
            source_site = None
    provider = r.get("provider") or r.get("client")
    return {
        "type": opp_type,
        "title": title[:500],
        "provider": (str(provider).strip()[:500] if provider else None),
        "category": (str(r.get("category")).strip()[:255] if r.get("category") else None),
        "location": (str(r.get("location")).strip()[:255] if r.get("location") else None),
        "closing_date": _parse_date(r.get("closing_date")),
        "description": (str(r.get("description")).strip() if r.get("description") else None),
        "url": url[:1000] if url else None,
        "source_site": source_site[:255] if source_site else None,
        "reference_number": (
            str(r.get("reference_number")).strip()[:255]
            if r.get("reference_number")
            else None
        ),
        "estimated_value": (
            str(r.get("estimated_value")).strip()[:255]
            if r.get("estimated_value")
            else None
        ),
    }


def _dedup_key(item: Dict[str, Any]) -> str:
    url = (item.get("url") or "").strip().lower().rstrip("/")
    if url:
        return "url:" + url
    return "title:" + (item.get("title") or "").strip().lower()


def _existing_opportunity_map(db: Session, scope: Dict[str, Any]) -> Dict[str, AIOpportunity]:
    rows = _scope_filter(db.query(AIOpportunity), AIOpportunity, scope).all()
    index: Dict[str, AIOpportunity] = {}
    for o in rows:
        index[_dedup_key({"url": o.url, "title": o.title})] = o
    return index


def run_research(db: Session, user: User) -> Dict[str, Any]:
    """Run one research pass for the caller's scope: scrape portals, discover
    funding, match-score everything, then store/dedupe. Never raises on
    individual source failures — a failed source just contributes nothing."""
    from concurrent.futures import ThreadPoolExecutor, as_completed

    import scraper

    scope = resolve_scope(db, user)
    # The tenant's deep capability profile (its own uploaded documents) drives
    # both what we search for and how we score matches.
    capability = _capability_profile(db, user, scope)
    summary = capability or _company_summary(db, user, scope)
    profile = _best_profile(db, user, scope)
    location = "South Africa"
    if profile and profile.address:
        location = profile.address[-60:]
    categories = [
        str(c[0])
        for c in db.query(Tender.category)
        .filter(Tender.created_by.in_(scope["member_ids"]), Tender.category.isnot(None))
        .distinct()
        .limit(3)
        .all()
    ]
    category = categories[0] if categories else ""
    keywords = " ".join(categories[:3])

    # The tenant's own service phrases drive what we look for, so a cleaning
    # company sees cleaning tenders rather than unrelated listings.
    service_terms = ai_module._capability_terms(capability)
    if service_terms:
        category = service_terms[0]
        keywords = " ".join(service_terms)

    run = AIResearchRun(
        company_id=scope["company_id"],
        user_id=_scope_user_id(scope),
        query=summary[:2000],
        status="running",
    )
    db.add(run)
    db.commit()
    db.refresh(run)

    started = time.monotonic()
    try:
        # Scrapers and funding discovery run concurrently to fit the proxy budget.
        tender_raw: List[Dict[str, Any]] = []
        funding_raw: List[Dict[str, Any]] = []
        with ThreadPoolExecutor(max_workers=4) as pool:
            futures = [
                pool.submit(scraper.scrape_security_co_za, category, keywords, location, 20),
                pool.submit(scraper.scrape_tenderflow_co_za, category, keywords, location, 20),
                pool.submit(scraper.scrape_etenders_opportunities, category, keywords, location, 20),
            ]
            funding_future = pool.submit(ai_module.discover_funding, summary, location)
            for future in as_completed(futures + [funding_future]):
                is_funding = future is funding_future
                try:
                    result = future.result(timeout=SCRAPER_TIMEOUT_S + 5)
                    if is_funding:
                        funding_raw.extend(result or [])
                    else:
                        tender_raw.extend(result or [])
                except Exception:
                    if is_funding:
                        funding_raw = []

        # Tenant-specific AI web search (Google grounding) — now that we know the
        # organisation, this is the main source of matched tenders with real pages.
        if (time.monotonic() - started) < RESEARCH_SOFT_DEADLINE_S - 22:
            try:
                web = ai_module.discover_tenders(
                    category, keywords, location, num_results=15,
                    skip_scrapers=True, search_timeout=15, capability=capability,
                )
                tender_raw.extend(web.get("results", []) or [])
            except Exception:
                pass

        # Normalize + dedup within this run.
        candidates: Dict[str, Dict[str, Any]] = {}
        for r in tender_raw:
            item = _normalize_result(r, "tender")
            if item:
                candidates.setdefault(_dedup_key(item), item)
        for r in funding_raw:
            raw_type = str(r.get("type") or "funding").strip().lower()
            opp_type = "finance" if raw_type == "finance" else "funding"
            item = _normalize_result(r, opp_type)
            if item:
                candidates.setdefault(_dedup_key(item), item)

        # Verify every tender link actually opens before we store it, so the
        # tenant is never shown a dead page or a login wall.
        remaining = max(0.0, RESEARCH_SOFT_DEADLINE_S - (time.monotonic() - started) - 8)
        if remaining > 3:
            try:
                from linkcheck import verify_links, apply_verdicts

                items = list(candidates.values())
                linked = [i for i in items if i.get("url")]
                verdicts = verify_links(
                    [i.get("url") for i in linked], deadline_s=min(remaining, 12)
                )
                keep = apply_verdicts([dict(i) for i in linked], verdicts)
                by_key = {_dedup_key(k): k for k in keep}
                dropped = 0
                for key, item in list(candidates.items()):
                    if not item.get("url"):
                        item["link_kind"] = "none"
                        continue
                    new_item = by_key.get(key)
                    if new_item is None:
                        candidates.pop(key, None)
                        dropped += 1
                    else:
                        candidates[key] = new_item
            except Exception:
                pass

        # Score all candidates in one batched call.
        ordered = list(candidates.values())
        scores = {}
        if ordered:
            try:
                scores = {
                    s["index"]: s
                    for s in ai_module.score_opportunities(summary, ordered)
                }
            except Exception:
                scores = {}

        existing = _existing_opportunity_map(db, scope)
        new_count = 0
        updated_count = 0
        tender_count = 0
        funding_count = 0
        finance_count = 0
        for idx, item in enumerate(ordered):
            if item["type"] == "tender":
                tender_count += 1
            elif item["type"] == "finance":
                finance_count += 1
            else:
                funding_count += 1
            score = scores.get(idx)
            key = _dedup_key(item)
            opp = existing.get(key)
            if opp is None:
                opp = AIOpportunity(
                    company_id=scope["company_id"],
                    user_id=_scope_user_id(scope),
                    status="new",
                )
                db.add(opp)
                existing[key] = opp
                new_count += 1
            else:
                updated_count += 1
            opp.run_id = run.id
            opp.type = item["type"]
            opp.title = item["title"]
            opp.provider = item["provider"]
            opp.category = item["category"]
            opp.location = item["location"]
            opp.closing_date = item["closing_date"]
            opp.description = item["description"]
            opp.url = item["url"]
            opp.source_site = item["source_site"]
            opp.reference_number = item["reference_number"]
            opp.estimated_value = item["estimated_value"]
            if score:
                opp.match_score = score["score"]
                opp.match_reason = score["reason"]

        run.tenders_found = tender_count
        run.funding_found = funding_count
        run.finance_found = finance_count
        run.status = "complete"
        run.finished_at = datetime.utcnow()
        db.commit()

        # Refresh the cached narrative so the greeting reflects the new finds —
        # but only when there's budget left (the briefing reloads it otherwise).
        if (time.monotonic() - started) < 30:
            try:
                build_briefing(db, user, force_refresh=True)
            except Exception:
                pass

        return {
            "run_id": run.id,
            "status": run.status,
            "tenders_found": tender_count,
            "funding_found": funding_count,
            "finance_found": finance_count,
            "new_count": new_count,
            "updated_count": updated_count,
        }
    except Exception as exc:
        run.status = "failed"
        run.error = str(exc)[:500]
        run.finished_at = datetime.utcnow()
        db.commit()
        raise


# ---------------------- proactive (unprompted) research ----------------------

def run_research_for_company(db: Session, company: BidderCompany) -> Dict[str, Any]:
    """Run research for ONE organisation, using one of its approved members.

    Every pass is scoped to the company, so a sweep never blends data
    between organisations."""
    members = (
        db.query(BidderMember)
        .filter(
            BidderMember.company_id == company.id,
            BidderMember.status == "approved",
        )
        .all()
    )
    if not members:
        return {"company_id": company.id, "company_name": company.name,
                "skipped": "no approved members"}
    members.sort(key=lambda m: (m.role != "admin", m.user_id))
    user = db.query(User).filter(User.id == members[0].user_id).first()
    if user is None:
        return {"company_id": company.id, "company_name": company.name,
                "skipped": "member user not found"}
    result = run_research(db, user)
    result["company_id"] = company.id
    result["company_name"] = company.name
    return result


def cron_research_all(db: Session, max_companies: Optional[int] = None) -> Dict[str, Any]:
    """Proactive sweep: research every organisation, one at a time.

    Each company is researched inside its own scope; a failure in one
    company never aborts the sweep for the others."""
    companies = db.query(BidderCompany).order_by(BidderCompany.id).all()
    if max_companies:
        companies = companies[: max(0, int(max_companies))]

    results: List[Dict[str, Any]] = []
    succeeded = 0
    for company in companies:
        try:
            item = run_research_for_company(db, company)
            succeeded += 1
        except Exception as exc:  # pragma: no cover - defensive sweep guard
            item = {
                "company_id": company.id,
                "company_name": company.name,
                "error": str(exc)[:300],
            }
        results.append(item)

    return {
        "companies": len(companies),
        "succeeded": succeeded,
        "results": results,
    }
