"""Read/write the Data Connect-owned `public.user` table from FastAPI.

`user` is a reserved word in Postgres, so it is always quoted. The table shape
is defined by dataconnect/schema/schema.gql:

    id                   text  primary key   (holds the Firebase Auth UID)
    email                text  not null
    full_name            text  not null
    company_name         text
    role                 text  not null default 'admin'
    account_type         text  not null default 'applicant'
    onboarding_completed boolean not null default false
    created_at           timestamptz not null
"""
from __future__ import annotations

from typing import Optional

from sqlalchemy import text

import pg

_COLUMNS = (
    "id, email, full_name, company_name, role, account_type, "
    "onboarding_completed, created_at"
)


def get_user(uid: str) -> Optional[dict]:
    """Return the user row for a Firebase UID, or None."""
    eng = pg.engine()
    if eng is None:
        return None
    with eng.connect() as conn:
        row = conn.execute(
            text(f"SELECT {_COLUMNS} FROM public.\"user\" WHERE id = :id"),
            {"id": uid},
        ).mappings().first()
    return dict(row) if row else None


def upsert_user(
    uid: str,
    email: str,
    full_name: str,
    company_name: Optional[str] = None,
    role: str = "admin",
    account_type: Optional[str] = None,
) -> Optional[dict]:
    """Create the user row if absent, otherwise refresh the mutable fields.

    account_type is only applied on insert so an existing preference is never
    overwritten by a later sync.
    """
    eng = pg.engine()
    if eng is None:
        return None
    with eng.begin() as conn:
        conn.execute(
            text(
                """
                INSERT INTO public."user"
                    (id, email, full_name, company_name, role, account_type,
                     onboarding_completed, created_at)
                VALUES
                    (:id, :email, :full_name, :company_name, :role,
                     :account_type, false, now())
                ON CONFLICT (id) DO UPDATE SET
                    email = EXCLUDED.email,
                    full_name = EXCLUDED.full_name,
                    company_name = COALESCE(EXCLUDED.company_name,
                                            public."user".company_name)
                """
            ),
            {
                "id": uid,
                "email": email,
                "full_name": full_name,
                "company_name": company_name,
                "role": role,
                "account_type": account_type or "applicant",
            },
        )
    return get_user(uid)


def set_account_type(uid: str, account_type: str) -> Optional[dict]:
    """Persist the bidder/issuer choice. Returns the updated row, or None."""
    eng = pg.engine()
    if eng is None:
        return None
    with eng.begin() as conn:
        conn.execute(
            text(
                'UPDATE public."user" SET account_type = :t WHERE id = :id'
            ),
            {"t": account_type, "id": uid},
        )
    return get_user(uid)


def update_user(
    uid: str,
    company_name: Optional[str] = None,
    onboarding_completed: Optional[bool] = None,
) -> Optional[dict]:
    """Update only the profile fields provided, leaving the rest untouched.

    account_type deliberately has no parameter here: it goes through
    set_account_type, which every write path must route through so the
    explicit bidder/issuer choice is never clobbered by a partial update.
    """
    eng = pg.engine()
    if eng is None:
        return None
    sets, params = [], {"id": uid}
    if company_name is not None:
        sets.append("company_name = :company_name")
        params["company_name"] = company_name
    if onboarding_completed is not None:
        sets.append("onboarding_completed = :onboarding_completed")
        params["onboarding_completed"] = onboarding_completed
    if sets:
        with eng.begin() as conn:
            conn.execute(
                text(
                    f'UPDATE public."user" SET {", ".join(sets)} WHERE id = :id'
                ),
                params,
            )
    return get_user(uid)


def count_users() -> Optional[int]:
    eng = pg.engine()
    if eng is None:
        return None
    with eng.connect() as conn:
        return conn.execute(
            text('SELECT count(*) FROM public."user"')
        ).scalar()