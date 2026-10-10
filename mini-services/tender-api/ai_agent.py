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

# Research runs behind a ~60s Hosting proxy, so keep the whole pass well under it.
RESEARCH_SOFT_DEADLINE_S = 45.0
SCRAPER_TIMEOUT_S = 12.0


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
    """A compact, honest description of the company for search + match scoring."""
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
        if profile.psira_number:
            parts.append(f"PSIRA registered: {profile.psira_number}")
        if profile.bbbbee_level:
            parts.append(f"B-BBEE: {profile.bbbbee_level}")
        if profile.address:
            parts.append(f"Address: {profile.address}")
    categories = [
        c[0]
        for c in db.query(Tender.category)
        .filter(Tender.created_by.in_(scope["member_ids"]), Tender.category.isnot(None))
        .distinct()
        .limit(8)
        .all()
    ]
    if categories:
        parts.append("Past tender categories: " + ", ".join(str(c) for c in categories))
    locations = [
        l[0]
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
        parts.append("Tender locations: " + ", ".join(str(l) for l in locations))
    return "\n".join(parts)


def _normalize_result(r: Dict[str, Any], opp_type: str) -> Optional[Dict[str, Any]]:
    if not isinstance(r, dict):
        return None
    title = str(r.get("title") or "").strip()
    if not title:
        return None
    url = str(r.get("url") or "").strip() or None
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
    summary = _company_summary(db, user, scope)
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
                pool.submit(scraper.scrape_etenders_search, category, keywords, location, 20),
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

        # Top up with AI web search only if the scrapers were thin and we have time.
        if len(tender_raw) < 15 and (time.monotonic() - started) < RESEARCH_SOFT_DEADLINE_S - 25:
            try:
                web = ai_module.discover_tenders(
                    category, keywords, location, num_results=15,
                    skip_scrapers=True, search_timeout=15,
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
