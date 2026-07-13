from __future__ import annotations

from pathlib import Path
import asyncio
import json

from fastapi import APIRouter, HTTPException, Query, Request
from fastapi.concurrency import run_in_threadpool
from fastapi.responses import StreamingResponse

from api.page_registry import PAGE_MAP
from api.schemas import (
    AiExtractRequest,
    AiExtractResponse,
    AiPageSummaryRequest,
    AuthLoginRequest,
    AuthSessionDTO,
    FilterStateDTO,
    FiltersOptionsDTO,
    MarketAccessPageRequest,
    PageRequest,
    SafetyDetailRequest,
)
from data.repository import (
    get_ae_by_drug,
    get_ae_detail_table,
    get_arms_distribution,
    get_atc_class_options,
    get_annual_cost_by_drug_class,
    get_annual_cost_per_brand_over_time,
    get_annual_pricing_raw,
    get_design_outcomes,
    get_design_outcome_type_category_heatmap,
    get_drug_brand_names,
    get_drug_classes,
    get_drug_phase_brand_heatmap,
    get_drug_trials,
    get_eligibility_distribution,
    get_filter_options,
    get_groups_per_trial_dist,
    get_indication_options,
    get_ma_kpis,
    get_ma_req_grid,
    get_ma_tier_grid,
    get_outcome_type_category_heatmap,
    get_overview_kpis,
    get_pipeline_by_class,
    get_pipeline_by_indication,
    get_pipeline_by_sponsor,
    get_pipeline_kpis,
    get_pipeline_pro_usage,
    get_pipeline_sponsor_indication_heatmap,
    get_pipeline_top_interventions,
    get_pipeline_trials_table,
    get_pro_by_phase,
    get_pro_by_sponsor,
    get_pro_usage,
    get_reported_outcome_categories,
    get_reported_pro_funnel,
    get_result_groups,
    get_sponsor_endpoint_usage,
    get_sponsor_phase_mix,
    get_sponsor_pro_adoption,
    get_sponsor_trial_counts,
    get_top_conditions,
    get_top_design_endpoints,
    get_top_interventions,
    get_top_sponsors,
    get_trial_design_metrics,
    get_trial_groups,
    get_trials_by_phase,
    get_trials_over_time,
    get_wac_price_history,
    get_ae_aggregates,
    get_pricing_kpis,
    get_trials_with_outcomes,
    get_outcome_data_for_trial,
    get_faers_brand_scope,
    get_faers_kpis,
    get_top_reactions,
    get_reactions_by_soc,
    get_outcomes_distribution,
    get_outcome_brand_heatmap,
    get_reaction_brand_heatmap,
)
from services.ai_summary import (
    build_drug_detail_context,
    build_drug_pricing_context,
    build_market_access_context,
    build_pipeline_context,
    build_pro_overview_context,
    generate_summary,
)
from services.analytics import aggregate_pro_usage
from services.pro_analysis import planned_vs_reported_pivot, top_instruments
from utils.auth import authenticate, get_allowed_tabs_for_user, get_user_access
from utils.filters import FilterState, build_allowed_indications, build_allowed_atc_classes, get_unique_display_labels
from utils.runtime import runtime


api_router = APIRouter()


def _catalog_path(filename: str) -> Path:
    backend_root = Path(__file__).resolve().parents[2]
    candidates = [
        backend_root / "catalogs" / filename,
        backend_root.parent / "catalogs" / filename,
    ]
    for candidate in candidates:
        if candidate.exists():
            return candidate
    return candidates[0]


def _user_access_from_session(session: dict) -> tuple[list[str] | None, list[str] | None]:
    """Recompute allowed_indications/atc_classes from username — never read them
    from the cookie, because large lists push the cookie over the 4 KB browser limit."""
    username = session.get("username")
    access = get_user_access(username) if username else {}
    return build_allowed_indications(access), build_allowed_atc_classes(access)


def _filter_state(dto: FilterStateDTO, request: Request | None = None) -> FilterState:
    allowed_indications = dto.allowed_indications
    allowed_atc_classes = dto.allowed_atc_classes
    if request is not None:
        session = request.session.get("auth")
        if session:
            allowed_indications, allowed_atc_classes = _user_access_from_session(session)
    return FilterState(
        indication_name=dto.indication_name,
        atc_class_name=dto.atc_class_name,
        sponsor=dto.sponsor,
        sponsor_agency_class=dto.sponsor_agency_class,
        brand_name=dto.brand_name,
        drug_indication=dto.drug_indication,
        study_type=dto.study_type,
        phase=dto.phase,
        overall_status=dto.overall_status,
        country=dto.country,
        endpoint_category=dto.endpoint_category,
        outcome_type=dto.outcome_type,
        pro_instrument=dto.pro_instrument,
        pro_domain=dto.pro_domain,
        ae_organ_system=dto.ae_organ_system,
        ae_term=dto.ae_term,
        has_results=dto.has_results,
        enrollment_min=dto.enrollment_min,
        enrollment_max=dto.enrollment_max,
        allowed_indications=allowed_indications,
        allowed_atc_classes=allowed_atc_classes,
    )


def _require_auth(request: Request) -> dict:
    auth = request.session.get("auth")
    if not auth:
        raise HTTPException(status_code=401, detail="Authentication required")
    return auth


def _session_payload(username: str) -> AuthSessionDTO:
    access = get_user_access(username)
    visible_tabs = get_allowed_tabs_for_user(username)
    return AuthSessionDTO(
        authenticated=True,
        username=username,
        display_name=access.get("display_name", username.capitalize()),
        visible_tabs=visible_tabs,
        allowed_indications=build_allowed_indications(access),
        allowed_atc_classes=build_allowed_atc_classes(access),
    )


def _records(df) -> list[dict]:
    if df is None or getattr(df, "empty", True):
        return []
    return json.loads(df.to_json(orient="records", date_format="iso"))


