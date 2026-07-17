"""
Usage-logging store (auth database, Cloud SQL).

Two tables:
  - ``user_sessions``   — one row per login (``login_at`` = when the user logged in)
  - ``user_tab_visits`` — one row per tab open, linked to its session

Admin/superadmin accounts are excluded by the caller, so no rows are written for
is_admin users. Writes are UNcached; the admin read side (get_recent_sessions) is
also uncached so an admin always sees current data.
"""
from __future__ import annotations

import uuid

from sqlalchemy import text
from sqlalchemy import bindparam

from utils.db_conn import get_engine

_AUTH_DB = "auth"


def start_session(username: str) -> str | None:
    """Create a login session for the user and return its id. No-op on falsy
    username (returns None)."""
    if not username:
        return None
    session_id = uuid.uuid4().hex
    eng = get_engine(_AUTH_DB)
    with eng.begin() as c:
        c.execute(
            text("INSERT INTO user_sessions (session_id, username) VALUES (:s, :u)"),
            {"s": session_id, "u": username},
        )
    return session_id


def log_tab_visit(username: str, tab: str, session_id: str | None) -> None:
    """Insert a single tab-visit row for a session. No-op on falsy username/tab."""
    if not username or not tab:
        return
    eng = get_engine(_AUTH_DB)
    with eng.begin() as c:
        c.execute(
            text(
                "INSERT INTO user_tab_visits (username, tab, session_id) "
                "VALUES (:u, :t, :s)"
            ),
            {"u": username, "t": tab, "s": session_id},
        )


def get_recent_sessions(limit: int = 500, username: str | None = None) -> list[dict]:
    """Most-recent login sessions (newest first), each with the ordered list of
    tabs visited in that session. Optionally filter to a single username.

    Each entry: session_id, username, display_name, login_at (ISO), tab_count,
    and tabs = [{tab, visited_at (ISO)}, ...] ordered by visit time.
    """
    limit = max(1, min(int(limit), 5000))

    sess_sql = (
        "SELECT s.session_id, s.username, c.display_name, s.login_at "
        "FROM user_sessions s "
        "JOIN user_creds c USING (username) "
    )
    params: dict = {"n": limit}
    if username:
        sess_sql += "WHERE s.username = :u "
        params["u"] = username
    sess_sql += "ORDER BY s.login_at DESC LIMIT :n"

    eng = get_engine(_AUTH_DB)
    with eng.connect() as conn:
        sessions = conn.execute(text(sess_sql), params).mappings().all()
        session_ids = [s["session_id"] for s in sessions]

        visits_by_session: dict[str, list[dict]] = {}
        if session_ids:
            visit_stmt = text(
                "SELECT session_id, tab, visited_at FROM user_tab_visits "
                "WHERE session_id IN :ids ORDER BY visited_at ASC"
            ).bindparams(bindparam("ids", expanding=True))
            for v in conn.execute(visit_stmt, {"ids": session_ids}).mappings().all():
                visits_by_session.setdefault(v["session_id"], []).append(
                    {
                        "tab": v["tab"],
                        "visited_at": v["visited_at"].isoformat() if v["visited_at"] else None,
                    }
                )

    result: list[dict] = []
    for s in sessions:
        tabs = visits_by_session.get(s["session_id"], [])
        result.append(
            {
                "session_id": s["session_id"],
                "username": s["username"],
                "display_name": s["display_name"],
                "login_at": s["login_at"].isoformat() if s["login_at"] else None,
                "tab_count": len(tabs),
                "tabs": tabs,
            }
        )
    return result
