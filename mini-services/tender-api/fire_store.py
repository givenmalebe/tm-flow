"""
Firebase Storage for uploaded documents.

Uploads used to be written to the container's disk, which Cloud Run wipes on
every deploy. Files now go to the project's Firebase Storage bucket so a
tender document, compliance certificate or bid attachment survives restarts and
redeploys.

Storage returns a path of the form "gs/<bucket>/<object>" (or a plain object
path); `read_bytes` turns that back into content for downloads and bundling.
Local disk remains a fallback so the service still works if the bucket is
temporarily unreachable.
"""
import io
import os
import uuid
from pathlib import Path
from typing import Optional, Tuple

import firebase_admin
from firebase_admin import credentials, storage as fb_storage

_BUCKET_NAME = os.environ.get(
    "FIREBASE_STORAGE_BUCKET", "tender-management-flow.firebasestorage.app"
)
_app = None
_bucket = None
_storage_failed = False


def _init():
    """Initialise the Firebase Admin app/bucket once, lazily."""
    global _app, _bucket, _storage_failed
    if _bucket is not None:
        return _bucket
    if _storage_failed:
        return None
    try:
        if not firebase_admin._apps:
            # Cloud Run provides GOOGLE_APPLICATION_CREDENTIALS; locally we fall
            # back to the service account JSON if one is configured.
            cred_path = os.environ.get("GOOGLE_APPLICATION_CREDENTIALS")
            if cred_path and os.path.isfile(cred_path):
                firebase_admin.initialize_app(credentials.Certificate(cred_path))
            else:
                firebase_admin.initialize_app()
        _app = firebase_admin.get_app()
        _bucket = _app.storage(bucket=_BUCKET_NAME)
        return _bucket
    except Exception:
        _storage_failed = True
        _bucket = None
        return None


def is_configured() -> bool:
    return _init() is not None


def bucket_name() -> str:
    return _BUCKET_NAME


def _object_path(subdir: str, filename: str) -> str:
    safe = f"{uuid.uuid4().hex}_{Path(filename).name}"
    return f"{subdir.rstrip('/')}/{safe}" if subdir else safe


def save_bytes(data: bytes, filename: str, subdir: str = "", content_type: Optional[str] = None) -> str:
    """Store bytes and return a retrievable reference."""
    bucket = _init()
    obj_path = _object_path(subdir, filename)
    if bucket is not None:
        try:
            blob = bucket.blob(obj_path)
            blob.upload_from_string(data, content_type=content_type or "application/octet-stream")
            return f"gs/{_BUCKET_NAME}/{obj_path}"
        except Exception:
            # Fall through to local disk rather than losing the upload.
            pass
    return _save_local(data, filename, subdir)


def _save_local(data: bytes, filename: str, subdir: str) -> str:
    upload_dir = os.environ.get("UPLOAD_DIR", "uploads")
    target_dir = os.path.join(upload_dir, subdir) if subdir else upload_dir
    os.makedirs(target_dir, exist_ok=True)
    safe_name = f"{uuid.uuid4().hex}_{Path(filename).name}"
    target_path = os.path.join(target_dir, safe_name)
    with open(target_path, "wb") as out:
        out.write(data)
    return os.path.relpath(target_path, upload_dir)


def save_fileobj(fileobj, filename: str, subdir: str = "",
                 content_type: Optional[str] = None) -> str:
    """Store an uploaded file object and return a retrievable reference."""
    data = fileobj.read()
    return save_bytes(data, filename, subdir, content_type or getattr(fileobj, "content_type", None))


def read_bytes(reference: str) -> Optional[Tuple[bytes, str]]:
    """Return (content, content_type) for a stored reference, or None."""
    if not reference:
        return None
    bucket = _init()
    if reference.startswith("gs://"):
        obj_path = reference[len(f"gs://{_BUCKET_NAME}/"):]
    elif reference.startswith("gs/"):
        obj_path = reference.split("/", 2)[-1]
    else:
        obj_path = None

    if bucket is not None and obj_path:
        try:
            blob = bucket.blob(obj_path)
            if blob.exists():
                return blob.download_as_bytes(), (
                    blob.content_type or "application/octet-stream"
                )
        except Exception:
            pass

    # Local fallback.
    upload_dir = os.environ.get("UPLOAD_DIR", "uploads")
    full = os.path.join(upload_dir, reference)
    if os.path.isfile(full):
        import mimetypes

        ctype = mimetypes.guess_type(full)[0] or "application/octet-stream"
        with open(full, "rb") as fh:
            return fh.read(), ctype
    return None


def exists(reference: str) -> bool:
    return read_bytes(reference) is not None