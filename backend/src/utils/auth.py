"""
Backend auth helpers preserving the Streamlit app's credential and access rules.
"""
from __future__ import annotations

import warnings

from api.page_registry import PAGE_MAP
from config.user_access import USER_ACCESS
from utils.runtime import runtime


def _load_users() -> dict:
    try:
        return dict(runtime.secrets["users"])
    except KeyError:
        return {}


def authenticate(username: str, password: str) -> tuple[bool, dict]:
    users = _load_users()
    if not users or username not in users:
        return False, {}

    user_cfg = users[username]
    if user_cfg.get("password", "") != password:
        return False, {}

    if username not in USER_ACCESS:
        warnings.warn(
            f"User '{username}' authenticated via secrets.toml but has no USER_ACCESS entry.",
            stacklevel=2,
        )
        return False, {}

    return True, dict(USER_ACCESS[username])


def get_user_access(username: str | None) -> dict:
    if not username:
        return {}
    return dict(USER_ACCESS.get(username, {}))


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
    if not username or username not in USER_ACCESS:
        fallback = [label for _, label, _ in PAGE_MAP if _tab_text(label) == "Home"]
        return fallback or ([PAGE_MAP[0][1]] if PAGE_MAP else [])

    cfg = USER_ACCESS[username]
    allowed_tabs  = cfg.get("tabs")
    excluded_tabs = cfg.get("tabs_exclude")

    if allowed_tabs is not None:
        allowed_text = {_tab_text(t) for t in allowed_tabs}
        return [label for _, label, _ in PAGE_MAP if _tab_text(label) in allowed_text]

    if excluded_tabs is not None:
        excluded_text = {_tab_text(t) for t in excluded_tabs}
        return [label for _, label, _ in PAGE_MAP if _tab_text(label) not in excluded_text]

    return [label for _, label, _ in PAGE_MAP]
