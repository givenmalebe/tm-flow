# Multi-Tenancy, Roles & Two UIs — Design Spec

Date: 2026-10-03
Status: Draft (pending approval)
Supersedes: `2026-10-02-tender-bidder-evaluation-design.md` (bidder-centric model, no tenancy)

## 1. Problem

TM Flow is currently a single-tenant contractor-side tool: one user, one flat
`tenders` table, one dashboard. Two capabilities are missing:

1. **Issuer side** — organisations that *publish* tenders and evaluate bids
   received from competing suppliers.
2. **Multi-tenancy** — many organisations, each seeing only its own data, with
   shared logins and per-org roles.

A security defect must be fixed as part of this: `db.query(Tender).filter(
Tender.id == tender_id)` appears throughout `main.py` with no ownership check,
so **any authenticated user can read any tender by ID**. There is also no
`org_id` on any model.

## 2. Goals

- Two distinct UIs selected at registration: **apply for tenders** (bidder) and
  **create/manage tenders** (issuer).
- Organisations are tenants. A user may belong to several; the app can switch
  between them.
- Multiple users per organisation, with Owner / Admin / Member roles.
- Tenders published by an issuer are discoverable by other organisations; a
  bidder organisation creates its own `Bid` against a tender it does not own.
- Tenant isolation enforced explicitly on every query.
- No regression to existing contractor-side workflows.

## 3. Non-Goals

- External bidder self-service portal (bidders do not log in; issuer staff
  record bids). Deferred.
- Email delivery of invitations. Join is by code, not email.
- Row-level security at the database layer (SQLite has none; see §9).
- Bid revisions/versioning per bidder.
- Weighted scoring matrices. Evaluation is AI-driven with reasoning (§8).

## 4. Terminology

| Term | Meaning |
|---|---|
| Organisation (org) | The tenant. Owns tenders or bids, never both. |
| Account type | `bidder` or `issuer`. Property of the **organisation**. |
| Membership | Links a user to an org with a role. |
| Tender | Issued by an issuer org. |
| Requirement | A document an issuer requires for qualification. |
| Bid | A bidder org's submission against someone else's tender. |

## 5. Decisions (locked during brainstorming)

| # | Decision | Rationale |
|---|---|---|
| D1 | Account type is per **organisation**, not per user | Matches how procurement actually works; keeps UI separation structural |
| D2 | Multiple users per organisation | Real teams; requires invites/roles |
| D3 | Multiple organisations per user | Requires an org switcher |
| D4 | Join existing org by **name + join code**; create new org is one click | Auto-join by name alone lets a competitor join a rival and read their tenders. See §6 |
| D5 | Roles: Owner / Admin / Member | Sufficient for most teams; avoids a permission matrix |
| D6 | **Published marketplace** for tender discovery | How Ariba/TenderNet work; no duplication of tender data |
| D7 | Tenancy by **explicit filter** via dependency, not global auto-filter | Security-critical, greppable, auditable. SQLite has no RLS |
| D8 | **Two route trees** (`/bidder/*`, `/issuer/*`) over a shared shell | Makes cross-role leakage structurally impossible |
| D9 | Bids recorded by issuer staff, entered via **bulk upload** | Bidders do not get accounts in v1 |

## 6. Security note on joining (D4)

Requested behaviour was auto-join by company name. Implemented as: creating a
**new** organisation is one click; joining an **existing** organisation requires
its `join_code`. Without this, any user could type a competitor's company name
and read their tenders, bids and pricing. The join code is generated once when
the org is created and is visible to members in Settings.

## 7. Data model

New tables:

```python
class Organisation(Base):
    __tablename__ = "organisations"
    id            = Column(Integer, primary_key=True, index=True)
    name          = Column(String(255), nullable=False, unique=True)  # case-insensitive
    join_code     = Column(String(32), nullable=False, index=True)
    account_type  = Column(String(20), nullable=False)  # 'bidder' | 'issuer'
    created_at    = Column(DateTime, default=datetime.utcnow)
    memberships   = relationship("Membership", back_populates="organisation", cascade="all, delete-orphan")
    bids          = relationship("Bid", back_populates="organisation", cascade="all, delete-orphan")


class Membership(Base):
    __tablename__ = "memberships"
    id         = Column(Integer, primary_key=True, index=True)
    user_id    = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    org_id     = Column(Integer, ForeignKey("organisations.id", ondelete="CASCADE"), nullable=False)
    role       = Column(String(20), nullable=False, default="member")  # owner | admin | member
    created_at = Column(DateTime, default=datetime.utcnow)
    user       = relationship("User", back_populates="memberships")
    organisation = relationship("Organisation", back_populates="memberships")
    __table_args__ = (UniqueConstraint("user_id", "org_id"),)
```

