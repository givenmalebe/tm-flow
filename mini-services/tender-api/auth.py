"""
TenderFlow - Authentication utilities

Identity is owned by Firebase Auth. Incoming requests carry a Firebase ID token
(RS256, signed by Google) rather than a token this service minted. The token is
verified with firebase-admin, and the Firebase UID is mapped onto the local
users row by email.

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


def get_current_user(
    token: Optional[str] = Depends(oauth2_scheme),
    db: Session = Depends(get_db),
) -> User:
    """
    Resolve the caller from their Firebase ID token.

    Lookup is by email because the local users table predates Firebase Auth and
    is keyed by integer id. Once these REST endpoints are retired in favour of
    SQL Connect, this indirection disappears.

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
    if not email:
        raise _unauthorized()

    user = db.query(User).filter(User.email == email).first()
    if user is None:
        # A Firebase account with no local row: create one so the existing
        # endpoints have something to attach records to.
        user = User(
            email=email,
            full_name=claims.get("name") or email.split("@")[0],
            hashed_password="",
            role=claims.get("role") or "admin",
            account_type="applicant",
        )
        db.add(user)
        db.commit()
        db.refresh(user)
    return user


def get_optional_user(token: Optional[str] = Depends(oauth2_scheme)) -> Optional[User]:
    """Same as get_current_user but returns None instead of raising."""
    if not token:
        return None
    try:
        return get_current_user(token)
    except HTTPException:
        return None
