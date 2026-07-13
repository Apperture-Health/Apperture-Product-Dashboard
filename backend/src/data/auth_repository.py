"""
Database-backed auth + access store (auth database, Cloud SQL).

Access is stored across several small tables, one entry per (user, value) pair:

  user_creds          (username PK, password, display_name, is_active)
  user_tabs           (username, tab,          mode)   mode in ('include','exclude')
  user_disease_areas  (username, disease_area, mode)
  user_drug_classes   (username, drug_class,   mode)

Passwords are stored as PLAIN TEXT (per project requirement) in user_creds.

Per-attribute semantics (reconstructed into the same dict shape the rest of the
backend already expects — tabs / tabs_exclude / disease_areas / ... ):
  - rows with mode='include' → allow-list  (e.g. `tabs`)
  - rows with mode='exclude' → deny-list   (e.g. `tabs_exclude`)
  - no rows for an attribute → no restriction (None)  → show everything
  - inclusion wins over exclusion (matches the downstream helpers)
"""
from __future__ import annotations

from sqlalchemy import text

from utils.db_conn import get_engine
from utils.runtime import runtime

_AUTH_DB = "auth"

# (attribute table, value column, dict key for include, dict key for exclude)
_ATTR_TABLES = (
    ("user_tabs",          "tab",          "tabs",          "tabs_exclude"),
    ("user_disease_areas", "disease_area", "disease_areas", "disease_areas_exclude"),
    ("user_drug_classes",  "drug_class",   "drug_classes",  "drug_classes_exclude"),
)

# Access-policy fields (everything except credentials) in the reconstructed dict.
_ACCESS_FIELDS = (
    "display_name",
    "is_admin",
    "tabs",
    "tabs_exclude",
    "disease_areas",
    "disease_areas_exclude",
    "drug_classes",
    "drug_classes_exclude",
)


@runtime.cache_data(ttl=60)
def get_user_row(username: str) -> dict | None:
    """Assemble a single user's credentials + access from the split tables into
    one dict (same shape the rest of the backend expects), or None if the user
    does not exist or is inactive.

    Cached for 60s so page requests don't hit the DB every time, while changes
    made directly in the DB still propagate to the dashboard within ~a minute
    (no restart needed).
    """
    if not username:
        return None

    eng = get_engine(_AUTH_DB)
    with eng.connect() as conn:
        creds = conn.execute(
            text(
                "SELECT username, password, display_name, is_active, is_admin "
                "FROM user_creds WHERE username = :u AND is_active"
            ),
            {"u": username},
        ).mappings().first()
        if creds is None:
            return None

        row: dict = dict(creds)
        for table, value_col, inc_key, exc_key in _ATTR_TABLES:
            attr_rows = conn.execute(
                text(f"SELECT {value_col} AS value, mode FROM {table} WHERE username = :u"),
                {"u": username},
            ).mappings().all()
            include = [r["value"] for r in attr_rows if r["mode"] == "include"]
            exclude = [r["value"] for r in attr_rows if r["mode"] == "exclude"]
            row[inc_key] = include or None
            row[exc_key] = exclude or None

    return row


def get_access_dict(username: str) -> dict:
    """Return only the access-policy fields for a user (no credentials).
    Empty dict for unknown/inactive users."""
    row = get_user_row(username)
    if not row:
        return {}
    return {field: row.get(field) for field in _ACCESS_FIELDS}


@runtime.cache_data(ttl=60)
def list_usernames() -> list[str]:
    """All active usernames (used by the snapshot generator to enumerate scopes)."""
    eng = get_engine(_AUTH_DB)
    with eng.connect() as conn:
        rows = conn.execute(
            text("SELECT username FROM user_creds WHERE is_active ORDER BY username")
        ).scalars().all()
    return list(rows)


def get_all_access() -> dict[str, dict]:
    """Map every active username to its access dict — a DB-backed replacement for
    the old USER_ACCESS module dict (same per-user shape)."""
    return {u: get_access_dict(u) for u in list_usernames()}


def list_all_users_full() -> list[dict]:
    """Every user (active AND inactive) with credentials + full access breakdown,
    for the admin User-Management view. Read UNCACHED so an admin always sees the
    current DB state immediately after a write (the 60s cache on get_user_row only
    affects other users' live sessions).

    Each entry: username, password, display_name, is_active, is_admin, and, per
    attribute, include/exclude lists (e.g. tabs / tabs_exclude)."""
    eng = get_engine(_AUTH_DB)
    with eng.connect() as conn:
        creds = conn.execute(
            text(
                "SELECT username, password, display_name, is_active, is_admin "
                "FROM user_creds ORDER BY username"
            )
        ).mappings().all()

        users: list[dict] = []
        for cred in creds:
            row: dict = dict(cred)
            un = row["username"]
            for table, value_col, inc_key, exc_key in _ATTR_TABLES:
                attr_rows = conn.execute(
                    text(f"SELECT {value_col} AS value, mode FROM {table} WHERE username = :u"),
                    {"u": un},
                ).mappings().all()
                row[inc_key] = [r["value"] for r in attr_rows if r["mode"] == "include"]
                row[exc_key] = [r["value"] for r in attr_rows if r["mode"] == "exclude"]
            users.append(row)
    return users


def count_active_admins(exclude_username: str | None = None) -> int:
    """Number of active admins, optionally excluding one username. Used to prevent
    removing/demoting the last remaining admin (lockout guard)."""
    eng = get_engine(_AUTH_DB)
    with eng.connect() as conn:
        if exclude_username:
            return int(conn.execute(
                text("SELECT COUNT(*) FROM user_creds "
                     "WHERE is_active AND is_admin AND username <> :u"),
                {"u": exclude_username},
            ).scalar() or 0)
        return int(conn.execute(
            text("SELECT COUNT(*) FROM user_creds WHERE is_active AND is_admin")
        ).scalar() or 0)


def verify_password(plain: str, stored: str) -> bool:
    """Plain-text password check (passwords are stored as plain text)."""
    return bool(stored) and plain == stored