@api_router.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@api_router.post("/auth/login", response_model=AuthSessionDTO)
def login(payload: AuthLoginRequest, request: Request) -> AuthSessionDTO:
    ok, access = authenticate(payload.username, payload.password)
    if not ok:
        raise HTTPException(status_code=401, detail="Invalid username or password")
    session = _session_payload(payload.username)
    # Store only small fields in the cookie — allowed_indications can be 100+ strings
    # which pushes the cookie over the 4 KB browser limit and causes silent auth failures.
    request.session["auth"] = {
        "authenticated": session.authenticated,
        "username": session.username,
        "display_name": session.display_name,
        "visible_tabs": session.visible_tabs,
    }
    return session


@api_router.post("/auth/logout", response_model=AuthSessionDTO)
def logout(request: Request) -> AuthSessionDTO:
    request.session.clear()
    return AuthSessionDTO(authenticated=False)


@api_router.get("/auth/me", response_model=AuthSessionDTO)
def me(request: Request) -> AuthSessionDTO:
    auth = request.session.get("auth")
    if not auth:
        return AuthSessionDTO(authenticated=False)
    allowed_indications, allowed_atc_classes = _user_access_from_session(auth)
    return AuthSessionDTO(
        **auth,
        allowed_indications=allowed_indications,
        allowed_atc_classes=allowed_atc_classes,
    )


@api_router.get("/api/meta/pages")
def pages() -> dict[str, list[dict[str, str]]]:
    return {
        "pages": [
            {"key": key, "label": label, "title": title}
            for key, label, title in PAGE_MAP
        ]
    }


@api_router.get("/api/filters/options", response_model=FiltersOptionsDTO)
def filter_options(
    request: Request,
    indication_name: str | None = Query(default=None),
    atc_class_name: str | None = Query(default=None),
) -> FiltersOptionsDTO:
    auth = _require_auth(request)
    allowed_indications, allowed_atc_classes = _user_access_from_session(auth)
    static_options = _static_sidebar_options()
    if indication_name or atc_class_name:
        options = get_filter_options(indication_name, atc_class_name)
    else:
        options = static_options.copy()
    options["indications"] = _apply_allowed_options(
        static_options["indications"],
        allowed_indications,
    )
    options["atc_classes"] = _apply_allowed_options(
        static_options["atc_classes"],
        allowed_atc_classes,
    )
    return FiltersOptionsDTO(**options)


@runtime.cache_data(ttl=86400)
def _load_ai_catalogs() -> tuple[dict, dict]:
    catalog = json.loads(_catalog_path("condition_sponsor_values.json").read_text(encoding="utf-8"))
    static = json.loads(_catalog_path("filter_static_values.json").read_text(encoding="utf-8"))
    return catalog, static


def _catalog_list(raw: str) -> list[str]:
    return sorted([value.strip() for value in raw.split("|") if value.strip()])


@runtime.cache_data(ttl=3600)
def _static_sidebar_options() -> dict[str, list[str]]:
    catalog, static = _load_ai_catalogs()
    # Use display labels from disease_bucket_mapping.json as the primary source
    # so the sidebar shows human-readable names (e.g. "Non-Small Cell Lung Cancer")
    # rather than raw DB values. Fall back to the catalog / DB query if the
    # mapping file is unavailable.
    indications = get_unique_display_labels()
    if not indications:
        indications = _catalog_list(catalog.get("condition_values", "")) or get_indication_options()
    atc_classes = _catalog_list(catalog.get("drug_class_values", ""))
    sponsors = _catalog_list(catalog.get("sponsor_values", ""))
    return {
        "indications": indications,
        "atc_classes": atc_classes or get_atc_class_options(),
        "sponsors": sponsors,
        "agency_classes": list(static.get("agency_classes", [])),
        "study_types": list(static.get("study_types", [])),
        "phases": list(static.get("phases", [])),
        "statuses": list(static.get("overall_statuses", [])),
        "countries": list(static.get("countries", [])),
        "categories": list(static.get("endpoint_categories", [])),
        "pro_instruments": list(static.get("pro_instruments", [])),
        "domains": list(static.get("pro_domains", [])),
        "brands": [],
        "drug_indications": [],
    }


def _apply_allowed_options(values: list[str], allowed: list[str] | None) -> list[str]:
    if allowed is None:
        return values
    if not values:
        return allowed
    allowed_set = set(allowed)
    filtered = [value for value in values if value in allowed_set]
    return filtered or allowed


def _extract_filters(question: str) -> dict:
    import openai

    api_key = runtime.secrets.get("openai_api_key", "")
    if not api_key:
        raise HTTPException(status_code=500, detail="OpenAI API key not configured")

    catalog, static = _load_ai_catalogs()
    conditions = get_unique_display_labels() or [v.strip() for v in catalog.get("condition_values", "").split("|") if v.strip()]
    sponsors = [v.strip() for v in catalog.get("sponsor_values", "").split("|") if v.strip()]
    drug_classes = [v.strip() for v in catalog.get("drug_class_values", "").split("|") if v.strip()]

    system_prompt = (
        "You are a filter extraction agent for a clinical trials analytics platform. "
        "Return a JSON object with keys indication, atc_class, sponsors, phases, statuses, "
        "countries, agency_class, has_results, interpretation. "
        "Match values exactly from the provided lists. "
        "Set a key to null (or [] for array fields) ONLY when the user explicitly did not mention "
        "that filter — do not infer filters from context. "
        "For example, if the user mentions a disease area but no drug class, set atc_class to null. "
        "If the user mentions no sponsors, set sponsors to [].\n\n"
        f"Conditions: {' | '.join(conditions)}\n\n"
        f"Sponsors: {' | '.join(sponsors)}\n\n"
        f"Drug Classes: {' | '.join(drug_classes)}\n\n"
        f"Phases: {' | '.join(static.get('phases', []))}\n\n"
        f"Statuses: {' | '.join(static.get('overall_statuses', []))}\n\n"
        f"Countries: {' | '.join(static.get('countries', []))}\n\n"
        f"Agency Classes: {' | '.join(static.get('agency_classes', []))}\n"
    )
    client = openai.OpenAI(api_key=api_key)
    response = client.chat.completions.create(
        model="gpt-4.1-mini",
        temperature=0,
        max_tokens=500,
        response_format={"type": "json_object"},
        messages=[
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": question},
        ],
    )
    return json.loads(response.choices[0].message.content.strip())


