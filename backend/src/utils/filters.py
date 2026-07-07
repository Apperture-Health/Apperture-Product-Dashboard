"""
Framework-agnostic filter state + disease bucket catalog helpers.

Bucket conditions and MeSH terms are sourced from the single unified catalog
`catalogs/bucket_catalog.json`.
"""
from __future__ import annotations

import json
from dataclasses import dataclass, field
from functools import lru_cache
from pathlib import Path


# ── Catalog path helper ───────────────────────────────────────────────────────

def _catalog_path(filename: str) -> Path:
    backend_root = Path(__file__).resolve().parents[2]
    candidates = [
        backend_root / "catalogs" / filename,
        backend_root.parent / "catalogs" / filename,
    ]
    for c in candidates:
        if c.exists():
            return c
    return candidates[0]


# ── Unified bucket catalog ────────────────────────────────────────────────────
# Single bucket-keyed source of truth (catalogs/bucket_catalog.json):
#   { "<bucket>": { "conditions": [raw ctgov.conditions.name, ...],
#                   "mesh_terms": [drug_indications2.indication_mesh, ...] } }
# All lookups below are derived from this one file so a bucket's conditions and
# MeSH terms can never drift apart. Loaded once per process; lru_cache'd.

@lru_cache(maxsize=1)
def _load_bucket_catalog() -> dict[str, dict[str, list[str]]]:
    """Return the raw {bucket: {"conditions": [...], "mesh_terms": [...]}} catalog."""
    try:
        return json.loads(_catalog_path("bucket_catalog.json").read_text(encoding="utf-8"))
    except Exception:
        return {}


# ── Disease bucket mapping (derived from the unified catalog) ──────────────────

@lru_cache(maxsize=1)
def _load_disease_bucket_mapping() -> dict[str, str]:
    """Return {raw_condition_name: display_label}, flattened from the catalog."""
    result: dict[str, str] = {}
    for bucket, entry in _load_bucket_catalog().items():
        for raw in entry.get("conditions", []):
            result[raw] = bucket
    return result


@lru_cache(maxsize=1)
def _build_display_to_raw_map() -> dict[str, list[str]]:
    """Return {display_label: [raw_condition_name, ...]} from the catalog."""
    return {
        bucket: list(entry.get("conditions", []))
        for bucket, entry in _load_bucket_catalog().items()
    }


def get_unique_display_labels() -> list[str]:
    """Sorted list of unique display labels for the Condition dropdown."""
    return sorted(_load_bucket_catalog().keys())


def get_raw_conditions_for_display_label(display_label: str) -> list[str]:
    """
    Return every raw ctgov.conditions.name that maps to *display_label*.
    Falls back to [display_label] so callers can always build a valid IN clause.
    """
    if not display_label:
        return []
    reverse = _build_display_to_raw_map()
    return reverse.get(display_label, [display_label])


def get_display_label_for_raw_condition(raw_condition: str) -> str:
    """Map a single raw condition name to its display label (identity fallback)."""
    return _load_disease_bucket_mapping().get(raw_condition, raw_condition)


# ── Bucket ↔ MeSH mapping (derived from the unified catalog) ───────────────────
# Each disease bucket → the MeSH terms used in public.drug_indications2.indication_mesh.
# Drives brand resolution.

@lru_cache(maxsize=1)
def _build_mesh_to_bucket_map() -> dict[str, str]:
    """Return {mesh_term_lower: bucket_display_label} reverse mapping."""
    result: dict[str, str] = {}
    for bucket, entry in _load_bucket_catalog().items():
        for mesh in entry.get("mesh_terms", []):
            result[mesh.lower().strip()] = bucket
    return result


def get_mesh_terms_for_bucket(bucket: str) -> list[str]:
    """Return the MeSH terms mapped to *bucket* (empty list if none/unknown)."""
    if not bucket:
        return []
    return _load_bucket_catalog().get(bucket, {}).get("mesh_terms", [])


def get_bucket_for_mesh_term(mesh_term: str) -> str | None:
    """Map a single MeSH term back to its disease bucket (None if unknown)."""
    if not mesh_term:
        return None
    return _build_mesh_to_bucket_map().get(mesh_term.lower().strip())


# ── Static catalog helpers ────────────────────────────────────────────────────

@lru_cache(maxsize=1)
def _load_full_indication_list() -> tuple[str, ...]:
    """Return all available indications from the static catalog."""
    try:
        data = json.loads(_catalog_path("condition_sponsor_values.json").read_text(encoding="utf-8"))
        return tuple(sorted([v.strip() for v in data.get("condition_values", "").split("|") if v.strip()]))
    except Exception:
        return ()


@lru_cache(maxsize=1)
def _load_full_atc_class_list() -> tuple[str, ...]:
    """Return all available ATC drug classes from the static catalog."""
    try:
        data = json.loads(_catalog_path("condition_sponsor_values.json").read_text(encoding="utf-8"))
        return tuple(sorted([v.strip() for v in data.get("drug_class_values", "").split("|") if v.strip()]))
    except Exception:
        return ()


