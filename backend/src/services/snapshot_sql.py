"""
services/snapshot_sql.py

Shared Home-KPI snapshot logic, importable by BOTH the CLI scripts
(scripts/generate_snapshot_sql.py, scripts/apply_snapshot_upserts.py) and the
admin "Rebuild snapshots" endpoint — so the scope-key math and the KPI SQL can
never drift between them.

A "scope" is a user's effective (allowed_indications, allowed_atc_classes). Rows
are keyed by a deterministic scope_key in public.overview_kpis_snapshot (aact DB);
the Home page reads them on the no-filter fast path.
"""
from __future__ import annotations

from datetime import datetime, timezone

from data.auth_repository import get_all_access
from utils.db_conn import get_engine
from utils.filters import (
    get_raw_conditions_for_display_label,
    build_allowed_indications,
    build_allowed_atc_classes,
)
from config.settings import CONDITIONS_TABLE, CONDITIONS_NAME_COL


# ── scope resolution + keys ──────────────────────────────────────────────────

def resolve_scope(cfg: dict) -> tuple[list[str] | None, list[str] | None]:
    """A user's access dict -> the effective allow-lists the runtime uses."""
    return build_allowed_indications(cfg), build_allowed_atc_classes(cfg)


def build_scope_key(disease_areas: list[str] | None, drug_classes: list[str] | None) -> str:
    """Deterministic key for an access profile ('global' when unrestricted).
    MUST match data/repository._build_scope_key."""
    parts = []
    if disease_areas is not None:
        parts.append("ind:" + "|".join(sorted(disease_areas)))
    if drug_classes is not None:
        parts.append("atc:" + "|".join(sorted(drug_classes)))
    return "__".join(parts) if parts else "global"


# ── SQL literal helpers ──────────────────────────────────────────────────────

def _sql_str(value: str) -> str:
    return "'" + value.replace("'", "''") + "'"


def _sql_list(values: list[str]) -> str:
    return "(" + ", ".join(_sql_str(v) for v in values) + ")"


def build_scope_subquery(disease_areas: list[str] | None, drug_classes: list[str] | None) -> str:
    """SQL fragment `s.nct_id IN ( ... )` scoping studies to the access profile.
    Mirrors QueryBuilder.nct_subquery_clause()."""
    if disease_areas is None and drug_classes is None:
        return "s.nct_id IN (SELECT DISTINCT nct_id FROM public.drug_trials)"

    joins: list[str] = []
    wheres: list[str] = []

    if disease_areas is not None:
        raw_conditions = sorted({
            r.lower()
            for lbl in disease_areas
            for r in get_raw_conditions_for_display_label(lbl)
        })
        joins.append(f"JOIN {CONDITIONS_TABLE} c ON c.nct_id = dt.nct_id")
        wheres.append(
            f"LOWER(c.{CONDITIONS_NAME_COL}) IN {_sql_list(raw_conditions)}"
            if raw_conditions else "FALSE"
        )

    if drug_classes is not None:
        # aact-DB public.drug_classes uses `atc_class_name` (the drugs-DB copy uses
        # `drug_class` — a different table).
        joins.append("JOIN public.drug_classes dc ON dc.brand_name = dt.brand_name")
        wheres.append(f"dc.atc_class_name IN {_sql_list(drug_classes)}")

    join_sql = "\n        ".join(joins)
    where_sql = "WHERE " + "\n          AND ".join(wheres) if wheres else ""
    return f"""s.nct_id IN (
        SELECT DISTINCT dt.nct_id
        FROM public.drug_trials dt
        {join_sql}
        {where_sql}
    )"""