@api_router.post("/api/ai/extract-filters", response_model=AiExtractResponse)
def ai_extract_filters(payload: AiExtractRequest, request: Request) -> AiExtractResponse:
    _require_auth(request)
    return AiExtractResponse(extracted=_extract_filters(payload.question.strip()))


@api_router.post("/api/pages/home")
def home_page(payload: PageRequest, request: Request) -> dict:
    _require_auth(request)
    filters = _filter_state(payload.filters, request)
    kpis = get_overview_kpis(filters)
    if not filters.has_any_filter():
        return {
            "kpis": kpis,
            "trialsByPhase": [],
            "trialsOverTime": [],
            "topSponsors": [],
            "topConditions": [],
            "topInterventions": [],
            "kpiSource": "snapshot",
        }
    top_sponsors = _records(get_top_sponsors(filters, limit=15))
    return {
        "kpis": kpis,
        "trialsByPhase": _records(get_trials_by_phase(filters)),
        "trialsOverTime": _records(get_trials_over_time(filters)),
        "topSponsors": top_sponsors,
        "topConditions": _records(get_top_conditions(filters, limit=15)),
        "topInterventions": _records(get_top_interventions(filters, limit=20)),
        "kpiSource": "live",
    }


@api_router.post("/api/pages/pipeline")
def pipeline_page(payload: PageRequest, request: Request) -> dict:
    _require_auth(request)
    filters = _filter_state(payload.filters, request)
    bucket = filters.indication_name
    sponsors = tuple(filters.sponsor)
    pipeline_classes = tuple(getattr(payload, "pipeline_classes", None) or [])
    trials_df = get_pipeline_trials_table(bucket, pipeline_classes)
    if filters.sponsor and not trials_df.empty:
        trials_df = trials_df[trials_df["sponsor_name"].isin(filters.sponsor)]
    heat_df = get_pipeline_sponsor_indication_heatmap(bucket, sponsors, pipeline_classes)
    return {
        "kpis": get_pipeline_kpis(bucket, sponsors, pipeline_classes),
        "bySponsor": _records(get_pipeline_by_sponsor(bucket, sponsors, pipeline_classes, limit=20)),
        "byIndication": _records(get_pipeline_by_indication(bucket, sponsors, pipeline_classes, limit=25)),
        "topInterventions": _records(get_pipeline_top_interventions(bucket, sponsors, pipeline_classes, limit=25)),
        "sponsorIndicationHeatmap": _records(heat_df),
        "proUsage": _records(get_pipeline_pro_usage(bucket, sponsors, pipeline_classes, limit=20)),
        "pipelineByClass": _records(get_pipeline_by_class(bucket, sponsors, pipeline_classes)),
        "trialsTable": _records(trials_df),
    }


@api_router.post("/api/pages/drug-detail")
def drug_detail_page(payload: PageRequest, request: Request) -> dict:
    _require_auth(request)
    filters = _filter_state(payload.filters, request)
    phase_heat = get_drug_phase_brand_heatmap(filters)
    phase_heat_records: list[dict] = []
    if not phase_heat.empty:
        melted = phase_heat.reset_index().melt(
            id_vars=["phase"],
            var_name="brand_name",
            value_name="trial_count",
        )
        phase_heat_records = _records(melted)
    return {
        "kpis": get_overview_kpis(filters),
        "trialsTable": _records(get_drug_trials(filters)),
        "brandCounts": _records(get_drug_brand_names(filters)),
        "drugClasses": _records(get_drug_classes(filters)),
        "phaseBrandHeatmap": phase_heat_records,
    }


@api_router.post("/api/pages/drug-pricing")
def drug_pricing_page(payload: PageRequest, request: Request) -> dict:
    _require_auth(request)
    filters = _filter_state(payload.filters, request)
    return {
        "kpis": get_pricing_kpis(filters),
        "annualCostPerBrandOverTime": _records(get_annual_cost_per_brand_over_time(filters)),
        "annualCostByDrugClass": _records(get_annual_cost_by_drug_class(filters)),
        "wacPriceHistory": _records(get_wac_price_history(filters)),
        "rawPricing": _records(get_annual_pricing_raw(filters)),
    }


@api_router.post("/api/pages/market-access")
def market_access_page(payload: MarketAccessPageRequest, request: Request) -> dict:
    _require_auth(request)
    filters = _filter_state(payload.filters, request)
    return {
        "kpis": get_ma_kpis(filters, year=payload.year),
        "tierGrid": _records(get_ma_tier_grid(filters, year=payload.year)),
        "requirementGrid": _records(get_ma_req_grid(filters, year=payload.year)),
        "year": payload.year,
    }


@api_router.post("/api/pages/sponsors")
def sponsors_page(payload: PageRequest, request: Request) -> dict:
    _require_auth(request)
    filters = _filter_state(payload.filters, request)
    return {
        "trialCounts": _records(get_sponsor_trial_counts(filters, limit=20)),
        "phaseMix": _records(get_sponsor_phase_mix(filters, limit=15)),
        "proAdoption": _records(get_sponsor_pro_adoption(filters, limit=15)),
        "endpointUsage": _records(get_sponsor_endpoint_usage(filters, limit=10)),
    }


