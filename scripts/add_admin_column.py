"""
scripts/add_admin_column.py

One-time, idempotent migration: add an is_admin flag to user_creds in the auth DB.
Super-admins (is_admin=true) are the only users who can see the User-Management
tab and call the /api/admin/* endpoints.

    python scripts/add_admin_column.py
"""
from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "backend" / "src"))

from sqlalchemy import text  # noqa: E402
from utils.db_conn import get_engine  # noqa: E402


def main() -> int:
    eng = get_engine("auth")
    with eng.begin() as c:
        c.execute(text(
            "ALTER TABLE user_creds "
            "ADD COLUMN IF NOT EXISTS is_admin BOOLEAN NOT NULL DEFAULT false"
        ))
        n_admin = c.execute(text("SELECT COUNT(*) FROM user_creds WHERE is_admin")).scalar()
        n_total = c.execute(text("SELECT COUNT(*) FROM user_creds")).scalar()
    print(f"is_admin column ensured. {n_admin} admin(s) of {n_total} user(s).")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