Existing tables gain `org_id`, plus two new relationships on `Tender`:

```python
tenders.org_id  -> organisations.id   # nullable during migration, backfilled

# added to the Tender class:
requirements = relationship("TenderRequirement", back_populates="tender",
                            cascade="all, delete-orphan")
bids         = relationship("Bid", back_populates="tender",
                            cascade="all, delete-orphan")
```

`Bid.organisation` and `Bid.tender` are both required because a bid is owned by
one org and points at another org's tender.

New bid-side tables:

```python
class TenderRequirement(Base):
    __tablename__ = "tender_requirements"
    id           = Column(Integer, primary_key=True, index=True)
    tender_id    = Column(Integer, ForeignKey("tenders.id", ondelete="CASCADE"), nullable=False)
    name         = Column(String(500), nullable=False)
    category     = Column(String(255), nullable=True)
    description  = Column(Text, nullable=True)
    is_mandatory = Column(Boolean, default=True)
    order_index  = Column(Integer, default=0)
    created_at   = Column(DateTime, default=datetime.utcnow)
    updated_at   = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    tender       = relationship("Tender", back_populates="requirements")


class Bid(Base):
    __tablename__ = "bids"
    id           = Column(Integer, primary_key=True, index=True)
    org_id       = Column(Integer, ForeignKey("organisations.id", ondelete="CASCADE"), nullable=False, index=True)
    tender_id    = Column(Integer, ForeignKey("tenders.id", ondelete="CASCADE"), nullable=False, index=True)
    status       = Column(String(50), default="draft")   # draft | submitted | shortlisted | awarded | rejected | withdrawn
    submitted_at = Column(DateTime, nullable=True)
    bid_amount   = Column(Float, nullable=True)
    notes        = Column(Text, nullable=True)
    created_at   = Column(DateTime, default=datetime.utcnow)
    updated_at   = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    organisation = relationship("Organisation", back_populates="bids")
    tender       = relationship("Tender", back_populates="bids")
    documents    = relationship("BidDocument", back_populates="bid", cascade="all, delete-orphan")
    __table_args__ = (UniqueConstraint("org_id", "tender_id"),)   # one bid per org per tender


class BidDocument(Base):
    __tablename__ = "bid_documents"
    id                = Column(Integer, primary_key=True, index=True)
    bid_id            = Column(Integer, ForeignKey("bids.id", ondelete="CASCADE"), nullable=False)
    requirement_name  = Column(String(500), nullable=False)
    category          = Column(String(255), nullable=True)
    is_required       = Column(Boolean, default=True)
    status            = Column(String(50), default="received")
        # received | compliant | non_compliant | expired | missing | under_review
    filename          = Column(String(500), nullable=True)
    file_path         = Column(String(1000), nullable=True)
    original_filename = Column(String(500), nullable=True)
    file_size         = Column(Integer, nullable=True)
    file_type         = Column(String(100), nullable=True)
    issue_date        = Column(Date, nullable=True)
    expiry_date       = Column(Date, nullable=True)
    is_certified      = Column(Boolean, nullable=True)
    compliance_notes  = Column(Text, nullable=True)
    ai_checked        = Column(Boolean, default=False)
    ai_check_result   = Column(JSON, nullable=True)
    created_at        = Column(DateTime, default=datetime.utcnow)
    updated_at        = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    bid = relationship("Bid", back_populates="documents")


class BidEvaluation(Base):
    __tablename__ = "bid_evaluations"
    id           = Column(Integer, primary_key=True, index=True)
    tender_id    = Column(Integer, ForeignKey("tenders.id", ondelete="CASCADE"), nullable=False)
    bid_id       = Column(Integer, ForeignKey("bids.id", ondelete="CASCADE"), nullable=True)
    status       = Column(String(50), default="running")   # running | completed | failed
    result       = Column(JSON, nullable=True)
    reasoning    = Column(Text, nullable=True)
    top_bid_id   = Column(Integer, ForeignKey("bids.id"), nullable=True)
    created_at   = Column(DateTime, default=datetime.utcnow)
    completed_at = Column(DateTime, nullable=True)
```

### 7.1 Removed models

`tender_bidders`, `tender_bidder_documents`, `tender_evaluations` (added in a
prior change, never exposed via API or UI) are **dropped**. They were
bidder-centric and had no owning org and no `Bid` entity. Dropping them is clean
because nothing references them.

### 7.2 Legacy migration

Existing `tenders` rows have no `org_id`. Migration, run once at startup and
idempotent:

1. If no `Organisation` named `Legacy Workspace` exists, create it with
   `account_type='bidder'` and a generated `join_code`.