@api_router.post("/api/pages/trial-design")
def trial_design_page(payload: PageRequest, request: Request) -> dict:
    _require_auth(request)
    filters = _filter_state(payload.filters, request)
    return {
        "designMetrics": _records(get_trial_design_metrics(filters)),
        "armsDistribution": _records(get_arms_distribution(filters)),
        "eligibilityDistribution": _records(get_eligibility_distribution(filters)),
    }


@api_router.post("/api/pages/planned-endpoints")
def planned_endpoints_page(payload: PageRequest, request: Request) -> dict:
    _require_auth(request)
    filters = _filter_state(payload.filters, request)
    heatmap = get_design_outcome_type_category_heatmap(filters)
    heatmap_records: list[dict] = []
    if not heatmap.empty:
        melted = heatmap.reset_index().melt(
            id_vars=["outcome_type"],
            var_name="outcome_category",
            value_name="trial_count",
        )
        heatmap_records = _records(melted)
    return {
        "designOutcomeTypeCategoryHeatmap": heatmap_records,
        "topDesignEndpoints": _records(get_top_design_endpoints(filters, limit=10)),
        "reportedProFunnel": _records(get_reported_pro_funnel(filters)),
        "designOutcomesTable": _records(get_design_outcomes(filters)),
    }


@api_router.post("/api/pages/reported-outcomes")
def reported_outcomes_page(payload: PageRequest, request: Request) -> dict:
    _require_auth(request)
    filters = _filter_state(payload.filters, request)
    heatmap = get_outcome_type_category_heatmap(filters)
    heatmap_records: list[dict] = []
    if not heatmap.empty:
        melted = heatmap.reset_index().melt(
            id_vars=["outcome_type"],
            var_name="outcome_category",
            value_name="trial_count",
        )
        heatmap_records = _records(melted)
    return {
        "reportedOutcomeCategories": _records(get_reported_outcome_categories(filters)),
        "outcomeTypeCategoryHeatmap": heatmap_records,
        "reportedProFunnel": _records(get_reported_pro_funnel(filters)),
    }


@api_router.post("/api/pages/outcome-scores")
def outcome_scores_page(payload: PageRequest, request: Request) -> dict:
    _require_auth(request)
    filters = _filter_state(payload.filters, request)
    if not filters.has_any_filter():
        return {"trialsWithOutcomes": [], "filterRequired": True}
    return {
        "trialsWithOutcomes": _records(get_trials_with_outcomes(filters)),
        "filterRequired": False,
    }


@api_router.get("/api/pages/outcome-scores/trial/{nct_id}")
def outcome_scores_trial(nct_id: str, request: Request) -> dict:
    _require_auth(request)
    return {"outcomeData": _records(get_outcome_data_for_trial(nct_id))}


@api_router.post("/api/pages/pro-overview")
def pro_overview_page(payload: PageRequest, request: Request) -> dict:
    _require_auth(request)
    filters = _filter_state(payload.filters, request)
    return {
        "proUsageRaw": _records(get_pro_usage(filters)),
        "reportedProFunnel": _records(get_reported_pro_funnel(filters)),
        "proBySponsor": _records(get_pro_by_sponsor(filters, limit=15)),
        "proByPhase": _records(get_pro_by_phase(filters)),
    }


@api_router.post("/api/pages/trial-groups")
def trial_groups_page(payload: PageRequest, request: Request) -> dict:
    _require_auth(request)
    filters = _filter_state(payload.filters, request)
    return {
        "designGroups": _records(get_trial_groups(filters)),
        "resultGroups": _records(get_result_groups(filters)),
        "groupsPerTrialDistribution": _records(get_groups_per_trial_dist(filters)),
    }


@api_router.post("/api/pages/safety")
def safety_page(payload: PageRequest, request: Request) -> dict:
    _require_auth(request)
    filters = _filter_state(payload.filters, request)
    ae_aggregates = get_ae_aggregates(filters)
    return {
        "aeAggregates": {
            "topAe": _records(ae_aggregates.get("top_ae")),
            "organSystems": _records(ae_aggregates.get("organ")),
        },
        "aeByDrug": _records(get_ae_by_drug(filters, limit=20)),
    }


@api_router.post("/api/pages/safety/detail")
def safety_detail_page(payload: SafetyDetailRequest, request: Request) -> dict:
    _require_auth(request)
    filters = _filter_state(payload.filters, request)
    return {
        "detail": _records(get_ae_detail_table(filters, payload.organ_system, payload.ae_term)),
    }


