from __future__ import annotations

from typing import Any

from pydantic import BaseModel, Field


class AuthLoginRequest(BaseModel):
    username: str
    password: str


class AuthSessionDTO(BaseModel):
    authenticated: bool
    username: str | None = None
    display_name: str | None = None
    visible_tabs: list[str] = Field(default_factory=list)
    allowed_indications: list[str] | None = None
    allowed_atc_classes: list[str] | None = None


class FilterStateDTO(BaseModel):
    indication_name: str | None = None
    atc_class_name: str | None = None
    sponsor: list[str] = Field(default_factory=list)
    sponsor_agency_class: list[str] = Field(default_factory=list)
    brand_name: list[str] = Field(default_factory=list)
    drug_indication: str | None = None
    study_type: list[str] = Field(default_factory=list)
    phase: list[str] = Field(default_factory=list)
    overall_status: list[str] = Field(default_factory=list)
    country: list[str] = Field(default_factory=list)
    endpoint_category: list[str] = Field(default_factory=list)
    outcome_type: list[str] = Field(default_factory=list)
    pro_instrument: list[str] = Field(default_factory=list)
    pro_domain: list[str] = Field(default_factory=list)
    ae_organ_system: list[str] = Field(default_factory=list)
    ae_term: list[str] = Field(default_factory=list)
    has_results: bool | None = None
    enrollment_min: int | None = None
    enrollment_max: int | None = None
    allowed_indications: list[str] | None = None
    allowed_atc_classes: list[str] | None = None


class FiltersOptionsDTO(BaseModel):
    indications: list[str] = Field(default_factory=list)
    atc_classes: list[str] = Field(default_factory=list)
    sponsors: list[str] = Field(default_factory=list)
    agency_classes: list[str] = Field(default_factory=list)
    study_types: list[str] = Field(default_factory=list)
    phases: list[str] = Field(default_factory=list)
    statuses: list[str] = Field(default_factory=list)
    countries: list[str] = Field(default_factory=list)
    categories: list[str] = Field(default_factory=list)
    pro_instruments: list[str] = Field(default_factory=list)
    brands: list[str] = Field(default_factory=list)
    domains: list[str] = Field(default_factory=list)
    drug_indications: list[str] = Field(default_factory=list)


class PageRequest(BaseModel):
    filters: FilterStateDTO = Field(default_factory=FilterStateDTO)
    pipeline_classes: list[str] = Field(default_factory=list)


class MarketAccessPageRequest(PageRequest):
    year: int = 2025


class SafetyDetailRequest(PageRequest):
    organ_system: str | None = None
    ae_term: str | None = None


class AiExtractRequest(BaseModel):
    question: str


class AiExtractResponse(BaseModel):
    extracted: dict[str, Any]


class AiPageSummaryRequest(BaseModel):
    filters: FilterStateDTO = Field(default_factory=FilterStateDTO)
    year: int = 2025
