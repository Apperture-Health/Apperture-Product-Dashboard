"""
Admin User-Management endpoints (mounted under /api/admin).

EVERY route is gated by _require_admin, which re-reads is_admin from the auth DB
(never trusts the session cookie). This is the real authorization boundary — the
frontend hiding the tab is only cosmetic.

Manages user_creds + user_tabs + user_disease_areas. Drug classes are not managed
(see data/auth_admin). Passwords are plain text, per the project requirement.
"""
from __future__ import annotations

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, Field

from api.page_registry import PAGE_MAP, ADMIN_TAB_LABEL
from data.auth_repository import (
    get_user_row,
    list_all_users_full,
    list_usernames,
    count_active_admins,
)
from data import auth_admin
from services.snapshot_sql import rebuild_all_snapshots

admin_router = APIRouter(prefix="/api/admin")


# ── auth gate ────────────────────────────────────────────────────────────────

def _require_admin(request: Request) -> dict:
    auth = request.session.get("auth")
    if not auth:
        raise HTTPException(status_code=401, detail="Authentication required")
    row = get_user_row(auth.get("username"))          # from DB, not the cookie
    if not row or not row.get("is_admin"):
        raise HTTPException(status_code=403, detail="Admin access required")
    return auth


# ── request models ───────────────────────────────────────────────────────────

class AccessBlock(BaseModel):
    mode: str                                   # "include" | "exclude"
    values: list[str] = Field(default_factory=list)


class AdminUserUpsert(BaseModel):
    username: str
    password: str
    display_name: str | None = None
    is_active: bool = True
    is_admin: bool = False
    tabs: AccessBlock | None = None
    disease_areas: AccessBlock | None = None


# ── helpers ──────────────────────────────────────────────────────────────────

def _validate(payload: AdminUserUpsert) -> tuple[tuple | None, tuple | None]:
    """Validate access blocks; raise 400 with all errors, else return the
    normalized (tabs, disease_areas) tuples for upsert_user."""
    errors: list[str] = []
    if not payload.username.strip():
        errors.append("username is required.")
    if not payload.password:
        errors.append("password is required.")

    tabs = auth_admin.validate_tabs_block(
        payload.tabs.model_dump() if payload.tabs else None, errors)
    disease = auth_admin.validate_access_block(
        payload.disease_areas.model_dump() if payload.disease_areas else None,
        "disease_areas", auth_admin.valid_disease_areas(), errors)

    if errors:
        raise HTTPException(status_code=400, detail={"errors": errors})
    return tabs, disease


def _guard_last_admin(username: str, will_be_active: bool, will_be_admin: bool) -> None:
    """Reject a change that would leave zero active admins."""
    remaining = count_active_admins(exclude_username=username)
    if remaining == 0 and not (will_be_active and will_be_admin):
        raise HTTPException(
            status_code=400,
            detail="Refused: this would remove the last active admin.",
        )


# ── routes ───────────────────────────────────────────────────────────────────

@admin_router.get("/users")
def list_users(request: Request) -> dict:
    _require_admin(request)
    users = list_all_users_full()
    for user in users:
        for key in ("tabs", "tabs_exclude"):
            # The User Management page uses plain names. Normalize historical
            # rows of either form and deduplicate before sending them to the form.
            user[key] = list(dict.fromkeys(
                auth_admin.canonical_tab_text(value)
                for value in user.get(key, [])
            ))
    return {"users": users}


@admin_router.get("/options")
def options(request: Request) -> dict:
    _require_admin(request)
    return {
        "tabs": [
            auth_admin.canonical_tab_text(label)
            for _, label, _ in PAGE_MAP
            if label != ADMIN_TAB_LABEL
        ],
        "disease_areas": sorted(auth_admin.valid_disease_areas()),
    }


@admin_router.post("/users")
def create_user(payload: AdminUserUpsert, request: Request) -> dict:
    _require_admin(request)
    if auth_admin.user_exists(payload.username):
        raise HTTPException(status_code=409, detail=f"User {payload.username!r} already exists.")
    tabs, disease = _validate(payload)
    auth_admin.upsert_user(
        username=payload.username.strip(),
        password=payload.password,
        display_name=(payload.display_name or payload.username).strip(),
        is_active=payload.is_active,
        is_admin=payload.is_admin,
        tabs=tabs,
        disease_areas=disease,
    )
    return {"ok": True, "username": payload.username.strip(), "created": True}


@admin_router.put("/users/{username}")
def update_user(username: str, payload: AdminUserUpsert, request: Request) -> dict:
    _require_admin(request)
    if not auth_admin.user_exists(username):
        raise HTTPException(status_code=404, detail=f"User {username!r} not found.")
    tabs, disease = _validate(payload)
    # If this user is (or was) an admin, ensure the edit doesn't orphan admin access.
    _guard_last_admin(username, payload.is_active, payload.is_admin)
    auth_admin.upsert_user(
        username=username,
        password=payload.password,
        display_name=(payload.display_name or username).strip(),
        is_active=payload.is_active,
        is_admin=payload.is_admin,
        tabs=tabs,
        disease_areas=disease,
    )
    return {"ok": True, "username": username, "created": False}


@admin_router.post("/users/{username}/deactivate")
def deactivate_user(username: str, request: Request) -> dict:
    _require_admin(request)
    row = get_user_row(username)   # returns None if already inactive/unknown
    # Prevent removing the last active admin.
    _guard_last_admin(username, will_be_active=False, will_be_admin=bool(row and row.get("is_admin")))
    if not auth_admin.user_exists(username):
        raise HTTPException(status_code=404, detail=f"User {username!r} not found.")
    auth_admin.set_active(username, False)
    return {"ok": True, "username": username, "is_active": False}


@admin_router.post("/users/{username}/activate")
def activate_user(username: str, request: Request) -> dict:
    _require_admin(request)
    if not auth_admin.user_exists(username):
        raise HTTPException(status_code=404, detail=f"User {username!r} not found.")
    auth_admin.set_active(username, True)
    return {"ok": True, "username": username, "is_active": True}


@admin_router.post("/rebuild-snapshots")
def rebuild_snapshots(request: Request) -> dict:
    _require_admin(request)
    rows = rebuild_all_snapshots()
    return {
        "ok": True,
        "active_users": len(list_usernames()),
        "scopes": [{"scope_key": sk, "total_trials": tt} for sk, tt in rows],
    }
