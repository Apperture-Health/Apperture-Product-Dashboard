"""
Framework-agnostic filter state.
"""
from __future__ import annotations

from dataclasses import dataclass, field


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
