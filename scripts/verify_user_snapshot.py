"""
scripts/verify_user_snapshot.py

Verify that one or more users are fully wired up: their access resolves, and the
Home-KPI snapshot has a row for their exact access scope (so they load scoped
KPIs, not the 'global' fallback).

USAGE
    python scripts/verify_user_snapshot.py                 # all active users
    python scripts/verify_user_snapshot.py PFE005 PFE006   # specific users

Exit code is non-zero if any requested user is missing, inactive, or has no
matching snapshot row.
"""
from __future__ import annotations

import sys
from pathlib import Path

# Windows consoles default to cp1252 and crash on the ✅/⚠️ marks this script prints.
try:
    sys.stdout.reconfigure(encoding="utf-8")
except Exception:
    pass

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "backend" / "src"))

from data.auth_repository import get_access_dict, list_usernames  # noqa: E402
from utils.auth import get_allowed_tabs_for_user  # noqa: E402
from utils.filters import build_allowed_indications, build_allowed_atc_classes  # noqa: E402
from utils.db_conn import get_engine  # noqa: E402

# Reuse the exact key builder used by the generator/runtime.
sys.path.insert(0, str(ROOT / "scripts"))
from generate_snapshot_sql import build_scope_key  # noqa: E402


def snapshot_keys() -> dict[str, int]:
    eng = get_engine("aact")
    with eng.connect() as conn:
        rows = conn.exec_driver_sql(
            "SELECT scope_key, total_trials FROM public.overview_kpis_snapshot"
        ).fetchall()
    return {sk: tt for sk, tt in rows}


def main(argv: list[str]) -> int:
    requested = argv[1:] or list_usernames()
    keys = snapshot_keys()
    all_ok = True

    for username in requested:
        cfg = get_access_dict(username)
        if not cfg:
            print(f"❌ {username}: not found or inactive in auth DB.")
            all_ok = False
            continue

        da = build_allowed_indications(cfg)
        dc = build_allowed_atc_classes(cfg)
        scope_key = build_scope_key(da, dc)
        tabs = get_allowed_tabs_for_user(username)

        present = scope_key in keys
        source = "snapshot" if present else "GLOBAL FALLBACK"
        total = keys.get(scope_key, keys.get("global"))
        mark = "✅" if present else "⚠️ "
        if not present:
            all_ok = False

        da_desc = "unrestricted" if da is None else f"{len(da)} disease area(s)"
        dc_desc = "" if dc is None else f", {len(dc)} drug class(es)"
        print(f"{mark} {username:10} tabs={len(tabs):2}  {da_desc}{dc_desc}  "
              f"kpiSource={source}  total_trials={total}")

    print("\nAll requested users have their own snapshot row." if all_ok
          else "\nSome users are missing a snapshot row — run generate + apply.")
    return 0 if all_ok else 1


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
