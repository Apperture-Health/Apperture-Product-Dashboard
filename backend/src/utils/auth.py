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


def get_allowed_tabs_for_user(username: str | None) -> list[str]:
    if not username or username not in USER_ACCESS:
        return ["🏠 Home"]

    allowed_tabs = USER_ACCESS[username].get("tabs")
    if allowed_tabs is None:
        return [label for _, label, _ in PAGE_MAP]

    allowed_set = set(allowed_tabs)
    return [label for _, label, _ in PAGE_MAP if label in allowed_set]
