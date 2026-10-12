"""
TenderFlow - Authentication utilities

Identity is owned by Firebase Auth. Incoming requests carry a Firebase ID token
(RS256, signed by Google) rather than a token this service minted. The token is
verified with firebase-admin, and the Firebase UID is mapped onto the local
users row via users.firebase_uid (email is only a fallback for rows predating
the Data Connect migration). The Data Connect Postgres row is the source of
truth for identity fields; the SQLite row shadows it.

This file replaced an implementation that signed its own HS256 JWT and fell back
to a secret committed to the repository.
"""
import os
from typing import Optional

import firebase_admin
from firebase_admin import auth as firebase_auth
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.orm import Session

from database import User, get_db

_CREDENTIALS_INITIALISED = False


def _get_app() -> Optional[firebase_admin.App]:
    """
    Initialise the Firebase Admin app once.

    GOOGLE_APPLICATION_CREDENTIALS points at a service-account key where one is
    available. On Cloud Run, Application Default Credentials resolve the
    attached service account automatically. Without either, the app still
    initialises but verification fails, which surfaces as a 401 rather than a
    crash at import time.
    """
    global _CREDENTIALS_INITIALISED
    if _CREDENTIALS_INITIALISED:
        try:
            return firebase_admin.get_app()
        except ValueError:
            return None

    try:
        credential_path = os.environ.get("GOOGLE_APPLICATION_CREDENTIALS")
        if credential_path and os.path.isfile(credential_path):
            cred = firebase_admin.credentials.Certificate(credential_path)
            return firebase_admin.initialize_app(cred)
        return firebase_admin.initialize_app()
    except Exception:
        return None
    finally:
        _CREDENTIALS_INITIALISED = True


# Placeholder so Swagger UI keeps an authorize button; the real value is a
# Firebase ID token.
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/login", auto_error=False)


def _unauthorized() -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )


def verify_firebase_token(token: str) -> dict:
    """Verify a Firebase ID token and return its decoded claims."""
    app = _get_app()
    if app is None:
        raise _unauthorized()
    try:
        return firebase_auth.verify_id_token(token, app=app)
    except Exception:
        raise _unauthorized()


def _uid_from_claims(claims: dict) -> Optional[str]:
    """The Firebase UID appears under several claim keys depending on SDK."""
    return claims.get("user_id") or claims.get("uid") or claims.get("sub")


def _sync_shadow_from_postgres(db: Session, user: User, uid: str) -> None:
    """Fold the Postgres identity fields into the SQLite shadow row.

    The Data Connect `public.user` row is the source of truth the UI reads;
    the REST endpoints still read SQLite, so the shadow is refreshed here to
    keep both stores telling the same story. Postgres is not a hard dependency:
    when it is unreachable the shadow row serves the request alone.
    """
    try:
        import pg_store

        pg_user = pg_store.get_user(uid)
        if pg_user is None:
            # First authenticated request for this Firebase account: create
            # the Postgres row so both stores exist from the start.
            pg_store.upsert_user(
                uid,
                email=user.email,
                full_name=user.full_name,
                company_name=user.company_name,
                role=user.role or "admin",
            )
            return
        changed = False
        if (
            pg_user.get("account_type") in ("applicant", "issuer")
            and user.account_type != pg_user["account_type"]
        ):
            user.account_type = pg_user["account_type"]
            changed = True
        if pg_user.get("onboarding_completed") and not user.onboarding_completed:
            user.onboarding_completed = True
            changed = True
        if pg_user.get("company_name") and not user.company_name:
            user.company_name = pg_user["company_name"]
            changed = True
        if changed:
            db.commit()
            db.refresh(user)
    except Exception:
        pass


def get_current_user(
    token: Optional[str] = Depends(oauth2_scheme),
    db: Session = Depends(get_db),
) -> User:
    """
    Resolve the caller from their Firebase ID token.

    The Firebase UID is the primary key of the Data Connect `user` table and is
    kept on the legacy SQLite row (`users.firebase_uid`), so lookup is by UID
    first; rows predating the column are matched by email and backfilled on
    their first authenticated request.

    The request-scoped `db` session must be injected here. Returning an object
    from a session that is then closed leaves the caller holding a detached
    instance, and every endpoint that writes to the user — such as
    /auth/complete-onboarding — fails with "Instance is not persistent within
    this Session".
    """
    if not token:
        raise _unauthorized()

    claims = verify_firebase_token(token)
    email = claims.get("email")
    uid = _uid_from_claims(claims)
    if not email:
        raise _unauthorized()

    user = None
    if uid:
        user = db.query(User).filter(User.firebase_uid == uid).first()
    if user is None:
        user = db.query(User).filter(User.email == email).first()
        if user is not None and uid and not user.firebase_uid:
            user.firebase_uid = uid
            db.commit()
            db.refresh(user)
    if user is None:
        # A Firebase account with no local row: create one so the existing
        # endpoints have something to attach records to.
        user = User(
            email=email,
            full_name=claims.get("name") or email.split("@")[0],
            hashed_password="",
            role=claims.get("role") or "admin",
            account_type="applicant",
            firebase_uid=uid,
        )
        db.add(user)
        db.commit()
        db.refresh(user)

    if uid:
        _sync_shadow_from_postgres(db, user, uid)
    return user


def get_current_claims(token: Optional[str] = Depends(oauth2_scheme)) -> dict:
    """Return the verified Firebase claims, or raise 401.

    Endpoints that need the Firebase UID (which is not stored on the legacy
    SQLite user row) depend on this alongside get_current_user.
    """
    if not token:
        raise _unauthorized()
    return verify_firebase_token(token)


def get_optional_user(
    token: Optional[str] = Depends(oauth2_scheme),
    db: Session = Depends(get_db),
) -> Optional[User]:
    """Same as get_current_user but returns None instead of raising."""
    if not token:
        return None
    try:
        return get_current_user(token, db)
    except HTTPException:
        return None