@api_router.post("/api/ai/page-summary/{page_key}")
def ai_page_summary(page_key: str, payload: AiPageSummaryRequest, request: Request) -> dict[str, str]:
    _require_auth(request)
    filters = _filter_state(payload.filters, request)
    page_key = page_key.lower()

    if page_key == "drug-detail":
        kpis = get_overview_kpis(filters)
        brands_df = get_drug_brand_names(filters)
        classes_df = get_drug_classes(filters)
        phase_heat_df = get_drug_phase_brand_heatmap(filters)
        trials_df = get_drug_trials(filters)
        context = build_drug_detail_context(kpis, brands_df, classes_df, phase_heat_df, trials_df, filters)
        summary = generate_summary(context, page_name="Drug Detail")
    elif page_key == "pipeline":
        bucket = filters.indication_name
        sponsors = tuple(filters.sponsor)
        pipeline_classes: tuple = ()
        kpis = get_pipeline_kpis(bucket, sponsors, pipeline_classes)
        sp_df = get_pipeline_by_sponsor(bucket, sponsors, pipeline_classes, limit=20)
        ind_df = get_pipeline_by_indication(bucket, sponsors, pipeline_classes, limit=25)
        intv_df = get_pipeline_top_interventions(bucket, sponsors, pipeline_classes, limit=25)
        pro_df = get_pipeline_pro_usage(bucket, sponsors, pipeline_classes, limit=20)
        trials_df = get_pipeline_trials_table(bucket, pipeline_classes)
        if filters.sponsor and not trials_df.empty:
            trials_df = trials_df[trials_df["sponsor_name"].isin(filters.sponsor)]
        context = build_pipeline_context(kpis, sp_df, ind_df, intv_df, pro_df, trials_df, filters)
        summary = generate_summary(context, page_name="Pipeline Landscape")
    elif page_key == "drug-pricing":
        kpis = get_pricing_kpis(filters)
        brand_cost_df = get_annual_cost_per_brand_over_time(filters)
        drug_class_df = get_annual_cost_by_drug_class(filters)
        wac_df = get_wac_price_history(filters)
        context = build_drug_pricing_context(kpis, brand_cost_df, drug_class_df, wac_df, filters)
        summary = generate_summary(context, page_name="Drug Pricing")
    elif page_key == "market-access":
        kpis = get_ma_kpis(filters, year=payload.year)
        tier_df = get_ma_tier_grid(filters, year=payload.year)
        req_df = get_ma_req_grid(filters, year=payload.year)
        context = build_market_access_context(kpis, tier_df, req_df, payload.year, filters)
        summary = generate_summary(context, page_name="Market Access")
    elif page_key == "pro-overview":
        raw_df = get_pro_usage(filters)
        funnel_df = get_reported_pro_funnel(filters)
        sp_df = get_pro_by_sponsor(filters, limit=15)
        phase_df = get_pro_by_phase(filters)
        agg_df = aggregate_pro_usage(raw_df)
        top_df = top_instruments(agg_df, n=15)
        pivot_df = planned_vs_reported_pivot(raw_df)
        context = build_pro_overview_context(
            {
                "unique_instruments": len(agg_df) if not agg_df.empty else 0,
                "planned_pro_trials": int(funnel_df.loc[funnel_df["stage"] == "Planned PROs", "trial_count"].iloc[0]) if not funnel_df.empty and (funnel_df["stage"] == "Planned PROs").any() else 0,
                "reported_pro_trials": int(funnel_df.loc[funnel_df["stage"] == "Reported PROs", "trial_count"].iloc[0]) if not funnel_df.empty and (funnel_df["stage"] == "Reported PROs").any() else 0,
            },
            top_df,
            sp_df,
            phase_df,
            funnel_df,
            pivot_df,
            filters,
        )
        summary = generate_summary(context, page_name="PRO Overview")
    else:
        raise HTTPException(status_code=404, detail="AI summary not available for this page")

    if not summary:
        raise HTTPException(status_code=500, detail="Failed to generate summary")
    return {"summary": summary}


# ─── Progressive streaming endpoints ─────────────────────────────────────────
#
# Each endpoint yields NDJSON chunks as queries complete in parallel.
# KPIs arrive first; chart queries run concurrently via asyncio tasks.
# The frontend merges each chunk into partialData, rendering as data arrives.


@api_router.post("/api/pages/home/stream")
async def home_page_stream(payload: PageRequest, request: Request) -> StreamingResponse:
    _require_auth(request)
    filters = _filter_state(payload.filters, request)

    async def generate():
        kpis = await run_in_threadpool(get_overview_kpis, filters)
        yield json.dumps({"kpis": kpis}) + "\n"

        if not filters.has_any_filter():
            yield json.dumps({
                "trialsByPhase": [], "trialsOverTime": [], "topSponsors": [],
                "topConditions": [], "topInterventions": [], "kpiSource": "snapshot",
            }) + "\n"
            return

        async def _fetch(key, fn, *args):
            data = await run_in_threadpool(fn, *args)
            return key, _records(data)

        tasks = [
            asyncio.create_task(_fetch("trialsByPhase", get_trials_by_phase, filters)),
            asyncio.create_task(_fetch("trialsOverTime", get_trials_over_time, filters)),
            asyncio.create_task(_fetch("topSponsors", get_top_sponsors, filters, 15)),
            asyncio.create_task(_fetch("topConditions", get_top_conditions, filters, 15)),
            asyncio.create_task(_fetch("topInterventions", get_top_interventions, filters, 20)),
        ]
        for future in asyncio.as_completed(tasks):
            key, data = await future
            yield json.dumps({key: data}) + "\n"

        yield json.dumps({"kpiSource": "live"}) + "\n"

    return StreamingResponse(generate(), media_type="application/x-ndjson")


@api_router.post("/api/pages/pipeline/stream")
async def pipeline_page_stream(payload: PageRequest, request: Request) -> StreamingResponse:
    _require_auth(request)
    filters = _filter_state(payload.filters, request)
    bucket = filters.indication_name
    sponsors = tuple(filters.sponsor)
    pipeline_classes = tuple(getattr(payload, "pipeline_classes", None) or [])

    async def generate():
        kpis = await run_in_threadpool(get_pipeline_kpis, bucket, sponsors, pipeline_classes)
        yield json.dumps({"kpis": kpis}) + "\n"

        async def _fetch(key, fn, *args):
            data = await run_in_threadpool(fn, *args)
            return key, _records(data)

        async def _fetch_table():
            df = await run_in_threadpool(get_pipeline_trials_table, bucket, pipeline_classes)
            if filters.sponsor and not df.empty:
                df = df[df["sponsor_name"].isin(filters.sponsor)]
            return "trialsTable", _records(df)

        tasks = [
            asyncio.create_task(_fetch("pipelineByClass", get_pipeline_by_class, bucket, sponsors, pipeline_classes)),
            asyncio.create_task(_fetch("bySponsor", get_pipeline_by_sponsor, bucket, sponsors, pipeline_classes, 20)),
            asyncio.create_task(_fetch("byIndication", get_pipeline_by_indication, bucket, sponsors, pipeline_classes, 25)),
            asyncio.create_task(_fetch("topInterventions", get_pipeline_top_interventions, bucket, sponsors, pipeline_classes, 25)),
            asyncio.create_task(_fetch("proUsage", get_pipeline_pro_usage, bucket, sponsors, pipeline_classes, 20)),
            asyncio.create_task(_fetch("sponsorIndicationHeatmap", get_pipeline_sponsor_indication_heatmap, bucket, sponsors, pipeline_classes)),
            asyncio.create_task(_fetch_table()),
        ]
        for future in asyncio.as_completed(tasks):
            key, data = await future
            yield json.dumps({key: data}) + "\n"

    return StreamingResponse(generate(), media_type="application/x-ndjson")


