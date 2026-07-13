"""
Create the auth schema in the `auth` database: one credentials table plus one
table per multi-valued access attribute (one row per user/value pair).

Run after the `auth` database exists on the Cloud SQL instance. The script is
idempotent and also upgrades an older `user_creds` table with new auth columns.
Uses the existing app connector credentials, so the app DB user must be able to
CREATE TABLE in the `auth` database.

    python backend/scripts/create_auth_table.py
"""
import sys
from pathlib import Path

# Make the backend package (backend/src) importable regardless of how this
# script is launched (direct run, -m, or IDE analysis).
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

from sqlalchemy import text  # noqa: E402
from utils.db_conn import get_engine  # noqa: E402

DDL = """
CREATE TABLE IF NOT EXISTS user_creds (
  username     text        PRIMARY KEY,
  password     text        NOT NULL,          -- plain text (project requirement)
  display_name text,
  is_active    boolean     NOT NULL DEFAULT true,
  is_admin     boolean     NOT NULL DEFAULT false,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

-- CREATE TABLE IF NOT EXISTS does not add columns to an existing table.
ALTER TABLE user_creds
  ADD COLUMN IF NOT EXISTS is_admin boolean NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS user_tabs (
  username text NOT NULL REFERENCES user_creds(username) ON DELETE CASCADE,
  tab      text NOT NULL,
  mode     text NOT NULL DEFAULT 'include' CHECK (mode IN ('include','exclude')),
  PRIMARY KEY (username, tab)
);

CREATE TABLE IF NOT EXISTS user_disease_areas (
  username     text NOT NULL REFERENCES user_creds(username) ON DELETE CASCADE,
  disease_area text NOT NULL,
  mode         text NOT NULL DEFAULT 'include' CHECK (mode IN ('include','exclude')),
  PRIMARY KEY (username, disease_area)
);

CREATE TABLE IF NOT EXISTS user_drug_classes (
  username   text NOT NULL REFERENCES user_creds(username) ON DELETE CASCADE,
  drug_class text NOT NULL,
  mode       text NOT NULL DEFAULT 'include' CHECK (mode IN ('include','exclude')),
  PRIMARY KEY (username, drug_class)
);
"""


def main() -> None:
    eng = get_engine("auth")
    with eng.begin() as conn:
        conn.execute(text(DDL))
    print("auth schema ready: user_creds (including is_admin), user_tabs, "
          "user_disease_areas, user_drug_classes")


if __name__ == "__main__":
    main()
