"""Exercise pg_store against the live Data Connect `public.user` table.

Injects a Cloud SQL connector engine (IAM auth via the active gcloud account)
into the pg module so pg_store's read/write path is tested end-to-end against
the real table, without needing a local Postgres or opening the instance to the
internet.
"""
import datetime
import os
import subprocess
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import google.auth.credentials as google_credentials
from google.cloud.sql.connector import Connector, IPTypes
from sqlalchemy import create_engine, text

INSTANCE = "tender-management-flow:europe-west1:tmflow-db"
USER = "youthdevelopers4ir@gmail.com"
DB = "tmflow"


class StaticToken(google_credentials.Credentials):
    def __init__(self, token: str):
        super().__init__()
        self.token = token
        self.expiry = datetime.datetime.utcnow() + datetime.timedelta(minutes=50)

    def refresh(self, request):
        pass

    def with_scopes(self, scopes, default_scopes=None):
        return self

    def with_quota_project(self, quota_project_id):
        return self

    @property
    def valid(self):
        return True

    @property
    def expired(self):
        return False


def main() -> int:
    token = subprocess.check_output(
        "gcloud.cmd auth print-access-token", shell=True, text=True
    ).strip()
    connector = Connector(credentials=StaticToken(token))

    def getconn():
        return connector.connect(
            INSTANCE, "pg8000", user=USER, db=DB,
            enable_iam_auth=True, ip_type=IPTypes.PUBLIC,
        )

    eng = create_engine("postgresql+pg8000://", creator=getconn, future=True)

    import pg
    import pg_store

    pg._engine = eng  # inject so pg_store talks to this engine

    uid = "verify-pg-store-foundation"
    with eng.begin() as conn:
        conn.execute(text('DELETE FROM public."user" WHERE id = :id'), {"id": uid})

    created = pg_store.upsert_user(
        uid, "verify@example.com", "Verify User", account_type="applicant"
    )
    print("created:", created)
    assert created["email"] == "verify@example.com", created
    assert created["account_type"] == "applicant", created

    updated = pg_store.set_account_type(uid, "issuer")
    print("after set_account_type:", updated["account_type"])
    assert updated["account_type"] == "issuer"

    pg_store.upsert_user(uid, "verify@example.com", "Verify User", account_type="applicant")
    after = pg_store.get_user(uid)
    print("preference sticky after re-upsert:", after["account_type"])
    assert after["account_type"] == "issuer"

    print("user_count:", pg_store.count_users())

    with eng.begin() as conn:
        conn.execute(text('DELETE FROM public."user" WHERE id = :id'), {"id": uid})
    print("cleaned up")
    connector.close()
    print("PASS: pg_store maps to the live Data Connect user table")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())