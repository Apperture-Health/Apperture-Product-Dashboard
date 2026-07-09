"""
DEPRECATED / RETIRED — reference documentation only.

Per-user access is no longer configured in code. Users, passwords (plain text),
and access policy now live in the `auth` database and are read via
backend/src/data/auth_repository.py. Manage users with direct SQL; changes are
picked up by the dashboard live (~60s cache), no code edit or restart needed.

Nothing imports USER_ACCESS anymore; it is kept empty only as a safety net.

────────────────────────────────────────────────────────────────────────────
auth database schema (one entry per user/value pair):

  user_creds          (username PK, password, display_name, is_active)
  user_tabs           (username, tab,          mode)   mode in ('include','exclude')
  user_disease_areas  (username, disease_area, mode)
  user_drug_classes   (username, drug_class,   mode)

Per-attribute semantics (reconstructed into tabs / tabs_exclude / disease_areas
/ … by auth_repository.get_user_row):
  - rows with mode='include' → allow-list   (e.g. `tabs`)
  - rows with mode='exclude' → deny-list     (e.g. `tabs_exclude`)
  - no rows for an attribute → no restriction (show everything)
  - inclusion wins over exclusion

  Tab names (emojis optional): Home, Ask the Data, Pipeline, Drug Detail,
    Drug Pricing, Market Access, Sponsors, Trial Design, Endpoints, Outcomes,
    Scores, PRO Overview, Trial Groups, Safety, Real World Safety
  disease_area values = top-level keys of catalogs/bucket_catalog.json
  drug_class values   = atc_class_name (see catalogs/condition_sponsor_values.json)

Add a user (direct SQL against the `auth` DB):
  INSERT INTO user_creds (username, password, display_name)
    VALUES ('newuser', 'PlainPassword', 'New User');
  INSERT INTO user_tabs (username, tab, mode) VALUES
    ('newuser','Home','include'), ('newuser','Pipeline','include');
  INSERT INTO user_disease_areas (username, disease_area, mode) VALUES
    ('newuser','Breast Cancer','include');
────────────────────────────────────────────────────────────────────────────
"""

# Retired — access now lives in the `auth` DB. Do not add users here.
USER_ACCESS: dict[str, dict] = {}
