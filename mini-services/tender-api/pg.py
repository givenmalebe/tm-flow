"""Postgres connection for the tmflow Cloud SQL instance.

The database schema is owned by Firebase Data Connect (see
`dataconnect/schema/schema.gql`); this module lets the FastAPI service read and
write those same tables so AI/scraper/submission logic and the frontend's Data
Connect SDK operate on one source of truth.

Authentication uses Cloud SQL IAM database auth: no password is stored. The
connector resolves the service account's credentials from Application Default
Credentials on Cloud Run and the local gcloud account off it.

Two connection modes:
  * DATABASE_URL set        -> connect directly (local dev, mapping tests)
  * CLOUDSQL_INSTANCE/USER  -> connect through the Cloud SQL Python Connector

Configuration (read dynamically, so tests can change it):

    DATABASE_URL        a full SQLAlchemy URL (overrides everything below)
    CLOUDSQL_INSTANCE   project:region:instance   (required to enable)
    CLOUDSQL_DB         database name             (default "tmflow")
    CLOUDSQL_USER       IAM principal (email)     (required to enable)
    CLOUDSQL_IAM        "true"/"false"            (default "true")
    CLOUDSQL_IP_TYPE    "public"/"private"        (default "public")
"""
from __future__ import annotations

import os
from typing import Optional

from sqlalchemy import create_engine, text
from sqlalchemy.engine import Engine

_engine: Optional[Engine] = None
_failed = False
_connector = None


def _config() -> dict:
    return {
        "url": os.environ.get("DATABASE_URL"),
        "instance": os.environ.get("CLOUDSQL_INSTANCE"),
        "db": os.environ.get("CLOUDSQL_DB", "tmflow"),
        "user": os.environ.get("CLOUDSQL_USER"),
        "iam": os.environ.get("CLOUDSQL_IAM", "true").strip().lower() != "false",
        "ip_type": os.environ.get("CLOUDSQL_IP_TYPE", "public").strip().lower(),
    }


def is_configured() -> bool:
    """True when enough config exists to attempt a Postgres connection."""
    cfg = _config()
    return bool(cfg["url"] or (cfg["instance"] and cfg["user"]))


def _build() -> Engine:
    global _connector
    cfg = _config()

    if cfg["url"]:
        # Direct connection (local dev / mapping tests): no connector needed.
        return create_engine(cfg["url"], pool_pre_ping=True, future=True)

    from google.cloud.sql.connector import Connector, IPTypes

    _connector = Connector()
    ip_type = IPTypes.PRIVATE if cfg["ip_type"] == "private" else IPTypes.PUBLIC

    def getconn():
        return _connector.connect(
            cfg["instance"],
            "pg8000",
            user=cfg["user"],
            db=cfg["db"],
            enable_iam_auth=cfg["iam"],
            ip_type=ip_type,
        )

    return create_engine(
        "postgresql+pg8000://",
        creator=getconn,
        pool_pre_ping=True,
        pool_recycle=1800,
        future=True,
    )


def engine() -> Optional[Engine]:
    """Return a lazily-created engine, or None when unavailable."""
    global _engine, _failed
    if _engine is not None:
        return _engine
    if _failed or not is_configured():
        return None
    try:
        _engine = _build()
    except Exception:
        _failed = True
        return None
    return _engine


def ping() -> bool:
    """Cheap liveness check against the database."""
    eng = engine()
    if eng is None:
        return False
    try:
        with eng.connect() as conn:
            conn.execute(text("SELECT 1"))
        return True
    except Exception:
        return False


def reset() -> None:
    """Drop the cached engine so config changes take effect (used by tests)."""
    global _engine, _failed, _connector
    if _engine is not None:
        try:
            _engine.dispose()
        except Exception:
            pass
    _engine = None
    _failed = False
    _connector = None