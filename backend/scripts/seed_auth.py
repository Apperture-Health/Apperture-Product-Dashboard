"""
One-time migration: populate the split auth tables (user_creds, user_tabs,
user_disease_areas, user_drug_classes) from the previous single `users` table.

- Access data (tabs / disease areas / drug classes, incl. include/exclude mode)
  is read back from the old `users` table's JSONB columns.
- Passwords are stored as PLAIN TEXT now. Plain-text passwords only ever existed
  in .streamlit/secrets.toml [users.*] (the old table held bcrypt hashes, which
  cannot be reversed), so we take them from secrets if present, else fall back to
  the known bootstrap values below. Change them afterwards with direct SQL.

Idempotent: re-running UPSERTs each user and rewrites their attribute rows.
Run AFTER create_auth_table.py.

    python backend/scripts/seed_auth.py
"""
import sys
from pathlib import Path

# Make the backend package (backend/src) importable regardless of how this
# script is launched (direct run, -m, or IDE analysis).
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

from sqlalchemy import text  # noqa: E402

from utils.db_conn import get_engine  # noqa: E402
from utils.runtime import runtime  # noqa: E402

# Known original bootstrap passwords (fallback if secrets.toml [users.*] is gone).
# These are low-value demo credentials; rotate via direct SQL after migrating.
_BOOTSTRAP_PASSWORDS = {
    "admin": "password#1234",
    "User1": "password#1234",
    "sahil": "Sahil#2026",
    "ambi":  "password#1234",
    "User2": "password#1234",
    "User3": "password#1234",
}

# (JSONB include column, JSONB exclude column) → (attr table, value column)
_ATTR_MAP = (
    ("tabs",          "tabs_exclude",          "user_tabs",          "tab"),
    ("disease_areas", "disease_areas_exclude", "user_disease_areas", "disease_area"),
    ("drug_classes",  "drug_classes_exclude",  "user_drug_classes",  "drug_class"),
)

_UPSERT_CREDS = text(
    """
    INSERT INTO user_creds (username, password, display_name, is_active)
    VALUES (:username, :password, :display_name, :is_active)
    ON CONFLICT (username) DO UPDATE SET
        password     = EXCLUDED.password,
        display_name = EXCLUDED.display_name,
        is_active    = EXCLUDED.is_active,
        updated_at   = now();
    """
)


def _password_for(username: str, secrets_users: dict) -> str:
    entry = secrets_users.get(username) or {}
    return entry.get("password") or _BOOTSTRAP_PASSWORDS.get(username, "changeme")


def main() -> None:
    eng = get_engine("auth")
    secrets_users = dict(runtime.secrets.get("users", {}))

    with eng.begin() as conn:
        legacy_exists = conn.execute(
            text("SELECT to_regclass('public.users') IS NOT NULL")
        ).scalar()
        if not legacy_exists:
            print(
                "Legacy `users` table not found — this one-time migration has already "
                "been completed. Nothing to do.\n"
                "Manage users with direct SQL against user_creds / user_tabs / "
                "user_disease_areas / user_drug_classes."
            )
            return

        old = conn.execute(
            text(
                "SELECT username, display_name, is_active, "
                "tabs, tabs_exclude, disease_areas, disease_areas_exclude, "
                "drug_classes, drug_classes_exclude FROM users"
            )
        ).mappings().all()

        if not old:
            print("Legacy `users` table is empty — nothing to migrate.")
            return

        for u in old:
            username = u["username"]
            conn.execute(
                _UPSERT_CREDS,
                {
                    "username": username,
                    "password": _password_for(username, secrets_users),
                    "display_name": u["display_name"] or username.capitalize(),
                    "is_active": bool(u["is_active"]),
                },
            )

            for inc_col, exc_col, table, value_col in _ATTR_MAP:
                conn.execute(
                    text(f"DELETE FROM {table} WHERE username = :u"), {"u": username}
                )
                rows = [(v, "include") for v in (u[inc_col] or [])]
                rows += [(v, "exclude") for v in (u[exc_col] or [])]
                for value, mode in rows:
                    conn.execute(
                        text(
                            f"INSERT INTO {table} (username, {value_col}, mode) "
                            "VALUES (:u, :v, :m) ON CONFLICT DO NOTHING"
                        ),
                        {"u": username, "v": value, "m": mode},
                    )

    print(f"Migrated {len(old)} users into split tables: "
          f"{', '.join(u['username'] for u in old)}")


if __name__ == "__main__":
    main()
