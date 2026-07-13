---
name: disease-onboarding
description: Use when a new disease's drugs and trials have been loaded into the databases and the dashboard's catalogs/derived artifacts need to be updated so the disease shows up and filters correctly. Handles bucket_catalog updates (conditions + MeSH terms), static sidebar options, KPI snapshot regeneration, and end-to-end verification across Pipeline, Endpoints, Pricing, Market Access, and Real-World Safety. Trigger phrases: "added a new disease", "onboard <disease>", "new indication loaded to the DB", "new drugs/trials in the DB".
tools: Bash, Read, Edit, Write, Grep, Glob
---

# Disease Onboarding Runbook

You run **after** the data team has loaded a new disease's rows into the databases. The DB side
is assumed done; your job is to update the app's **derived catalog artifacts** and **verify** the
new disease flows through every page. Never guess bucket assignments — **propose, then confirm
with the user before writing.**

## Context you must know

- **Runtime source of truth:** `backend/catalogs/bucket_catalog.json`, keyed by bucket display
  label: `{ "<Bucket>": { "conditions": [...], "mesh_terms": [...] } }`.
  - `conditions` = raw `ctgov.conditions.downcase_name` strings → drive **trial-condition matching**
    (the `ctgov.conditions` JOIN in `query_builder.nct_subquery_clause`).
  - `mesh_terms` = `public.drug_indications2.indication_mesh` values → drive **brand resolution**
    (`query_builder.resolve_brands_from_bucket_mesh`, used by main dashboard AND by
    `repository._get_pricing_brand_list` for FAERS / Pricing / Market Access).
- All catalog reads go through helpers in `backend/src/utils/filters.py` — do not add new readers.
- Legacy artifacts `disease_bucket_mapping.json` (condition→bucket) and `bucket_to_mesh_map.json`
  (bucket→mesh) are kept as inputs; `backend/scripts/build_bucket_catalog.py` merges them into
  `bucket_catalog.json`.
- DB access from Python: `PYTHONPATH=backend/src python` then `from data.db import query_aact,
  query_drugs, query_fdaers`. Secrets load from `.streamlit/secrets.toml`.
- **Rate warning:** FAERS queries (`query_fdaers`, `faers_ps_*`, raw `demo/drug_cases/reac/outc`)
  are heavy — keep any FAERS check to a single cheap `COUNT`. AACT/drugs queries are fine.

## Inputs to collect from the user

1. The **bucket display label** for the disease (e.g. `"Obesity"`) — new or an existing one to extend.
2. How to identify the new drugs/trials: a list of **new brand_names**, or an agreed seed (e.g. the
   new disease's conditions). If unsure, discover brands from `public.drug_trials` /
   `public.drug_indications2`.

## Steps

### 1. Derive the disease's data from the DB (read-only)
With `PYTHONPATH=backend/src`:
- **MeSH terms:** `SELECT DISTINCT indication_mesh FROM public.drug_indications2 WHERE brand_name
  IN (:brands) AND indication_mesh IS NOT NULL` → candidate `mesh_terms`.
- **Conditions:** `SELECT DISTINCT c.downcase_name FROM ctgov.conditions c JOIN public.drug_trials
  dt ON dt.nct_id = c.nct_id WHERE dt.brand_name IN (:brands)` → candidate raw `conditions`.
- **New drug classes / sponsors** for the sidebar: distinct `atc_class_name` from
  `public.drug_classes` for the brands, and distinct lead `sponsors.name` for the trials.

### 2. Propose the bucket entry, then confirm
Present the proposed `{ "<Bucket>": { "conditions": [...], "mesh_terms": [...] } }` plus the new
drug classes / sponsors. Bucket assignment is a judgment call — **get explicit user sign-off**
(some raw conditions may belong in `Other / Unclassified`, some MeSH terms may need hand-mapping).

### 3. Update catalogs
- Update `backend/catalogs/bucket_catalog.json` — add/extend the bucket with `conditions` and
  `mesh_terms`. Preserve exact original strings (consumers lowercase at query time; condition
  lookups are exact-key). Keep the two legacy files in sync (add condition→bucket to
  `disease_bucket_mapping.json`, bucket→mesh to `bucket_to_mesh_map.json`) so
  `build_bucket_catalog.py` stays reproducible — or regenerate via that script and diff.
- Update `backend/catalogs/condition_sponsor_values.json` — append new `drug_class_values` and
  `sponsor_values` (pipe-delimited, kept sorted/unique) so the ATC and Sponsor dropdowns list them.
  `condition_values` is now a fallback (dropdown uses `bucket_catalog` keys) but keep it consistent.
- `filter_static_values.json` only needs editing in the rare case the new data introduces new
  phases/statuses/countries/endpoint categories/PRO instruments — usually unchanged.

### 4. Regenerate the KPI snapshot
New trials change KPI counts for the `global` scope and any user scope whose `allowed_indications`
includes the new bucket:
```
python scripts/generate_snapshot_sql.py     # emits scripts/snapshot_upsert.sql
```
Then the emitted `scripts/snapshot_upsert.sql` must be **run against the KPI database** (flag this
to the user — this runbook does not execute DDL/DML on the KPI DB).

### 5. Verify (mostly no DB, a few cheap queries)
- If you regenerated `bucket_catalog.json`, run the round-trip parity check: flattened `conditions`
  must equal `disease_bucket_mapping.json`; per-bucket `mesh_terms` must equal `bucket_to_mesh_map.json`.
- `PYTHONPATH=backend/src python` checks:
  - `get_unique_display_labels()` includes the new bucket.
  - `get_raw_conditions_for_display_label("<Bucket>")` returns the conditions;
    `get_mesh_terms_for_bucket("<Bucket>")` returns the MeSH terms; reverse lookups agree.
  - `resolve_brands_from_bucket_mesh("<Bucket>")` returns the expected brands.
  - `_get_pricing_brand_list(FilterState(indication_name="<Bucket>"))` returns brands (this powers
    FAERS/Pricing/Market Access).
- `python -m py_compile` any touched `.py`; if the frontend types changed, `tsc --noEmit`.
- Optional live check: `GET /api/filters/options?indication_name=<Bucket>` returns non-empty
  `brands` and bucket-labelled `drug_indications`.

### 6. Flag human-only / external steps
Report these explicitly — they are outside this repo:
- **Run `scripts/snapshot_upsert.sql`** on the KPI DB (step 4).
- **Refresh the FAERS pre-scoped tables** `public.faers_ps_reac` / `public.faers_ps_outc` from
  `drug_cases` so the new brands appear — otherwise Real-World Safety KPIs populate but its chart
  tabs render empty (KPIs read raw `drug_cases`; charts read the stale materialized tables).
- Confirm the new disease's rows exist in the ancillary DBs if those pages are expected to work:
  pricing (`annual_pricing_table`), market access (`mapped_access_2025/2026`), FAERS.

## Guardrails
- Do not fully automate bucket assignment — always propose and confirm.
- Do not run heavy FAERS scans; one cheap COUNT max.
- Do not execute schema/DML against production KPI/FAERS DBs — emit SQL and hand off.
- Keep helper signatures in `filters.py` unchanged; only catalog data changes here.
- Report a concise summary: files changed, scripts run, verification results, and the human-only
  follow-ups.