2. Attach every existing user as `owner` of it.
3. Backfill `tenders.org_id` where null.
4. Leave `org_id` nullable at the column level to avoid SQLite table rewrites;
   application code always filters on it, and a `NOT NULL` migration is a
   separate maintenance task.

`account_type='bidder'` is correct: every existing workflow (Submissions,
Pricing, Checklist, Clarifications, Addendums) is contractor-side behaviour.

## 8. Evaluation approach

Evaluation is **AI-driven**, not a fixed weighted matrix. The AI returns
structured JSON with per-document findings, a compliance score, a ranked list,
and prose reasoning. Three stages, each recorded in `bid_evaluations` for audit:

1. **Requirements extraction** — read the tender document(s) and produce
   `tender_requirements`. Issuer confirms before saving.
2. **Document compliance** — for each bid document: is it the right document,
   is it certified (signature/stamp/certificate number), is it expired, does it
   satisfy the requirement. Sets `BidDocument.status`, `is_certified`,
   `expiry_date`, `compliance_notes`.
3. **Top bidder** — considering price, compliance, and capability, return
   `ranked_bids`, `top_bid_id`, `reasoning`, `confidence`, and whether the top
   place is tied.

AI output is advisory. The issuer can override the top bidder manually and mark
a bid `awarded`; manual actions never overwrite AI reasoning in the audit trail.

## 9. Tenancy enforcement

Explicit, greppable filters rather than a global SQLAlchemy auto-filter.
SQLite provides no row-level security, so correctness depends on every call site
being right; explicit filters make an omission visible in review.

Two dependencies in `auth.py`:

```python
def get_current_org(creds = Depends(oauth2_scheme), db = Depends(get_db)):
    # decode token -> user_id, org_id
    # load user; 401 if absent
    # load Membership(user_id, org_id); 403 if absent
    # return (org, membership)
```

Membership is re-verified on **every** request, so a stale or hand-edited token
cannot grant access. `org_id` is a pointer only, never an authority.

Every tender-scoped endpoint becomes:

```python
tender = db.query(Tender).filter(
    Tender.id == tender_id,
    Tender.org_id == org.id,      # <- the fix for the IDOR
).first()
if not tender:
    raise HTTPException(404)      # same as "does not exist" — prevents enumeration
```

Role gates: `owner` only for delete-org and transfer-ownership;
`owner|admin` for member management; all roles for tender and bid work.

## 10. Marketplace (the one cross-org read)

An issuer's published tender is readable by any org. Everything else is private.
Enforced by **schema**, not convention:

```python
class MarketplaceRequirementOut(BaseModel):
    """A published qualification requirement. Name/category/mandatory only —
    never the issuer's internal notes or linked library documents."""
    id: int
    name: str
    category: Optional[str]
    is_mandatory: bool


class MarketplaceTenderOut(BaseModel):
    """Fields safe for competitors to see. Deliberately excludes checklist
    internals, pricing, our bid, submissions, addendums and communications."""
    id: int
    reference_number: str
    title: str
    client_company: str
    description: Optional[str]
    scope_of_work: Optional[str]
    category: Optional[str]
    location_site: Optional[str]
    issue_date: Optional[date]
    closing_date: Optional[date]
    estimated_value: Optional[float]
    requirements: List[MarketplaceRequirementOut] = []
```

Marketplace endpoints return **only** this type. Reusing `TenderOut` would risk
leaking private fields the moment one is added, so the narrow projection is the
security control. A `Bid` is private to the owning org; the issuer sees every bid
on its own tender. Unpublished tenders are invisible to the marketplace.

## 11. API surface

Auth / tenancy:

```
POST   /api/auth/register              {full_name, email, password, org_name, account_type}
POST   /api/auth/join-org              {org_name, join_code}
GET    /api/auth/me                    user + active org + memberships
GET    /api/orgs                       orgs the user belongs to
POST   /api/auth/switch-org            {org_id} -> re-issued token
PATCH  /api/orgs/{id}                  rename (owner/admin)
GET    /api/orgs/{id}/members          (owner/admin)
POST   /api/orgs/{id}/members          add existing user by email (owner/admin)
PATCH  /api/orgs/{id}/members/{uid}    change role (owner/admin)
DELETE /api/orgs/{id}/members/{uid}    remove (owner/admin)
```

Marketplace (bidder side):

```
GET  /api/marketplace/tenders          published, open tenders from all orgs
GET  /api/marketplace/tenders/{id}     MarketplaceTenderOut only
```

Bidder side:

```
POST  /api/tenders/{tid}/bids          create/update our bid (unique per org)
GET   /api/bids/{id}                   our bid + documents
POST  /api/bids/{id}/documents         upload
DELETE /api/bid-documents/{id}
PUT   /api/bid-documents/{id}
```

Issuer side:

