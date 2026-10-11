"""Run SQL against the tmflow Postgres database as the built-in postgres user.

Usage:
    set PG_ADMIN_PASSWORD=...
    python tools/pg_admin.py "SELECT 1"
    python tools/pg_admin.py --file grants.sql

The connector always needs Google credentials to reach the SQL Admin API; those
come from the active gcloud account's access token (no ADC required).
"""
import argparse
import datetime
import os
import subprocess
import sys

import google.auth.credentials as google_credentials
from google.cloud.sql.connector import Connector, IPTypes

INSTANCE = "tender-management-flow:europe-west1:tmflow-db"
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
    def valid(self) -> bool:
        return True

    @property
    def expired(self) -> bool:
        return False


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("sql", nargs="?", help="SQL to run")
    parser.add_argument("--file", help="Read SQL from a file instead")
    args = parser.parse_args()

    if args.file:
        with open(args.file, "r", encoding="utf-8") as fh:
            statements = fh.read()
    elif args.sql:
        statements = args.sql
    else:
        print("no SQL provided", file=sys.stderr)
        return 2

    password = os.environ.get("PG_ADMIN_PASSWORD")
    if not password:
        print("PG_ADMIN_PASSWORD is required", file=sys.stderr)
        return 2

    token = subprocess.check_output(
        "gcloud.cmd auth print-access-token", shell=True, text=True
    ).strip()
    connector = Connector(credentials=StaticToken(token))
    conn = connector.connect(
        INSTANCE,
        "pg8000",
        user="postgres",
        password=password,
        db=DB,
        enable_iam_auth=False,
        ip_type=IPTypes.PUBLIC,
    )
    cur = conn.cursor()
    for chunk in [s.strip() for s in statements.split(";") if s.strip()]:
        cur.execute(chunk)
        if cur.description:
            rows = cur.fetchall()
            for row in rows:
                print("  " + " | ".join(str(v) for v in row))
            print(f"(ok: {len(rows)} row(s))")
        else:
            print(f"OK: {chunk.splitlines()[0][:80]}")
    conn.commit()
    cur.close()
    conn.close()
    connector.close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())