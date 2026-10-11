"""Mapping tests for the Data Connect-owned `public.user` table.

These prove the FastAPI service can read and write the Postgres row that the
frontend's Data Connect SDK owns. They require a real Postgres and are skipped
unless TEST_DATABASE_URL is set, e.g.:

    docker run --rm -e POSTGRES_PASSWORD=pg -p 5432:5432 postgres:16
    set TEST_DATABASE_URL=postgresql+pg8000://postgres:pg@localhost:5432/postgres
    python -m pytest tests/test_pg_user_store.py -q
"""
import os

import pytest
from sqlalchemy import text

TEST_DATABASE_URL = os.environ.get("TEST_DATABASE_URL")

pytestmark = pytest.mark.skipif(
    not TEST_DATABASE_URL,
    reason="TEST_DATABASE_URL not set; Postgres mapping tests skipped",
)

_USER_DDL = """
CREATE TABLE IF NOT EXISTS public."user" (
    id text PRIMARY KEY,
    email text NOT NULL,
    full_name text NOT NULL,
    company_name text,
    role text NOT NULL DEFAULT 'admin',
    account_type text NOT NULL DEFAULT 'applicant',
    onboarding_completed boolean NOT NULL DEFAULT false,
    created_at timestamptz NOT NULL DEFAULT now()
)
"""


def _bind():
    os.environ["DATABASE_URL"] = TEST_DATABASE_URL
    import pg

    pg.reset()
    eng = pg.engine()
    assert eng is not None, "engine should be configured from DATABASE_URL"
    with eng.begin() as conn:
        conn.execute(text(_USER_DDL))
    return eng


def test_user_roundtrip_and_preference_is_sticky():
    eng = _bind()
    import pg_store

    uid = "test-uid-foundation-roundtrip"
    with eng.begin() as conn:
        conn.execute(text('DELETE FROM public."user" WHERE id = :id'), {"id": uid})

    created = pg_store.upsert_user(
        uid, "found@example.com", "Found Er", account_type="applicant"
    )
    assert created["email"] == "found@example.com"
    assert created["account_type"] == "applicant"
    assert created["onboarding_completed"] is False

    fetched = pg_store.get_user(uid)
    assert fetched["full_name"] == "Found Er"

    updated = pg_store.set_account_type(uid, "issuer")
    assert updated["account_type"] == "issuer"

    # A later sync must not clobber the stored preference.
    pg_store.upsert_user(uid, "found@example.com", "Found Er", account_type="applicant")
    assert pg_store.get_user(uid)["account_type"] == "issuer"

    assert pg_store.count_users() >= 1

    with eng.begin() as conn:
        conn.execute(text('DELETE FROM public."user" WHERE id = :id'), {"id": uid})
