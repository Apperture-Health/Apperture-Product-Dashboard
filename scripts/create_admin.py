"""
scripts/create_admin.py

Create (or promote) a super-admin — the only account that can see the User
Management tab and call the /api/admin/* endpoints. Idempotent per username.

    python scripts/create_admin.py <username> <password> [display_name]

Example:
    python scripts/create_admin.py superadmin "S3cure#Pass" "Platform Admin"

The admin sees ONLY the User Management tab (tab/disease config is irrelevant and
left empty). Run scripts/add_admin_column.py first if is_admin doesn't exist yet.
"""
from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "backend" / "src"))

from data import auth_admin  # noqa: E402


def main(argv: list[str]) -> int:
    if len(argv) < 3:
        print(__doc__)
        return 2
    username, password = argv[1], argv[2]
    display_name = argv[3] if len(argv) > 3 else username

    auth_admin.upsert_user(
        username=username,
        password=password,
        display_name=display_name,
        is_active=True,
        is_admin=True,
        tabs=None,             # irrelevant for admins (gating overrides)
        disease_areas=None,
    )
    print(f"Super-admin {username!r} created/updated (is_admin=true, active).")
    print("This account sees ONLY the User Management tab.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
