"""
Admin write-path for user management (auth database).

Read-side lives in auth_repository.py; this module holds the mutating operations
used by the admin User-Management endpoints:
  - validation of tab / disease-area values against the live catalogs
  - upsert_user()   — create or update a user + their tab/disease access
  - set_active()    — (de)activate a user (the admin "remove" action)

drug_classes are intentionally NOT managed here (no practical use yet); the
user_drug_classes table is left untouched.

All passwords are stored as PLAIN TEXT, per the existing project requirement.
"""
from __future__ import annotations

import json
from pathlib import Path

from sqlalchemy import text

from api.page_registry import PAGE_MAP
from utils.db_conn import get_engine
from utils.runtime import runtime

_AUTH_DB = "auth"
VALID_MODES = {"include", "exclude"}


# ── validation reference data ────────────────────────────────────────────────

def _catalog_path(filename: str) -> Path:
    backend_root = Path(__file__).resolve().parents[2]
    for candidate in (backend_root / "catalogs" / filename,
                      backend_root.parent / "catalogs" / filename):
        if candidate.exists():
            return candidate
    return backend_root / "catalogs" / filename


def canonical_tab_text(label: str) -> str:
    """Return the icon-free tab value used in ``user_tabs`` storage."""
    parts = label.split(" ", 1)
    if len(parts) > 1 and not parts[0].isascii():
        return parts[1].strip()
    return label.strip()


def valid_disease_areas() -> set[str]:
    return set(json.loads(_catalog_path("bucket_catalog.json").read_text(encoding="utf-8")).keys())


def valid_tab_texts() -> dict[str, str]:
    """normalized tab text -> canonical PAGE_MAP text (emoji stripped)."""
    return {
        canonical_tab_text(label): canonical_tab_text(label)
        for _, label, _ in PAGE_MAP
    }


# ── validation ───────────────────────────────────────────────────────────────

def validate_access_block(block: dict | None, name: str, valid: set[str],
                          errors: list[str]) -> tuple[str, list[str]] | None:
    """Validate a {mode, values} access block for disease_areas."""
    if block is None:
        return None
    mode = block.get("mode")
    values = block.get("values")
    if mode not in VALID_MODES:
        errors.append(f"{name}.mode must be include|exclude, got {mode!r}.")
    if not isinstance(values, list) or not values:
        errors.append(f"{name}.values must be a non-empty list.")
        return None
    unknown = [v for v in values if v not in valid]
    if unknown:
        errors.append(f"unknown {name} value(s): {unknown}")
    return (mode, list(values))


def validate_tabs_block(block: dict | None, errors: list[str]) -> tuple[str, list[str]] | None:
    if block is None:
        return None
    mode = block.get("mode")
    if mode not in VALID_MODES:
        errors.append(f"tabs.mode must be include|exclude, got {mode!r}.")
    valid_tabs = valid_tab_texts()
    canon: list[str] = []
    for v in (block.get("values") or []):
        key = canonical_tab_text(v)
        if key not in valid_tabs:
            errors.append(f"unknown tab {v!r}.")
        elif valid_tabs[key] not in canon:
            # Icon-prefixed and icon-free forms represent the same stored tab.
            # Deduplicate them before inserting into the (username, tab) PK.
            canon.append(valid_tabs[key])
    if not canon:
        errors.append("tabs.values must be a non-empty list of valid tabs.")
        return None
    return (mode, canon)


# ── writes ───────────────────────────────────────────────────────────────────

def upsert_user(*, username: str, password: str, display_name: str,
                is_active: bool, is_admin: bool,
                tabs: tuple[str, list[str]] | None,
                disease_areas: tuple[str, list[str]] | None) -> None:
    """Create or update a user and replace their tab/disease-area rows wholesale
    (idempotent). `tabs`/`disease_areas` are validated (mode, [values]) tuples or
    None (no restriction). user_drug_classes is left untouched."""
    eng = get_engine(_AUTH_DB)
    with eng.begin() as c:
        c.execute(text(
            "INSERT INTO user_creds (username,password,display_name,is_active,is_admin) "
            "VALUES (:u,:p,:d,:act,:adm) ON CONFLICT (username) DO UPDATE SET "
            "password=EXCLUDED.password, display_name=EXCLUDED.display_name, "
            "is_active=EXCLUDED.is_active, is_admin=EXCLUDED.is_admin, updated_at=now()"
        ), {"u": username, "p": password, "d": display_name,
            "act": is_active, "adm": is_admin})

        for table, col, block in (
            ("user_tabs", "tab", tabs),
            ("user_disease_areas", "disease_area", disease_areas),
        ):
            c.execute(text(f"DELETE FROM {table} WHERE username=:u"), {"u": username})
            if block is None:
                continue
            mode, values = block
            for v in values:
                c.execute(
                    text(f"INSERT INTO {table} (username,{col},mode) VALUES (:u,:v,:m)"),
                    {"u": username, "v": v, "m": mode},
                )
    # Bust the 60s auth cache so the change is picked up on the next request.
    runtime.clear_cache()


def set_active(username: str, active: bool) -> None:
    eng = get_engine(_AUTH_DB)
    with eng.begin() as c:
        c.execute(
            text("UPDATE user_creds SET is_active=:a, updated_at=now() WHERE username=:u"),
            {"a": active, "u": username},
        )
    # Bust the cache so a deactivated user can't authenticate during the TTL window.
    runtime.clear_cache()


def user_exists(username: str) -> bool:
    eng = get_engine(_AUTH_DB)
    with eng.connect() as c:
        return c.execute(
            text("SELECT 1 FROM user_creds WHERE username=:u"), {"u": username}
        ).first() is not None