@api_router.post("/api/pages/drug-detail/stream")
async def drug_detail_page_stream(payload: PageRequest, request: Request) -> StreamingResponse:
    _require_auth(request)
    filters = _filter_state(payload.filters, request)

    async def generate():
        kpis = await run_in_threadpool(get_overview_kpis, filters)
        yield json.dumps({"kpis": kpis}) + "\n"

        async def _fetch(key, fn, *args):
            data = await run_in_threadpool(fn, *args)
            return key, _records(data)

        async def _fetch_heatmap():
            phase_heat = await run_in_threadpool(get_drug_phase_brand_heatmap, filters)
            if phase_heat.empty:
                return "phaseBrandHeatmap", []
            melted = phase_heat.reset_index().melt(
                id_vars=["phase"], var_name="brand_name", value_name="trial_count",
            )
            return "phaseBrandHeatmap", _records(melted)

        tasks = [
            asyncio.create_task(_fetch("trialsTable", get_drug_trials, filters)),
            asyncio.create_task(_fetch("brandCounts", get_drug_brand_names, filters)),
            asyncio.create_task(_fetch("drugClasses", get_drug_classes, filters)),
            asyncio.create_task(_fetch_heatmap()),
        ]
        for future in asyncio.as_completed(tasks):
            key, data = await future
            yield json.dumps({key: data}) + "\n"

    return StreamingResponse(generate(), media_type="application/x-ndjson")


@api_router.post("/api/pages/drug-pricing/stream")
async def drug_pricing_page_stream(payload: PageRequest, request: Request) -> StreamingResponse:
    _require_auth(request)
    filters = _filter_state(payload.filters, request)

    async def generate():
        kpis = await run_in_threadpool(get_pricing_kpis, filters)
        yield json.dumps({"kpis": kpis}) + "\n"

        async def _fetch(key, fn, *args):
            data = await run_in_threadpool(fn, *args)
            return key, _records(data)

        tasks = [
            asyncio.create_task(_fetch("annualCostPerBrandOverTime", get_annual_cost_per_brand_over_time, filters)),
            asyncio.create_task(_fetch("annualCostByDrugClass", get_annual_cost_by_drug_class, filters)),
            asyncio.create_task(_fetch("wacPriceHistory", get_wac_price_history, filters)),
            asyncio.create_task(_fetch("rawPricing", get_annual_pricing_raw, filters)),
        ]
        for future in asyncio.as_completed(tasks):
            key, data = await future
            yield json.dumps({key: data}) + "\n"

    return StreamingResponse(generate(), media_type="application/x-ndjson")


@api_router.post("/api/pages/market-access/stream")
async def market_access_page_stream(payload: MarketAccessPageRequest, request: Request) -> StreamingResponse:
    _require_auth(request)
    filters = _filter_state(payload.filters, request)
    year = payload.year

    async def generate():
        kpis = await run_in_threadpool(lambda: get_ma_kpis(filters, year=year))
        yield json.dumps({"kpis": kpis, "year": year}) + "\n"

        async def _fetch(key, fn):
            data = await run_in_threadpool(fn)
            return key, _records(data)

        tasks = [
            asyncio.create_task(_fetch("tierGrid", lambda: get_ma_tier_grid(filters, year=year))),
            asyncio.create_task(_fetch("requirementGrid", lambda: get_ma_req_grid(filters, year=year))),
        ]
        for future in asyncio.as_completed(tasks):
            key, data = await future
            yield json.dumps({key: data}) + "\n"

    return StreamingResponse(generate(), media_type="application/x-ndjson")


# The pages below have no KPI block; the first chunk yields an empty ``kpis`` dict
# purely to unblock the page shell on the frontend (which flips ``kpisReady`` when
# a chunk carries a ``kpis`` key), then chart queries stream in as they complete.


@api_router.post("/api/pages/sponsors/stream")
async def sponsors_page_stream(payload: PageRequest, request: Request) -> StreamingResponse:
    _require_auth(request)
    filters = _filter_state(payload.filters, request)

    async def generate():
        yield json.dumps({"kpis": {}}) + "\n"
        if not filters.has_any_filter():
            # Frontend shows "Filter Required" for these pages; skip the queries.
            return

        async def _fetch(key, fn, *args):
            data = await run_in_threadpool(fn, *args)
            return key, _records(data)

        tasks = [
            asyncio.create_task(_fetch("trialCounts", get_sponsor_trial_counts, filters, 20)),
            asyncio.create_task(_fetch("phaseMix", get_sponsor_phase_mix, filters, 15)),
            asyncio.create_task(_fetch("proAdoption", get_sponsor_pro_adoption, filters, 15)),
            asyncio.create_task(_fetch("endpointUsage", get_sponsor_endpoint_usage, filters, 10)),
        ]
        for future in asyncio.as_completed(tasks):
            key, data = await future
            yield json.dumps({key: data}) + "\n"

    return StreamingResponse(generate(), media_type="application/x-ndjson")


