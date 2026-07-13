"""
scripts/apply_snapshot_upserts.py

Apply the INSERT ... ON CONFLICT upserts from scripts/snapshot_upsert.sql to the
KPI database ('aact'). Run scripts/generate_snapshot_sql.py first to (re)build
that file from the current auth-DB access profiles.

Only the UPSERT statements are executed — the DDL/SCHEMA section is skipped
because the app DB user lacks table-ALTER ownership (the schema already exists).
A quote-aware splitter is used because condition-name string literals contain
semicolons and escaped single quotes.

USAGE
    python scripts/apply_snapshot_upserts.py
"""
from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "backend" / "src"))
from utils.db_conn import get_engine  # noqa: E402

SQL_FILE = ROOT / "scripts" / "snapshot_upsert.sql"


def split_statements(sql: str) -> list[str]:
    """Split on semicolons outside single-quoted literals ('' = escaped quote)."""
    stmts, buf, in_str = [], [], False
    i, n = 0, len(sql)
    while i < n:
        ch = sql[i]
        if ch == "'":
            if in_str and i + 1 < n and sql[i + 1] == "'":
                buf.append("''")
                i += 2
                continue
            in_str = not in_str
            buf.append(ch)
        elif ch == ";" and not in_str:
            stmts.append("".join(buf).strip())
            buf = []
        else:
            buf.append(ch)
        i += 1
    tail = "".join(buf).strip()
    if tail:
        stmts.append(tail)
    return stmts


def _is_insert(stmt: str) -> bool:
    """True if the first non-comment, non-blank line begins an INSERT."""
    for line in stmt.splitlines():
        s = line.strip()
        if not s or s.startswith("--"):
            continue
        return s.upper().startswith("INSERT")
    return False


def main() -> int:
    if not SQL_FILE.exists():
        print(f"Missing {SQL_FILE}. Run scripts/generate_snapshot_sql.py first.")
        return 1

    statements = split_statements(SQL_FILE.read_text(encoding="utf-8"))
    inserts = [s for s in statements if _is_insert(s)]
    print(f"Parsed {len(statements)} statements; {len(inserts)} INSERT upserts to apply.")

    eng = get_engine("aact")
    with eng.begin() as conn:
        conn.exec_driver_sql("SET statement_timeout = '300s'")
        for stmt in inserts:
            conn.exec_driver_sql(stmt)
    print(f"Applied {len(inserts)} upserts to public.overview_kpis_snapshot.")

    with eng.connect() as conn:
        rows = conn.exec_driver_sql(
            "SELECT scope_key, total_trials FROM public.overview_kpis_snapshot ORDER BY scope_key"
        ).fetchall()
    print(f"\nSnapshot now holds {len(rows)} scope rows:")
    for sk, tt in rows:
        label = sk if len(sk) <= 55 else sk[:52] + "..."
        print(f"  {label:<55}  total_trials={tt}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