# ── FilterState ───────────────────────────────────────────────────────────────

@dataclass
class FilterState:
    indication_name: str | None = None
    atc_class_name: str | None = None
    sponsor: list[str] = field(default_factory=list)
    sponsor_agency_class: list[str] = field(default_factory=list)
    brand_name: list[str] = field(default_factory=list)
    drug_indication: str | None = None
    study_type: list[str] = field(default_factory=list)
    phase: list[str] = field(default_factory=list)
    overall_status: list[str] = field(default_factory=list)
    country: list[str] = field(default_factory=list)
    endpoint_category: list[str] = field(default_factory=list)
    outcome_type: list[str] = field(default_factory=list)
    pro_instrument: list[str] = field(default_factory=list)
    pro_domain: list[str] = field(default_factory=list)
    ae_organ_system: list[str] = field(default_factory=list)
    ae_term: list[str] = field(default_factory=list)
    has_results: bool | None = None
    enrollment_min: int | None = None
    enrollment_max: int | None = None
    allowed_indications: list[str] | None = None
    allowed_atc_classes: list[str] | None = None
    _resolved_brand_names: list[str] = field(default_factory=list)

    def has_global_filter(self) -> bool:
        return bool(self.indication_name or self.atc_class_name)

    def has_any_filter(self) -> bool:
        return (
            self.has_global_filter()
            or bool(
                self.sponsor or self.sponsor_agency_class
                or self.brand_name or self.drug_indication
                or self.study_type or self.phase
                or self.overall_status or self.country
                or self.endpoint_category or self.outcome_type
                or self.pro_instrument or self.pro_domain
                or self.ae_organ_system or self.ae_term
                or self.has_results is not None
                or self.enrollment_min is not None
                or self.enrollment_max is not None
            )
        )

    def active_filter_summary(self) -> dict[str, str]:
        out: dict[str, str] = {}
        if self.indication_name:
            out["Indication"] = self.indication_name
        if self.atc_class_name:
            out["Drug Class"] = self.atc_class_name
        if self.sponsor:
            out["Sponsor"] = ", ".join(self.sponsor)
        if self.sponsor_agency_class:
            out["Agency Class"] = ", ".join(self.sponsor_agency_class)
        if self.brand_name:
            out["Drug"] = ", ".join(self.brand_name)
        if self.drug_indication:
            out["Drug Indication"] = self.drug_indication
        if self.study_type:
            out["Study Type"] = ", ".join(self.study_type)
        if self.phase:
            out["Phase"] = ", ".join(self.phase)
        if self.overall_status:
            out["Status"] = ", ".join(self.overall_status)
        if self.country:
            out["Country"] = ", ".join(self.country)
        if self.endpoint_category:
            out["Endpoint Category"] = ", ".join(self.endpoint_category)
        if self.pro_instrument:
            out["PRO Instrument"] = ", ".join(self.pro_instrument)
        if self.pro_domain:
            out["PRO Domain"] = ", ".join(self.pro_domain)
        if self.has_results is not None:
            out["Has Results"] = "Yes" if self.has_results else "No"
        if self.enrollment_min is not None or self.enrollment_max is not None:
            lo = self.enrollment_min or 0
            hi = self.enrollment_max or "∞"
            out["Enrollment"] = f"{lo}-{hi}"
        return out


# ── User-access restriction helpers ──────────────────────────────────────────

def build_allowed_indications(user_access: dict) -> list[str] | None:
    """
    Compute the allowed_indications list from a user_access dict.

    Supports both inclusion (disease_areas) and exclusion (disease_areas_exclude);
    inclusion wins if both are supplied.
    Returns None when no restriction applies (all indications visible).
    """
    disease_areas         = user_access.get("disease_areas")
    disease_areas_exclude = user_access.get("disease_areas_exclude")

    if disease_areas is not None:
        return list(disease_areas)
    if disease_areas_exclude is not None:
        excl = {e.lower() for e in disease_areas_exclude}
        return [lbl for lbl in get_unique_display_labels() if lbl.lower() not in excl]
    return None


def build_allowed_atc_classes(user_access: dict) -> list[str] | None:
    """
    Compute the allowed_atc_classes list from a user_access dict.

    Supports both inclusion (drug_classes) and exclusion (drug_classes_exclude);
    inclusion wins if both are supplied.
    Returns None when no restriction applies.
    """
    drug_classes         = user_access.get("drug_classes")
    drug_classes_exclude = user_access.get("drug_classes_exclude")

    if drug_classes is not None:
        return list(drug_classes)
    if drug_classes_exclude is not None:
        excl = {e.lower() for e in drug_classes_exclude}
        return [c for c in _load_full_atc_class_list() if c.lower() not in excl]
    return None