@api_router.post("/api/pages/trial-design/stream")
async def trial_design_page_stream(payload: PageRequest, request: Request) -> StreamingResponse:
    _require_auth(request)
    filters = _filter_state(payload.filters, request)

    async def generate():
        yield json.dumps({"kpis": {}}) + "\n"
        if not filters.has_any_filter():
            # Frontend shows "Filter Required" for these pages; skip the queries.
            return

        async def _fetch(key, fn, *args):
            data = await run_in_threadpool(fn, *args)
            return key, _records(data)

        tasks = [
            asyncio.create_task(_fetch("designMetrics", get_trial_design_metrics, filters)),
            asyncio.create_task(_fetch("armsDistribution", get_arms_distribution, filters)),
            asyncio.create_task(_fetch("eligibilityDistribution", get_eligibility_distribution, filters)),
        ]
        for future in asyncio.as_completed(tasks):
            key, data = await future
            yield json.dumps({key: data}) + "\n"

    return StreamingResponse(generate(), media_type="application/x-ndjson")


@api_router.post("/api/pages/planned-endpoints/stream")
async def planned_endpoints_page_stream(payload: PageRequest, request: Request) -> StreamingResponse:
    _require_auth(request)
    filters = _filter_state(payload.filters, request)

    async def generate():
        yield json.dumps({"kpis": {}}) + "\n"
        if not filters.has_any_filter():
            # Frontend shows "Filter Required" for these pages; skip the queries.
            return

        async def _fetch(key, fn, *args):
            data = await run_in_threadpool(fn, *args)
            return key, _records(data)

        async def _fetch_heatmap():
            heatmap = await run_in_threadpool(get_design_outcome_type_category_heatmap, filters)
            if heatmap.empty:
                return "designOutcomeTypeCategoryHeatmap", []
            melted = heatmap.reset_index().melt(
                id_vars=["outcome_type"], var_name="outcome_category", value_name="trial_count",
            )
            return "designOutcomeTypeCategoryHeatmap", _records(melted)

        tasks = [
            asyncio.create_task(_fetch_heatmap()),
            asyncio.create_task(_fetch("topDesignEndpoints", get_top_design_endpoints, filters, 10)),
            asyncio.create_task(_fetch("reportedProFunnel", get_reported_pro_funnel, filters)),
            asyncio.create_task(_fetch("designOutcomesTable", get_design_outcomes, filters)),
        ]
        for future in asyncio.as_completed(tasks):
            key, data = await future
            yield json.dumps({key: data}) + "\n"

    return StreamingResponse(generate(), media_type="application/x-ndjson")


@api_router.post("/api/pages/reported-outcomes/stream")
async def reported_outcomes_page_stream(payload: PageRequest, request: Request) -> StreamingResponse:
    _require_auth(request)
    filters = _filter_state(payload.filters, request)

    async def generate():
        yield json.dumps({"kpis": {}}) + "\n"
        if not filters.has_any_filter():
            # Frontend shows "Filter Required" for these pages; skip the queries.
            return

        async def _fetch(key, fn, *args):
            data = await run_in_threadpool(fn, *args)
            return key, _records(data)

        async def _fetch_heatmap():
            heatmap = await run_in_threadpool(get_outcome_type_category_heatmap, filters)
            if heatmap.empty:
                return "outcomeTypeCategoryHeatmap", []
            melted = heatmap.reset_index().melt(
                id_vars=["outcome_type"], var_name="outcome_category", value_name="trial_count",
            )
            return "outcomeTypeCategoryHeatmap", _records(melted)

        tasks = [
            asyncio.create_task(_fetch("reportedOutcomeCategories", get_reported_outcome_categories, filters)),
            asyncio.create_task(_fetch_heatmap()),
            asyncio.create_task(_fetch("reportedProFunnel", get_reported_pro_funnel, filters)),
        ]
        for future in asyncio.as_completed(tasks):
            key, data = await future
            yield json.dumps({key: data}) + "\n"

    return StreamingResponse(generate(), media_type="application/x-ndjson")


@api_router.post("/api/pages/outcome-scores/stream")
async def outcome_scores_page_stream(payload: PageRequest, request: Request) -> StreamingResponse:
    _require_auth(request)
    filters = _filter_state(payload.filters, request)

    async def generate():
        if not filters.has_any_filter():
            yield json.dumps({"kpis": {}, "trialsWithOutcomes": [], "filterRequired": True}) + "\n"
            return
        yield json.dumps({"kpis": {}}) + "\n"
        trials = await run_in_threadpool(get_trials_with_outcomes, filters)
        yield json.dumps({"trialsWithOutcomes": _records(trials), "filterRequired": False}) + "\n"

    return StreamingResponse(generate(), media_type="application/x-ndjson")


@api_router.post("/api/pages/pro-overview/stream")
async def pro_overview_page_stream(payload: PageRequest, request: Request) -> StreamingResponse:
    _require_auth(request)
    filters = _filter_state(payload.filters, request)

    async def generate():
        yield json.dumps({"kpis": {}}) + "\n"
        if not filters.has_any_filter():
            # Frontend shows "Filter Required" for these pages; skip the queries.
            return

        async def _fetch(key, fn, *args):
            data = await run_in_threadpool(fn, *args)
            return key, _records(data)

        tasks = [
            asyncio.create_task(_fetch("proUsageRaw", get_pro_usage, filters)),
            asyncio.create_task(_fetch("reportedProFunnel", get_reported_pro_funnel, filters)),
            asyncio.create_task(_fetch("proBySponsor", get_pro_by_sponsor, filters, 15)),
            asyncio.create_task(_fetch("proByPhase", get_pro_by_phase, filters)),
        ]
        for future in asyncio.as_completed(tasks):
            key, data = await future
            yield json.dumps({key: data}) + "\n"

    return StreamingResponse(generate(), media_type="application/x-ndjson")


