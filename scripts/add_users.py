"""
scripts/add_users.py

Create or update one or more dashboard users in the `auth` database, with full
validation against the live catalogs. Idempotent per username (safe to re-run).

Writes to the four split auth tables (see backend/src/data/auth_repository.py):
    user_creds          (username PK, password, display_name, is_active)
    user_tabs           (username, tab,          mode)   mode in ('include','exclude')
    user_disease_areas  (username, disease_area, mode)
    user_drug_classes   (username, drug_class,   mode)

It does NOT touch the KPI snapshot — run scripts/generate_snapshot_sql.py and
scripts/apply_snapshot_upserts.py afterwards so each new access profile gets its
own precomputed Home-KPI row (otherwise those users fall back to the 'global' row).

USAGE
    python scripts/add_users.py path/to/spec.json
    python scripts/add_users.py -            # read the JSON spec from stdin
    python scripts/add_users.py path/to/spec.json --dry-run   # validate only, no writes

SPEC FORMAT (JSON)
{
  "password_default": "password#1234",         // optional; per-user "password" overrides
  "users": [
    {
      "username": "PFE005",                     // required, unique
      "password": "s3cret",                     // optional -> password_default
      "display_name": "Pfizer Analyst",         // optional -> username
      "active": true,                           // optional -> true
      "disease_areas": {                        // optional; omit => no disease restriction
        "mode": "include",                      // "include" (allow-list) | "exclude" (deny-list)
        "values": ["Breast Cancer", "Lung Cancer"]
      },
      "tabs": {                                 // optional; omit => all tabs visible
        "mode": "exclude",
        "values": ["Drug Pricing"]
      }
    }
  ]
}

Notes on modes:
  - disease_areas / tabs each accept mode "include" or "exclude".
  - include = allow-list (only these). exclude = everything except these.
  - Omitting a block entirely = no restriction for that attribute.
  - Tab names may be given with or without the leading emoji ("Drug Pricing"
    or "💰 Drug Pricing") — both match.
  - drug_classes are NOT managed by this script (no practical use yet); the
    user_drug_classes table is left untouched.
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

# Windows consoles default to cp1252 and crash on the ×/— chars this script prints.
try:
    sys.stdout.reconfigure(encoding="utf-8")
except Exception:
    pass

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "backend" / "src"))

from sqlalchemy import text  # noqa: E402
from utils.db_conn import get_engine  # noqa: E402
from api.page_registry import PAGE_MAP  # noqa: E402

CATALOG = ROOT / "backend" / "catalogs" / "bucket_catalog.json"

VALID_MODES = {"include", "exclude"}


# ── validation reference data ───────────────────────────────────────────────

def _tab_text(label: str) -> str:
    """Strip a leading emoji/symbol so 'Drug Pricing' matches '💰 Drug Pricing'."""
    parts = label.split(" ", 1)
    # If the first token is non-alphanumeric (an emoji), drop it.
    if parts and parts[0] and not parts[0][0].isalnum():
        return parts[1].strip() if len(parts) > 1 else label.strip()
    return label.strip()


def load_valid_disease_areas() -> set[str]:
    return set(json.loads(CATALOG.read_text(encoding="utf-8")).keys())


def load_valid_tab_texts() -> dict[str, str]:
    """Map normalized tab text -> canonical PAGE_MAP label (without emoji stored)."""
    return {_tab_text(label): _tab_text(label) for _, label, _ in PAGE_MAP}


# ── spec parsing + validation ───────────────────────────────────────────────

def _validate_block(block: dict, name: str, valid: set[str], username: str,
                    errors: list[str]) -> tuple[str, list[str]] | None:
    if block is None:
        return None
    if not isinstance(block, dict) or "mode" not in block or "values" not in block:
        errors.append(f"{username}: '{name}' must be an object with 'mode' and 'values'.")
        return None
    mode = block["mode"]
    values = block["values"]
    if mode not in VALID_MODES:
        errors.append(f"{username}: '{name}.mode' must be one of {sorted(VALID_MODES)}, got {mode!r}.")
    if not isinstance(values, list) or not values:
        errors.append(f"{username}: '{name}.values' must be a non-empty list.")
        return None
    unknown = [v for v in values if v not in valid]
    if unknown:
        errors.append(f"{username}: unknown {name} value(s): {unknown}")
    return (mode, list(values))


def _validate_tabs(block: dict, username: str, valid_tabs: dict[str, str],
                   errors: list[str]) -> tuple[str, list[str]] | None:
    if block is None:
        return None
    if not isinstance(block, dict) or "mode" not in block or "values" not in block:
        errors.append(f"{username}: 'tabs' must be an object with 'mode' and 'values'.")
        return None
    mode = block["mode"]
    if mode not in VALID_MODES:
        errors.append(f"{username}: 'tabs.mode' must be include|exclude, got {mode!r}.")
    canon: list[str] = []
    for v in block["values"]:
        key = _tab_text(v)
        if key not in valid_tabs:
            errors.append(f"{username}: unknown tab {v!r}. Valid tabs: {sorted(valid_tabs)}")
        else:
            canon.append(valid_tabs[key])
    return (mode, canon)


def parse_spec(spec: dict) -> tuple[list[dict], list[str]]:
    """Return (normalized_users, errors)."""
    errors: list[str] = []
    if not isinstance(spec, dict) or "users" not in spec:
        return [], ["Spec must be a JSON object with a 'users' array."]

    valid_da = load_valid_disease_areas()
    valid_tabs = load_valid_tab_texts()
    default_pw = spec.get("password_default")

    seen: set[str] = set()
    out: list[dict] = []
    for u in spec["users"]:
        username = (u.get("username") or "").strip()
        if not username:
            errors.append("A user entry is missing 'username'.")
            continue
        if username in seen:
            errors.append(f"Duplicate username in spec: {username}")
        seen.add(username)

        password = u.get("password") or default_pw
        if not password:
            errors.append(f"{username}: no 'password' and no 'password_default' set.")

        out.append({
            "username": username,
            "password": password,
            "display_name": u.get("display_name") or username,
            "active": bool(u.get("active", True)),
            "disease_areas": _validate_block(u.get("disease_areas"), "disease_areas", valid_da, username, errors),
            "tabs": _validate_tabs(u.get("tabs"), username, valid_tabs, errors),
        })
    return out, errors


# ── apply ───────────────────────────────────────────────────────────────────

def apply_users(users: list[dict]) -> None:
    eng = get_engine("auth")
    with eng.begin() as c:
        for u in users:
            un = u["username"]
            c.execute(text(
                "INSERT INTO user_creds (username,password,display_name,is_active) "
                "VALUES (:u,:p,:d,:a) ON CONFLICT (username) DO UPDATE SET "
                "password=EXCLUDED.password, display_name=EXCLUDED.display_name, "
                "is_active=EXCLUDED.is_active, updated_at=now()"
            ), {"u": un, "p": u["password"], "d": u["display_name"], "a": u["active"]})

            # Replace attribute rows wholesale (idempotent).
            # drug_classes are intentionally not managed here (no practical use yet;
            # the user_drug_classes table is left untouched).
            for table, col, block in (
                ("user_tabs", "tab", u["tabs"]),
                ("user_disease_areas", "disease_area", u["disease_areas"]),
            ):
                c.execute(text(f"DELETE FROM {table} WHERE username=:u"), {"u": un})
                if block is None:
                    continue
                mode, values = block
                for v in values:
                    c.execute(
                        text(f"INSERT INTO {table} (username,{col},mode) VALUES (:u,:v,:m)"),
                        {"u": un, "v": v, "m": mode},
                    )

            def _fmt(b):
                return f"{b[0]}×{len(b[1])}" if b else "—"
            print(f"  {un:10} tabs={_fmt(u['tabs'])}  disease={_fmt(u['disease_areas'])}")


def main(argv: list[str]) -> int:
    args = [a for a in argv[1:] if a != "--dry-run"]
    dry_run = "--dry-run" in argv

    if not args:
        print(__doc__)
        return 2
    src = args[0]
    raw = sys.stdin.read() if src == "-" else Path(src).read_text(encoding="utf-8")
    spec = json.loads(raw)

    users, errors = parse_spec(spec)
    if errors:
        print("VALIDATION FAILED:")
        for e in errors:
            print(f"  - {e}")
        return 1

    print(f"Validated {len(users)} user(s).")
    if dry_run:
        print("Dry run — no writes performed.")
        for u in users:
            print(f"  would upsert {u['username']}")
        return 0

    apply_users(users)
    print("done — auth DB updated.")
    print("Next: python scripts/generate_snapshot_sql.py && python scripts/apply_snapshot_upserts.py")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