```
GET   /api/tenders/{tid}/requirements
POST  /api/tenders/{tid}/requirements
PUT   /api/requirements/{id}
DELETE /api/requirements/{id}
POST  /api/tenders/{tid}/requirements/extract        AI, returns draft for confirmation
POST  /api/tenders/{tid}/bids/bulk-upload           zip -> detected grouping for confirmation
POST  /api/tenders/{tid}/bids/{bid_id}/evaluate      AI document compliance
POST  /api/tenders/{tid}/evaluate                    AI top bidder
POST  /api/tenders/{tid}/bids/{bid_id}/award         mark awarded/unawarded
POST  /api/tenders/{tid}/bids/{bid_id}/set-top       manual override
GET   /api/tenders/{tid}/bids                        all bids on our tender
GET   /api/issuer/analytics                          counts + awarded value
```

## 12. Bulk upload flow

1. Issuer uploads a `.zip`.
2. Server unzips to `uploads/bids/{upload_id}/` (path-traversal safe: reject
   entries containing `..` or absolute paths).
3. AI groups files into bidders, in priority order: folder name → filename
   pattern → document content.
4. Return the **detected grouping for confirmation**. Nothing is persisted to
   `bids` yet.
5. Issuer confirms, corrects names, and maps documents to requirements.
6. Only then are `Bid` and `BidDocument` rows created.

AI never silently creates bidders. Human confirmation is a required step.

## 13. UI structure

Two route trees over one shared shell component:

```
/bidder/*   Discover · My Bids · Deadlines · Library · Company ·
            Documents · Pricing · Assistant
/issuer/*   Dashboard · Tenders · Bid Evaluation · Briefings ·
            Library · Company · Members · Assistant
```

- `register` captures org name + account type, then routes to `/bidder` or
  `/issuer`.
- A shell-level guard redirects to `/bidder` or `/issuer` based on the active
  org's `account_type`, so a deep link cannot cross roles.
- Org switcher in the header lists the user's orgs; switching calls
  `switch-org` and re-issues the token.
- `tender-detail.tsx` (131 KB, contractor-centric) is **not forked**. The bidder
  side keeps it. The issuer side gets a new purpose-built evaluation view.
- Existing tabs map across both roles; issuer-only and bidder-only tabs are
  filtered out of the nav by account type.

## 14. Errors

| Code | Case |
|---|---|
| 401 | Unauthenticated / invalid token |
| 403 | Authenticated but not a member of the token's org, or insufficient role |
| 404 | Not found **in the active org** — identical to "does not exist", so IDs cannot be enumerated |
| 404 | `join-org` with an unknown org name *or* a wrong join code — the two cases are deliberately indistinguishable, so the endpoint cannot be used to discover which organisations exist |
| 409 | Duplicate org name, duplicate bid for (org, tender), duplicate membership |

## 15. Testing

Priority order:

1. **Tenant isolation** (the security-critical suite). For every resource —
   tender, requirement, bid, bid document, evaluation — assert org A receives
   `404` when reading, updating, or deleting org B's row by direct ID. Include
   the marketplace: an org may read a *published* tender, but must still get
   `404` for its bids, documents and private fields.
2. **Auth & tenancy** — register creates org + owner membership; join requires
   correct join code; wrong code is rejected without revealing whether the org
   exists; switch-org re-issues a token and enforces membership; a token
   carrying another org's `org_id` is rejected.
3. **Role gates** — member cannot manage members; admin cannot delete the org.
4. **Bids** — one bid per (org, tender); duplicate returns 409.
5. **Bulk upload** — grouping produces a reviewable proposal; zip-slip is
   rejected; confirmation is required before rows exist.
6. **Migration** — legacy rows are backfilled; running twice is a no-op.

## 16. Delivery sequence

Each stage is independently shippable; the app stays working throughout.

| Stage | Contents | Depends on |
|---|---|---|
| 1 | Organisations, memberships, migration, auth/switch-org, `get_current_org`, tenant filters on **all** existing endpoints, org switcher, `/bidder` + `/issuer` route trees with existing tabs | — |
| 2 | `TenderRequirement`, `Bid`, `BidDocument`, marketplace endpoints and projection, bidder bid UI, issuer requirements UI | 1 |
| 3 | Bulk upload + AI grouping, AI compliance, AI top bidder, issuer evaluation UI, analytics | 2 |

Stage 1 fixes the IDOR on its own and is worth shipping regardless of the rest.

## 17. Out of scope / follow-ups

- External bidder portal with self-service upload (replaces D9 when needed)
- `NOT NULL` constraint on `tenders.org_id` (deferred, SQLite rewrite)
- Evaluation panel configurable per issuer (weights, criteria)
- Email notifications on tender publication or bid status change