@api_router.post("/api/pages/trial-groups/stream")
async def trial_groups_page_stream(payload: PageRequest, request: Request) -> StreamingResponse:
    _require_auth(request)
    filters = _filter_state(payload.filters, request)

    async def generate():
        yield json.dumps({"kpis": {}}) + "\n"
        if not filters.has_any_filter():
            # Frontend shows "Filter Required" for these pages; skip the queries.
            return

        async def _fetch(key, fn, *args):
            data = await run_in_threadpool(fn, *args)
            return key, _records(data)

        tasks = [
            asyncio.create_task(_fetch("designGroups", get_trial_groups, filters)),
            asyncio.create_task(_fetch("resultGroups", get_result_groups, filters)),
            asyncio.create_task(_fetch("groupsPerTrialDistribution", get_groups_per_trial_dist, filters)),
        ]
        for future in asyncio.as_completed(tasks):
            key, data = await future
            yield json.dumps({key: data}) + "\n"

    return StreamingResponse(generate(), media_type="application/x-ndjson")


@api_router.post("/api/pages/safety/stream")
async def safety_page_stream(payload: PageRequest, request: Request) -> StreamingResponse:
    _require_auth(request)
    filters = _filter_state(payload.filters, request)

    async def generate():
        yield json.dumps({"kpis": {}}) + "\n"
        if not filters.has_any_filter():
            # Frontend shows "Filter Required" for these pages; skip the queries.
            return

        async def _fetch(key, fn, *args):
            data = await run_in_threadpool(fn, *args)
            return key, _records(data)

        async def _fetch_ae_aggregates():
            agg = await run_in_threadpool(get_ae_aggregates, filters)
            return "aeAggregates", {
                "topAe": _records(agg.get("top_ae")),
                "organSystems": _records(agg.get("organ")),
            }

        tasks = [
            asyncio.create_task(_fetch_ae_aggregates()),
            asyncio.create_task(_fetch("aeByDrug", get_ae_by_drug, filters, 20)),
        ]
        for future in asyncio.as_completed(tasks):
            key, data = await future
            yield json.dumps({key: data}) + "\n"

    return StreamingResponse(generate(), media_type="application/x-ndjson")


# ─── Real World Safety ────────────────────────────────────────────────────────

@api_router.post("/api/pages/real-world-safety")
def real_world_safety_page(payload: PageRequest, request: Request) -> dict:
    _require_auth(request)
    filters = _filter_state(payload.filters, request)

    if not filters.has_any_filter():
        return {"filterRequired": True, "brands": [], "resolutionNote": None}

    brands, resolution_note = get_faers_brand_scope(filters)
    if not brands:
        return {
            "filterRequired": False,
            "brands": [],
            "resolutionNote": resolution_note,
            "kpis": {"total_reports": 0, "unique_reactions": 0, "serious_outcomes": 0, "unique_drugs": 0},
            "topReactions": [],
            "reactionsBySOC": [],
            "outcomesDistribution": [],
            "outcomeHeatmap": [],
            "reactionHeatmap": [],
        }

    brands_t = tuple(brands)
    kpis = get_faers_kpis(brands_t)
    top_rx = get_top_reactions(brands_t, limit=20)
    soc_df = get_reactions_by_soc(brands_t, limit=20)
    outc_df = get_outcomes_distribution(brands_t)
    outc_heatmap = get_outcome_brand_heatmap(brands_t, limit=10)
    rx_heatmap = get_reaction_brand_heatmap(brands_t, limit=10)

    def _pivot_records(df) -> list[dict]:
        if df.empty:
            return []
        return df.reset_index().to_dict(orient="records")

    return {
        "filterRequired": False,
        "brands": brands,
        "resolutionNote": resolution_note,
        "kpis": kpis,
        "topReactions": _records(top_rx),
        "reactionsBySOC": _records(soc_df),
        "outcomesDistribution": _records(outc_df),
        "outcomeHeatmap": _pivot_records(outc_heatmap),
        "reactionHeatmap": _pivot_records(rx_heatmap),
    }


@api_router.post("/api/pages/real-world-safety/stream")
async def real_world_safety_page_stream(payload: PageRequest, request: Request) -> StreamingResponse:
    _require_auth(request)
    filters = _filter_state(payload.filters, request)

    async def generate():
        if not filters.has_any_filter():
            yield json.dumps({"filterRequired": True, "brands": [], "resolutionNote": None}) + "\n"
            return

        brands, resolution_note = await run_in_threadpool(get_faers_brand_scope, filters)
        if not brands:
            yield json.dumps({
                "filterRequired": False,
                "brands": [],
                "resolutionNote": resolution_note,
                "kpis": {"total_reports": 0, "unique_reactions": 0, "serious_outcomes": 0, "unique_drugs": 0},
                "topReactions": [],
                "reactionsBySOC": [],
                "outcomesDistribution": [],
                "outcomeHeatmap": [],
                "reactionHeatmap": [],
            }) + "\n"
            return

        brands_t = tuple(brands)
        kpis = await run_in_threadpool(get_faers_kpis, brands_t)
        yield json.dumps({"kpis": kpis, "brands": brands, "resolutionNote": resolution_note, "filterRequired": False}) + "\n"

        async def _fetch(key, fn, *args):
            data = await run_in_threadpool(fn, *args)
            return key, _records(data)

        async def _fetch_pivot(key, fn, *args):
            df = await run_in_threadpool(fn, *args)
            if df.empty:
                return key, []
            return key, df.reset_index().to_dict(orient="records")

        tasks = [
            asyncio.create_task(_fetch("topReactions", get_top_reactions, brands_t, 20)),
            asyncio.create_task(_fetch("reactionsBySOC", get_reactions_by_soc, brands_t, 20)),
            asyncio.create_task(_fetch("outcomesDistribution", get_outcomes_distribution, brands_t)),
            asyncio.create_task(_fetch_pivot("outcomeHeatmap", get_outcome_brand_heatmap, brands_t, 10)),
            asyncio.create_task(_fetch_pivot("reactionHeatmap", get_reaction_brand_heatmap, brands_t, 10)),
        ]
        for future in asyncio.as_completed(tasks):
            key, data = await future
            yield json.dumps({key: data}) + "\n"

    return StreamingResponse(generate(), media_type="application/x-ndjson")
