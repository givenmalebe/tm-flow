import sqlite3
import os

DB = os.path.join(os.path.dirname(__file__), "..", "mini-services", "tender-api", "tender.db")

con = sqlite3.connect(DB)
cur = con.cursor()

tables = [
    r[0]
    for r in cur.execute(
        "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'"
    )
]

total = 0
for t in sorted(tables):
    n = cur.execute(f'SELECT COUNT(*) FROM "{t}"').fetchone()[0]
    total += n
    print(f"{t:24} {n:>8}")

print(f"{'TOTAL ROWS':24} {total:>8}")
print(f"{'DB SIZE':24} {os.path.getsize(DB):>8} bytes")
con.close()
