"""
Backend auth helpers. Credentials and access policy are read from the `users`
table in the `auth` database (see data/auth_repository.py) — not from the old
secrets.toml [users.*] block or the config/user_access.py dict.
"""
from __future__ import annotations

from api.page_registry import PAGE_MAP
from data.auth_repository import get_access_dict, get_user_row, verify_password


def authenticate(username: str, password: str) -> tuple[bool, dict]:
    """Verify credentials against the DB. Returns (True, access_dict) on success,
    where access_dict holds only the access-policy fields (no credentials)."""
    row = get_user_row(username)
    if not row:
        return False, {}

    if not verify_password(password, row.get("password", "")):
        return False, {}

    return True, get_access_dict(username)


def get_user_access(username: str | None) -> dict:
    if not username:
        return {}
    return get_access_dict(username)


def _tab_text(label: str) -> str:
    """Strip leading emoji + space from a tab label, returning the plain text.
    e.g. '🏠 Home' -> 'Home', 'Drug Detail' -> 'Drug Detail'
    Only strips the first token if it is non-ASCII (i.e. an emoji).
    """
    parts = label.split(" ", 1)
    if len(parts) > 1 and not parts[0].isascii():
        return parts[1]
    return label


def get_allowed_tabs_for_user(username: str | None) -> list[str]:
    """
    Filter PAGE_MAP to the tab labels allowed for the given user.

    Tab names in USER_ACCESS may be written with or without leading emoji
    (e.g. 'Home' and '🏠 Home' both match the page_map entry '🏠 Home').

    Supports two config modes (inclusion wins if both are set):
    - tabs=[...]         → show only these tabs
    - tabs_exclude=[...] → show all tabs EXCEPT these
    - tabs=None and no tabs_exclude → show all tabs

    Unknown username returns only the Home tab.
    """
    cfg = get_access_dict(username) if username else {}
    if not cfg:
        fallback = [label for _, label, _ in PAGE_MAP if _tab_text(label) == "Home"]
        return fallback or ([PAGE_MAP[0][1]] if PAGE_MAP else [])

    allowed_tabs  = cfg.get("tabs")
    excluded_tabs = cfg.get("tabs_exclude")

    if allowed_tabs is not None:
        allowed_text = {_tab_text(t) for t in allowed_tabs}
        return [label for _, label, _ in PAGE_MAP if _tab_text(label) in allowed_text]

    if excluded_tabs is not None:
        excluded_text = {_tab_text(t) for t in excluded_tabs}
        return [label for _, label, _ in PAGE_MAP if _tab_text(label) not in excluded_text]

    return [label for _, label, _ in PAGE_MAP]
