"""Dump the physical Postgres schema that Data Connect generated.

Run:  python tools/inspect_dc_schema.py
Uses the Cloud SQL Python Connector with IAM database authentication, reusing the
active gcloud user's access token (no password, no ADC needed for a one-off).
"""
import subprocess
import sys

import datetime
import os

import google.auth.credentials as google_credentials
from google.cloud.sql.connector import Connector, IPTypes

INSTANCE = "tender-management-flow:europe-west1:tmflow-db"
USER = "youthdevelopers4ir@gmail.com"
DB = "tmflow"


class StaticToken(google_credentials.Credentials):
    """Credentials that hand back a fixed access token and survive copying.

    The connector calls ``with_scopes`` before refreshing; returning ``self``
    keeps the token instead of building a fresh credential with no token.
    """

    def __init__(self, token: str):
        super().__init__()
        self.token = token
        self.expiry = datetime.datetime.utcnow() + datetime.timedelta(minutes=50)

    def refresh(self, request):  # pragma: no cover - one-off helper
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
    # The connector always needs Google credentials to call the SQL Admin API.
    # In admin mode those are separate from the DB login (postgres + password).
    token = subprocess.check_output(
        "gcloud.cmd auth print-access-token", shell=True, text=True
    ).strip()
    creds = StaticToken(token)

    admin_password = os.environ.get("PG_ADMIN_PASSWORD")
    if admin_password:
        user = os.environ.get("PG_ADMIN_USER", "postgres")
        enable_iam = False
        password = admin_password
    else:
        user = USER
        enable_iam = True
        password = None

    connector = Connector(credentials=creds)
    try:
        conn = connector.connect(
            INSTANCE,
            "pg8000",
            user=user,
            password=password,
            db=DB,
            enable_iam_auth=enable_iam,
            ip_type=IPTypes.PUBLIC,
        )
    except Exception as exc:  # noqa: BLE001
        print(f"connect failed: {exc}", file=sys.stderr)
        return 1

    cur = conn.cursor()

    print("=== relation kind / table ===")
    cur.execute(
        """
        SELECT c.relkind, n.nspname, c.relname
        FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname NOT IN ('pg_catalog', 'information_schema')
          AND c.relkind IN ('r', 'p', 'v')
        ORDER BY n.nspname, c.relname
        """
    )
    rels = cur.fetchall()
    for kind, schema, name in rels:
        print(f"  {kind}  {schema}.{name}")

    print("\n=== columns ===")
    cur.execute(
        """
        SELECT table_schema, table_name, ordinal_position, column_name,
               data_type, is_nullable, column_default
        FROM information_schema.columns
        WHERE table_schema NOT IN ('pg_catalog', 'information_schema')
        ORDER BY table_schema, table_name, ordinal_position
        """
    )
    for schema, table, pos, col, dtype, nullable, default in cur.fetchall():
        print(
            f"  {schema}.{table} :: {col} {dtype} "
            f"{'NULL' if nullable == 'YES' else 'NOT NULL'} default={default}"
        )

    print("\n=== primary keys ===")
    cur.execute(
        """
        SELECT tc.table_schema, tc.table_name, kcu.column_name
        FROM information_schema.table_constraints tc
        JOIN information_schema.key_column_usage kcu
          ON tc.constraint_name = kcu.constraint_name
         AND tc.table_schema = kcu.table_schema
        WHERE tc.constraint_type = 'PRIMARY KEY'
          AND tc.table_schema NOT IN ('pg_catalog', 'information_schema')
        ORDER BY 1, 2, kcu.ordinal_position
        """
    )
    for schema, table, col in cur.fetchall():
        print(f"  {schema}.{table} :: {col}")

    print("\n=== foreign keys ===")
    cur.execute(
        """
        SELECT tc.table_schema, tc.table_name, kcu.column_name,
               ccu.table_name AS ref_table, ccu.column_name AS ref_column
        FROM information_schema.table_constraints tc
        JOIN information_schema.key_column_usage kcu
          ON tc.constraint_name = kcu.constraint_name
         AND tc.table_schema = kcu.table_schema
        JOIN information_schema.constraint_column_usage ccu
          ON ccu.constraint_name = tc.constraint_name
         AND ccu.table_schema = tc.table_schema
        WHERE tc.constraint_type = 'FOREIGN KEY'
          AND tc.table_schema NOT IN ('pg_catalog', 'information_schema')
        ORDER BY 1, 2
        """
    )
    for schema, table, col, ref_table, ref_col in cur.fetchall():
        print(f"  {schema}.{table}.{col} -> {ref_table}.{ref_col}")

    print("\n=== row counts ===")
    for kind, schema, name in rels:
        if kind != "r":
            continue
        try:
            cur.execute(f'SELECT count(*) FROM "{schema}"."{name}"')
            print(f"  {schema}.{name}: {cur.fetchone()[0]}")
        except Exception as exc:  # noqa: BLE001
            print(f"  {schema}.{name}: (count failed: {exc})")

    cur.close()
    conn.close()
    connector.close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())