def build_upsert_block(scope_key: str, scope_subquery: str) -> str:
    """Full INSERT ... ON CONFLICT DO UPDATE for one scope."""
    sk = _sql_str(scope_key)
    now = _sql_str(datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S+00"))
    return f"""\
INSERT INTO public.overview_kpis_snapshot (
    scope_key, total_trials, active_trials, completed_trials, trials_with_results,
    median_enrollment, unique_sponsors, unique_drugs, unique_conditions,
    trials_with_pros, refreshed_at
)
WITH scoped AS (
    SELECT s.nct_id, s.overall_status, s.enrollment, s.results_first_submitted_date
    FROM ctgov.studies s
    WHERE {scope_subquery}
),
kpi_main AS (
    SELECT
        COUNT(DISTINCT nct_id) AS total_trials,
        COUNT(DISTINCT CASE WHEN overall_status IN
            ('RECRUITING', 'ACTIVE_NOT_RECRUITING') THEN nct_id END) AS active_trials,
        COUNT(DISTINCT CASE WHEN overall_status = 'COMPLETED' THEN nct_id END) AS completed_trials,
        COUNT(DISTINCT CASE WHEN results_first_submitted_date IS NOT NULL
            THEN nct_id END) AS trials_with_results,
        PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY enrollment) AS median_enrollment
    FROM scoped
),
kpi_sponsors AS (
    SELECT COUNT(DISTINCT sp.name) AS unique_sponsors
    FROM ctgov.sponsors sp
    WHERE sp.nct_id IN (SELECT nct_id FROM scoped) AND sp.lead_or_collaborator = 'lead'
),
kpi_drugs AS (
    SELECT COUNT(DISTINCT dt.brand_name) AS unique_drugs
    FROM public.drug_trials dt
    WHERE dt.nct_id IN (SELECT nct_id FROM scoped)
),
kpi_conditions AS (
    SELECT COUNT(DISTINCT bc.downcase_mesh_term) AS unique_conditions
    FROM ctgov.browse_conditions bc
    WHERE bc.nct_id IN (SELECT nct_id FROM scoped) AND bc.mesh_type = 'mesh-list'
),
kpi_pros AS (
    SELECT COUNT(DISTINCT p.nct_id) AS trials_with_pros
    FROM public.drug_trial_design_outcomes_pro p
    WHERE p.nct_id IN (SELECT nct_id FROM scoped)
)
SELECT
    {sk}, kpi_main.total_trials, kpi_main.active_trials, kpi_main.completed_trials,
    kpi_main.trials_with_results, kpi_main.median_enrollment, kpi_sponsors.unique_sponsors,
    kpi_drugs.unique_drugs, kpi_conditions.unique_conditions, kpi_pros.trials_with_pros,
    {now}::timestamptz
FROM kpi_main, kpi_sponsors, kpi_drugs, kpi_conditions, kpi_pros
ON CONFLICT (scope_key) DO UPDATE SET
    total_trials=EXCLUDED.total_trials, active_trials=EXCLUDED.active_trials,
    completed_trials=EXCLUDED.completed_trials, trials_with_results=EXCLUDED.trials_with_results,
    median_enrollment=EXCLUDED.median_enrollment, unique_sponsors=EXCLUDED.unique_sponsors,
    unique_drugs=EXCLUDED.unique_drugs, unique_conditions=EXCLUDED.unique_conditions,
    trials_with_pros=EXCLUDED.trials_with_pros, refreshed_at=EXCLUDED.refreshed_at;
"""


# ── orchestration ────────────────────────────────────────────────────────────

def unique_scopes() -> dict[str, tuple[list[str] | None, list[str] | None]]:
    """Deduplicated {scope_key: (disease_areas, drug_classes)} across all active
    users, always including 'global'."""
    seen: dict[str, tuple] = {}
    for _username, cfg in get_all_access().items():
        da, dc = resolve_scope(cfg)
        seen.setdefault(build_scope_key(da, dc), (da, dc))
    seen.setdefault("global", (None, None))
    return seen


def rebuild_all_snapshots(timeout_s: int = 300) -> list[tuple[str, int]]:
    """Regenerate + upsert one snapshot row per unique access scope into the aact
    DB. Returns only the scopes rebuilt by this call; obsolete rows that may still
    exist in the snapshot table are not reported. Schema is assumed to already
    exist (created by scripts/generate_snapshot_sql.py's DDL section)."""
    scopes = unique_scopes()
    eng = get_engine("aact")
    with eng.begin() as conn:
        conn.exec_driver_sql(f"SET statement_timeout = '{int(timeout_s)}s'")
        for scope_key, (da, dc) in scopes.items():
            conn.exec_driver_sql(build_upsert_block(scope_key, build_scope_subquery(da, dc)))
    with eng.connect() as conn:
        rows = conn.exec_driver_sql(
            "SELECT scope_key, total_trials FROM public.overview_kpis_snapshot ORDER BY scope_key"
        ).fetchall()
    return [
        (sk, int(tt) if tt is not None else 0)
        for sk, tt in rows
        if sk in scopes
    ]
