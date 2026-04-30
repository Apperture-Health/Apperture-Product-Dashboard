"use client";

import { ColDef } from "ag-grid-community";
import { AgGridReact } from "ag-grid-react";
import dynamic from "next/dynamic";
import Image from "next/image";
import { useRouter, useSearchParams } from "next/navigation";
import { FormEvent, ReactNode, startTransition, useEffect, useRef, useState } from "react";

import { apiRequest, downloadCsv, pagePayload } from "@/lib/api";
import {
  AuthSession,
  FilterOptions,
  FilterState,
  KeyValueRecord,
  PageMeta,
} from "@/lib/types";
import {
  PHASE_COLOR_MAP,
  areaFigure,
  barFigure,
  donutFigure,
  funnelFigure,
  groupedBarFigure,
  heatmapFigure,
  lineFigure,
  multiLineFigure,
  stackedBarFigure,
  treemapFigure,
} from "@/lib/charts";

const Plot = dynamic(() => import("react-plotly.js"), { ssr: false });

const PAGE_META: PageMeta[] = [
  { key: "home", label: "🏠 Home", title: "Clinical Trials Intelligence Platform" },
  { key: "ask-the-data", label: "💬 Ask the Data", title: "AI Query" },
  { key: "pipeline", label: "📈 Pipeline", title: "Pipeline Landscape" },
  { key: "drug-detail", label: "💊 Drug Detail", title: "Drug Detail" },
  { key: "drug-pricing", label: "💰 Drug Pricing", title: "Drug Pricing" },
  { key: "market-access", label: "🏥 Market Access", title: "Market Access" },
  { key: "sponsors", label: "🏢 Sponsors", title: "Sponsor Benchmark" },
  { key: "trial-design", label: "📋 Trial Design", title: "Trial Design" },
  { key: "endpoints", label: "🎯 Endpoints", title: "Planned Endpoints" },
  { key: "outcomes", label: "📊 Outcomes", title: "Reported Outcomes" },
  { key: "scores", label: "🔢 Scores", title: "Outcome Score Analysis" },
  { key: "pro-overview", label: "👤 PRO Overview", title: "PRO Overview" },
  { key: "trial-groups", label: "🗂️ Trial Groups", title: "Trial Groups" },
  { key: "safety", label: "🛡️ Safety", title: "Safety Analysis" },
];

const defaultFilters: FilterState = {
  indication_name: null,
  atc_class_name: null,
  sponsor: [],
  sponsor_agency_class: [],
  brand_name: [],
  drug_indication: null,
  study_type: [],
  phase: [],
  overall_status: [],
  country: [],
  endpoint_category: [],
  outcome_type: [],
  pro_instrument: [],
  pro_domain: [],
  ae_organ_system: [],
  ae_term: [],
  has_results: null,
  enrollment_min: null,
  enrollment_max: null,
  allowed_indications: null,
  allowed_atc_classes: null,
};

const emptyOptions: FilterOptions = {
  indications: [],
  atc_classes: [],
  sponsors: [],
  agency_classes: [],
  study_types: [],
  phases: [],
  statuses: [],
  countries: [],
  categories: [],
  pro_instruments: [],
  brands: [],
  domains: [],
  drug_indications: [],
};

function hasAnyFilter(filters: FilterState) {
  return Boolean(
    filters.indication_name ||
      filters.atc_class_name ||
      filters.sponsor.length ||
      filters.sponsor_agency_class.length ||
      filters.brand_name.length ||
      filters.drug_indication ||
      filters.study_type.length ||
      filters.phase.length ||
      filters.overall_status.length ||
      filters.country.length ||
      filters.endpoint_category.length ||
      filters.pro_instrument.length ||
      filters.pro_domain.length ||
      filters.ae_organ_system.length ||
      filters.ae_term.length ||
      filters.has_results !== null ||
      filters.enrollment_min !== null ||
      filters.enrollment_max !== null
  );
}

function activeFilterSummary(filters: FilterState) {
  const active: Record<string, string> = {};
  if (filters.indication_name) active["Indication"] = filters.indication_name;
  if (filters.atc_class_name) active["Drug Class"] = filters.atc_class_name;
  if (filters.sponsor.length) active["Sponsor"] = filters.sponsor.join(", ");
  if (filters.sponsor_agency_class.length) active["Agency Class"] = filters.sponsor_agency_class.join(", ");
  if (filters.brand_name.length) active["Drug"] = filters.brand_name.join(", ");
  if (filters.drug_indication) active["Drug Indication"] = filters.drug_indication;
  if (filters.study_type.length) active["Study Type"] = filters.study_type.join(", ");
  if (filters.phase.length) active["Phase"] = filters.phase.join(", ");
  if (filters.overall_status.length) active["Status"] = filters.overall_status.join(", ");
  if (filters.country.length) active["Country"] = filters.country.join(", ");
  if (filters.endpoint_category.length) active["Endpoint Category"] = filters.endpoint_category.join(", ");
  if (filters.pro_instrument.length) active["PRO Instrument"] = filters.pro_instrument.join(", ");
  if (filters.pro_domain.length) active["PRO Domain"] = filters.pro_domain.join(", ");
  if (filters.has_results !== null) active["Has Results"] = filters.has_results ? "Yes" : "No";
  return active;
}

function getInitials(name: string) {
  return name.split(/[\s_]+/).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? "").join("");
}

function slugToMeta(tab: string | null, visibleTabs: string[]) {
  const visible = PAGE_META.filter((page) => visibleTabs.includes(page.label));
  const found = visible.find((page) => page.key === tab);
  return found ?? visible[0] ?? PAGE_META[0];
}

function noData(context: string) {
  return (
    <AlertCallout tone="info" title="No Data">
      No data available for the {context}. Try adjusting your filters or broadening the selection.
    </AlertCallout>
  );
}

function filterRequired(message: string) {
  return (
    <div className="empty-state">
      <div className="empty-icon">🔎</div>
      <h3>Filter Required</h3>
      <p>{message}</p>
    </div>
  );
}

function metricValue(value: unknown) {
  if (value == null) return "—";
  if (typeof value === "number") return value.toLocaleString();
  return String(value);
}

function inferColumns(rows: KeyValueRecord[]) {
  if (!rows.length) return [];
  return Object.keys(rows[0]);
}

function toRecords(input: unknown): KeyValueRecord[] {
  if (!Array.isArray(input)) return [];
  return input as KeyValueRecord[];
}

function yearLabel(value: unknown) {
  if (value == null) return "";
  const str = String(value);
  return str.slice(0, 10);
}

const PAGE_DATA_CACHE_MAX = 30;

function makeCacheKey(pageKey: string, filters: FilterState, extra?: Record<string, unknown>): string {
  const stableFilters = Object.fromEntries(
    Object.entries(filters).sort(([a], [b]) => a.localeCompare(b))
  );
  const extraStr = extra ? `::${JSON.stringify(extra)}` : "";
  return `${pageKey}::${JSON.stringify(stableFilters)}${extraStr}`;
}

export function DashboardClient() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [session, setSession] = useState<AuthSession | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [authError, setAuthError] = useState("");
  const [loginLoading, setLoginLoading] = useState(false);
  const [loginUsername, setLoginUsername] = useState("");
  const [loginPassword, setLoginPassword] = useState("");

  const [filters, setFilters] = useState<FilterState>(defaultFilters);
  const [filterOptions, setFilterOptions] = useState<FilterOptions>(emptyOptions);
  const [filtersLoading, setFiltersLoading] = useState(false);

  const [pageData, setPageData] = useState<Record<string, unknown> | null>(null);
  const [pageLoading, setPageLoading] = useState(false);
  const [pageError, setPageError] = useState("");

  const [homeSubtab, setHomeSubtab] = useState("overview");
  const [pipelineSubtab, setPipelineSubtab] = useState("sponsor");
  const [drugDetailSubtab, setDrugDetailSubtab] = useState("brands");
  const [sponsorSubtab, setSponsorSubtab] = useState("counts");
  const [plannedSubtab, setPlannedSubtab] = useState("types");
  const [reportedSubtab, setReportedSubtab] = useState("categories");
  const [proSubtab, setProSubtab] = useState("frequency");
  const [trialGroupsSubtab, setTrialGroupsSubtab] = useState("design");
  const [safetySubtab, setSafetySubtab] = useState("terms");
  const [pricingSubtab, setPricingSubtab] = useState("cost");
  const [marketAccessSubtab, setMarketAccessSubtab] = useState("tiers");
  const [trialDesignSubtab, setTrialDesignSubtab] = useState("overview");

  const [marketAccessYear, setMarketAccessYear] = useState(2025);
  const [marketAccessReqType, setMarketAccessReqType] = useState("PA");
  const [safetyOrganFilter, setSafetyOrganFilter] = useState("");
  const [safetyTermFilter, setSafetyTermFilter] = useState("");
  const [safetyDetail, setSafetyDetail] = useState<KeyValueRecord[]>([]);
  const [safetyDetailLoading, setSafetyDetailLoading] = useState(false);

  const [askQuestion, setAskQuestion] = useState("");
  const [askExtracted, setAskExtracted] = useState<Record<string, unknown> | null>(null);
  const [askLoading, setAskLoading] = useState(false);

  const [summaryLoading, setSummaryLoading] = useState(false);
  const [pageSummaries, setPageSummaries] = useState<Record<string, string>>({});

  const pageDataCache = useRef<Map<string, Record<string, unknown>>>(new Map());

  const requestedTab = searchParams.get("tab");
  const visibleLabels = session?.visible_tabs?.length ? session.visible_tabs : ["🏠 Home"];
  const currentPage = slugToMeta(requestedTab, visibleLabels);

  useEffect(() => {
    apiRequest<AuthSession>("/auth/me")
      .then((result) => {
        setSession(result);
        if (result.authenticated) {
          setFilters((previous) => ({
            ...previous,
            allowed_indications: result.allowed_indications ?? null,
            allowed_atc_classes: result.allowed_atc_classes ?? null,
          }));
        }
      })
      .catch(() => {
        setSession({ authenticated: false, visible_tabs: [] });
      })
      .finally(() => setAuthLoading(false));
  }, []);

  useEffect(() => {
    if (!session?.authenticated) return;
    setFiltersLoading(true);
    const params = new URLSearchParams();
    if (filters.indication_name) params.set("indication_name", filters.indication_name);
    if (filters.atc_class_name) params.set("atc_class_name", filters.atc_class_name);

    apiRequest<FilterOptions>(`/api/filters/options?${params.toString()}`)
      .then((result) => setFilterOptions(result))
      .finally(() => setFiltersLoading(false));
  }, [session?.authenticated, filters.indication_name, filters.atc_class_name]);

  useEffect(() => {
    if (!session?.authenticated) return;

    const endpointMap: Record<string, { path: string; extra?: Record<string, unknown> }> = {
      home: { path: "/api/pages/home" },
      pipeline: { path: "/api/pages/pipeline" },
      "drug-detail": { path: "/api/pages/drug-detail" },
      "drug-pricing": { path: "/api/pages/drug-pricing" },
      "market-access": { path: "/api/pages/market-access", extra: { year: marketAccessYear } },
      sponsors: { path: "/api/pages/sponsors" },
      "trial-design": { path: "/api/pages/trial-design" },
      endpoints: { path: "/api/pages/planned-endpoints" },
      outcomes: { path: "/api/pages/reported-outcomes" },
      scores: { path: "/api/pages/outcome-scores" },
      "pro-overview": { path: "/api/pages/pro-overview" },
      "trial-groups": { path: "/api/pages/trial-groups" },
      safety: { path: "/api/pages/safety" },
    };

    const config = endpointMap[currentPage.key];
    if (!config) {
      setPageData(null);
      return;
    }

    const cacheKey = makeCacheKey(currentPage.key, filters, config.extra);
    const cached = pageDataCache.current.get(cacheKey);
    if (cached) {
      setPageData(cached);
      setPageError("");
      return;
    }

    let aborted = false;
    const controller = new AbortController();

    setPageLoading(true);
    setPageError("");
    setSafetyDetail([]);

    apiRequest<Record<string, unknown>>(config.path, {
      method: "POST",
      body: pagePayload(filters, config.extra),
      signal: controller.signal,
    })
      .then((result) => {
        if (aborted) return;
        if (pageDataCache.current.size >= PAGE_DATA_CACHE_MAX) {
          const oldest = pageDataCache.current.keys().next().value;
          if (oldest !== undefined) pageDataCache.current.delete(oldest);
        }
        pageDataCache.current.set(cacheKey, result);
        setPageData(result);
      })
      .catch((error) => {
        if (aborted || error.name === "AbortError") return;
        setPageError(error instanceof Error ? error.message : "Failed to load page data");
        setPageData(null);
      })
      .finally(() => {
        if (!aborted) setPageLoading(false);
      });

    return () => {
      aborted = true;
      controller.abort();
    };
  }, [session?.authenticated, currentPage.key, filters, marketAccessYear]);

  useEffect(() => {
    setPageSummaries({});
  }, [filters, marketAccessYear]);

  function updateQueryTab(key: string) {
    startTransition(() => {
      router.replace(`/dashboard?tab=${key}`);
    });
  }

  async function handleLogin(event: FormEvent) {
    event.preventDefault();
    setAuthError("");
    setLoginLoading(true);

    try {
      const nextSession = await apiRequest<AuthSession>("/auth/login", {
        method: "POST",
        body: JSON.stringify({ username: loginUsername, password: loginPassword }),
      });
      setSession(nextSession);
      setFilters({
        ...defaultFilters,
        allowed_indications: nextSession.allowed_indications ?? null,
        allowed_atc_classes: nextSession.allowed_atc_classes ?? null,
      });
      if (nextSession.visible_tabs.length) {
        const first = slugToMeta(null, nextSession.visible_tabs);
        updateQueryTab(first.key);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "";
      if (message.includes("401") || message.toLowerCase().includes("invalid")) {
        setAuthError("Incorrect username or password. Please try again.");
      } else if (message.includes("Failed to fetch") || message.includes("NetworkError")) {
        setAuthError("Cannot reach the server. Please ensure the backend is running.");
      } else {
        setAuthError(message || "Sign-in failed. Please try again.");
      }
    } finally {
      setLoginLoading(false);
    }
  }

  async function handleLogout() {
    await apiRequest<AuthSession>("/auth/logout", { method: "POST" });
    setSession({ authenticated: false, visible_tabs: [] });
    setFilters(defaultFilters);
    setPageData(null);
  }

  function resetFilters() {
    setFilters((previous) => ({
      ...defaultFilters,
      allowed_indications: previous.allowed_indications ?? null,
      allowed_atc_classes: previous.allowed_atc_classes ?? null,
    }));
  }

  function updateFilter<K extends keyof FilterState>(key: K, value: FilterState[K]) {
    setFilters((previous) => {
      const next = { ...previous, [key]: value };
      if (key === "indication_name" || key === "atc_class_name") {
        return {
          ...next,
          sponsor: [],
          sponsor_agency_class: [],
          brand_name: [],
          drug_indication: null,
          study_type: [],
          phase: [],
          overall_status: [],
          country: [],
          endpoint_category: [],
          outcome_type: [],
          pro_instrument: [],
          pro_domain: [],
          ae_organ_system: [],
          ae_term: [],
          has_results: null,
          enrollment_min: null,
          enrollment_max: null,
        };
      }
      return next;
    });
  }

  async function loadSafetyDetail() {
    setSafetyDetailLoading(true);
    try {
      const result = await apiRequest<{ detail: KeyValueRecord[] }>("/api/pages/safety/detail", {
        method: "POST",
        body: pagePayload(filters, {
          organ_system: safetyOrganFilter || null,
          ae_term: safetyTermFilter || null,
        }),
      });
      setSafetyDetail(result.detail);
    } finally {
      setSafetyDetailLoading(false);
    }
  }

  async function requestSummary(pageKey: string) {
    setSummaryLoading(true);
    try {
      const result = await apiRequest<{ summary: string }>(`/api/ai/page-summary/${pageKey}`, {
        method: "POST",
        body: pagePayload(filters, pageKey === "market-access" ? { year: marketAccessYear } : undefined),
      });
      setPageSummaries((previous) => ({ ...previous, [pageKey]: result.summary }));
    } finally {
      setSummaryLoading(false);
    }
  }

  async function extractFiltersFromQuestion(question: string) {
    setAskLoading(true);
    try {
      const result = await apiRequest<{ extracted: Record<string, unknown> }>("/api/ai/extract-filters", {
        method: "POST",
        body: JSON.stringify({ question }),
      });
      setAskExtracted(result.extracted);
    } finally {
      setAskLoading(false);
    }
  }

  function applyAskFilters() {
    if (!askExtracted) return;
    setFilters((previous) => ({
      ...previous,
      indication_name: typeof askExtracted.indication === "string" ? askExtracted.indication : null,
      atc_class_name: typeof askExtracted.atc_class === "string" ? askExtracted.atc_class : null,
      sponsor: Array.isArray(askExtracted.sponsors) ? askExtracted.sponsors as string[] : [],
      phase: Array.isArray(askExtracted.phases) ? askExtracted.phases as string[] : [],
      overall_status: Array.isArray(askExtracted.statuses) ? askExtracted.statuses as string[] : [],
      country: Array.isArray(askExtracted.countries) ? askExtracted.countries as string[] : [],
      sponsor_agency_class: Array.isArray(askExtracted.agency_class) ? askExtracted.agency_class as string[] : [],
      has_results: typeof askExtracted.has_results === "boolean" ? askExtracted.has_results : null,
    }));
    setAskExtracted(null);
    updateQueryTab("home");
  }

  if (authLoading) {
    return <LoadingScreen message="Loading dashboard..." />;
  }

  if (!session?.authenticated) {
    return (
      <div className="login-page">
        <div className="login-panel-left">
          <div className="login-brand">
            <Image src="/assets/logos/APP_logo1.png" alt="Apperture" width={52} height={52} priority />
            <h1 className="login-headline">Clinical Trials<br />Intelligence Platform</h1>
            <p className="login-tagline">Clinical intelligence for faster, smarter decisions.</p>
          </div>
          <ul className="login-features">
            <li><span className="lf-icon">📈</span><span>Pipeline &amp; competitive landscape analysis</span></li>
            <li><span className="lf-icon">💊</span><span>Drug pricing &amp; market access insights</span></li>
            <li><span className="lf-icon">🎯</span><span>Endpoint benchmarking &amp; PRO analytics</span></li>
            <li><span className="lf-icon">🛡️</span><span>Adverse event &amp; safety profiling</span></li>
            <li><span className="lf-icon">💬</span><span>AI-powered natural language queries</span></li>
          </ul>
          <div className="login-footer-note">Powered by Apperture · v1.0.0</div>
        </div>

        <div className="login-panel-right">
          <form className="login-form" onSubmit={handleLogin}>
            <div className="login-form-header">
              <h2>Welcome back</h2>
              <p>Sign in to your account to continue</p>
            </div>

            <div className="login-field">
              <label htmlFor="login-username">Username</label>
              <input
                id="login-username"
                type="text"
                value={loginUsername}
                onChange={(e) => setLoginUsername(e.target.value)}
                placeholder="Enter your username"
                autoComplete="username"
                autoFocus
              />
            </div>

            <div className="login-field">
              <label htmlFor="login-password">Password</label>
              <input
                id="login-password"
                type="password"
                value={loginPassword}
                onChange={(e) => setLoginPassword(e.target.value)}
                placeholder="Enter your password"
                autoComplete="current-password"
              />
            </div>

            {authError ? (
              <div className="login-error-box">
                <span>⚠️</span> {authError}
              </div>
            ) : null}

            <button type="submit" className="login-submit" disabled={loginLoading || !loginUsername || !loginPassword}>
              {loginLoading ? "Signing in…" : "Sign in →"}
            </button>

            <div className="login-disclaimer">
              Access is restricted to authorised users only.
            </div>
          </form>
        </div>
      </div>
    );
  }

  const activeFilters = activeFilterSummary(filters);
  const kpis = (pageData?.kpis as Record<string, unknown>) ?? {};
  const indicationOptions = session.allowed_indications ?? filterOptions.indications;
  const atcClassOptions = session.allowed_atc_classes ?? filterOptions.atc_classes;

  return (
    <div className="dashboard-shell">
      <aside className="dashboard-sidebar">
        <div className="sidebar-brand">
          <Image src="/assets/logos/APP_logo1.png" alt="Apperture" width={36} height={36} priority />
          <div className="sidebar-brand-name">Clinical Trials Intelligence Platform</div>
        </div>

        <div className="user-badge">
          <div className="user-avatar">{getInitials(session.display_name ?? session.username ?? "")}</div>
          <div className="user-info">
            <div className="user-name">{session.display_name ?? session.username}</div>
            <div className="user-role">Signed in</div>
          </div>
          <button className="user-signout-btn" onClick={handleLogout} title="Sign out">⏻</button>
        </div>

        <div className="sidebar-filter-header">
          <span className="sidebar-filter-label">Filters</span>
          {hasAnyFilter(filters) ? <span className="sidebar-filter-count">{Object.keys(activeFilters).length}</span> : null}
        </div>

        <SidebarSelectField
          label="Condition (Disease Area)"
          value={filters.indication_name ?? ""}
          onChange={(value) => updateFilter("indication_name", value || null)}
          options={["", ...indicationOptions]}
        />
        <SidebarSelectField
          label="Drug Class (ATC)"
          value={filters.atc_class_name ?? ""}
          onChange={(value) => updateFilter("atc_class_name", value || null)}
          options={["", ...atcClassOptions]}
        />

        <div className="sidebar-section-divider" />

        <details open>
          <summary>Trial Attributes</summary>
          <div>
            <MultiCheckboxDropdown label="Study Type" values={filters.study_type} options={filterOptions.study_types} onChange={(v) => updateFilter("study_type", v)} />
            <MultiCheckboxDropdown label="Phase" values={filters.phase} options={filterOptions.phases} onChange={(v) => updateFilter("phase", v)} />
            <MultiCheckboxDropdown label="Status" values={filters.overall_status} options={filterOptions.statuses} onChange={(v) => updateFilter("overall_status", v)} />
            <SidebarSelectField
              label="Results Posted"
              value={filters.has_results === null ? "Any" : filters.has_results ? "Has Results" : "No Results"}
              onChange={(value) =>
                updateFilter(
                  "has_results",
                  value === "Has Results" ? true : value === "No Results" ? false : null,
                )
              }
              options={["Any", "Has Results", "No Results"]}
            />
            <div className="enrollment-range">
              <label className="enrollment-range-label">Enrollment Range</label>
              <div className="range-row">
                <input
                  className="range-input"
                  type="number"
                  placeholder="Min"
                  value={filters.enrollment_min ?? ""}
                  onChange={(e) => updateFilter("enrollment_min", e.target.value ? Number(e.target.value) : null)}
                />
                <span>–</span>
                <input
                  className="range-input"
                  type="number"
                  placeholder="Max"
                  value={filters.enrollment_max ?? ""}
                  onChange={(e) => updateFilter("enrollment_max", e.target.value ? Number(e.target.value) : null)}
                />
              </div>
            </div>
          </div>
        </details>

        <details>
          <summary>Sponsor / Drug</summary>
          <div>
            <MultiCheckboxDropdown label="Sponsor" values={filters.sponsor} options={filterOptions.sponsors} onChange={(v) => updateFilter("sponsor", v)} />
            <MultiCheckboxDropdown label="Agency Class" values={filters.sponsor_agency_class} options={filterOptions.agency_classes} onChange={(v) => updateFilter("sponsor_agency_class", v)} />
            <MultiCheckboxDropdown label="Drug (Brand Name)" values={filters.brand_name} options={filterOptions.brands} onChange={(v) => updateFilter("brand_name", v)} />
            <SidebarSelectField
              label="Drug Indication (Label)"
              value={filters.drug_indication ?? ""}
              onChange={(value) => updateFilter("drug_indication", value || null)}
              options={["", ...filterOptions.drug_indications]}
            />
          </div>
        </details>

        <details>
          <summary>Endpoints / Outcomes</summary>
          <div>
            <MultiCheckboxDropdown label="Endpoint Category" values={filters.endpoint_category} options={filterOptions.categories} onChange={(v) => updateFilter("endpoint_category", v)} />
          </div>
        </details>

        <details>
          <summary>PRO</summary>
          <div>
            <MultiCheckboxDropdown label="PRO Instrument" values={filters.pro_instrument} options={filterOptions.pro_instruments} onChange={(v) => updateFilter("pro_instrument", v)} />
            <MultiCheckboxDropdown label="PRO Domain" values={filters.pro_domain} options={filterOptions.domains} onChange={(v) => updateFilter("pro_domain", v)} />
          </div>
        </details>

        <details>
          <summary>Geography</summary>
          <div>
            <MultiCheckboxDropdown label="Country" values={filters.country} options={filterOptions.countries} onChange={(v) => updateFilter("country", v)} />
          </div>
        </details>

        <button className="reset-button" onClick={resetFilters}>
          🔄 Reset All Filters
        </button>
        {filtersLoading ? <div className="sidebar-loading">Refreshing options…</div> : null}
      </aside>

      <main className="dashboard-main">
        <TopTabs pages={PAGE_META.filter((page) => visibleLabels.includes(page.label))} activeKey={currentPage.key} onChange={updateQueryTab} />
        <PageHeader page={currentPage} />
        <FilterSummaryBar active={activeFilters} />

        {pageError ? (
          <AlertCallout tone="danger" title="Error">
            {pageError}
          </AlertCallout>
        ) : null}

        {pageLoading ? <LoadingScreen message="Loading page data..." compact /> : null}

        {!pageLoading && currentPage.key === "home" ? (
          <div className="page-stack">
            <SectionHeader title="Database Coverage" subtitle="Total scope of the clinical trials dataset" />
            <MetricRow items={[
              { label: "Total Trials", value: kpis.total_trials, icon: "🧪" },
              { label: "Active Trials", value: kpis.active_trials, icon: "🔵" },
              { label: "Completed Trials", value: kpis.completed_trials, icon: "✅" },
              { label: "Trials with Results", value: kpis.trials_with_results, icon: "📋" },
              { label: "Unique Sponsors", value: kpis.unique_sponsors, icon: "🏢" },
              { label: "Unique Drugs", value: kpis.unique_drugs, icon: "💊" },
              { label: "Unique Conditions", value: kpis.unique_conditions, icon: "🔬" },
              { label: "Trials with PROs", value: kpis.trials_with_pros, icon: "👤" },
            ]} />
            {!hasAnyFilter(filters) ? filterRequired("Please select at least one filter in the sidebar (indication, drug class, sponsor, phase, etc.) to view the charts.") : (
              <>
                <SectionHeader title="Landscape Overview" subtitle="Distribution of trials across phases, sponsors, conditions, and time" />
                <TwoCol>
                  {toRecords(pageData?.trialsByPhase).length
                    ? <ChartTile title="Trial Count by Phase" figure={barFigure(toRecords(pageData?.trialsByPhase), "phase", "trial_count")} />
                    : noData("phase distribution")}
                  {toRecords(pageData?.trialsOverTime).length
                    ? <ChartTile title="Trials First Posted per Year" figure={areaFigure(toRecords(pageData?.trialsOverTime).map((row) => ({ ...row, year: yearLabel(row.year) })), "year", "trial_count")} />
                    : noData("trial timeline")}
                </TwoCol>
                <TwoCol>
                  {toRecords(pageData?.topSponsors).length
                    ? <ChartTile title="Top Sponsors by Trial Count" figure={barFigure(toRecords(pageData?.topSponsors).slice(0, 12), "sponsor", "trial_count", false)} />
                    : noData("sponsors")}
                  {toRecords(pageData?.topConditions).length
                    ? <ChartTile title="Top MeSH Conditions" figure={barFigure(toRecords(pageData?.topConditions).slice(0, 12), "condition", "trial_count", true)} />
                    : noData("conditions")}
                </TwoCol>
              </>
            )}
            <hr style={{ border: "none", borderTop: "1px solid #e5e7eb", margin: "8px 0 0" }} />
            <SectionHeader title="Explore Platform Modules" subtitle="Navigate to any analysis module using the tabs above or the shortcuts below" />
            <div className="module-grid">
              {PAGE_META.filter((p) => p.key !== "home" && visibleLabels.includes(p.label)).map((p) => {
                const [icon, ...rest] = p.label.split(" ");
                return (
                  <button key={p.key} className="module-card" onClick={() => updateQueryTab(p.key)}>
                    <div className="module-icon-wrap">{icon}</div>
                    <div className="module-body">
                      <div className="module-card-label">{p.title}</div>
                      <div className="module-card-desc">{moduleDesc[p.key] ?? ""}</div>
                    </div>
                    <div className="module-arrow">›</div>
                  </button>
                );
              })}
            </div>
          </div>
        ) : null}

        {!pageLoading && currentPage.key === "pipeline" ? (
          <div className="page-stack">
            <AlertCallout tone="info" title="Pipeline Data Note">
              Pipeline data is sourced from `onco_pipeline_trials` and reflects investigational oncology assets.
            </AlertCallout>
            <MetricRow items={[
              { label: "Pipeline Trials", value: kpis.pipeline_trials, icon: "🔬" },
              { label: "Unique Assets", value: kpis.unique_assets, icon: "💊" },
              { label: "Active Sponsors", value: kpis.active_sponsors, icon: "🏢" },
              { label: "Indications Covered", value: kpis.indications_covered, icon: "🎯" },
              { label: "With Planned PROs", value: kpis.with_pros, icon: "👤" },
            ]} />
            {!hasAnyFilter(filters) ? filterRequired("Please select at least one filter in the sidebar (indication, drug class, sponsor, phase, etc.) to view the charts.") : (
              <>
                <SectionTabs
                  items={[
                    { key: "sponsor", label: "🏢 By Sponsor" },
                    { key: "indication", label: "🎯 By Indication" },
                    { key: "interventions", label: "💊 Interventions" },
                    { key: "heatmap", label: "🗺️ Sponsor × Indication" },
                    { key: "pro", label: "👤 PRO Usage" },
                  ]}
                  active={pipelineSubtab}
                  onChange={setPipelineSubtab}
                />
                {pipelineSubtab === "sponsor" ? (
                  <TwoCol>
                    <ChartTile title="Pipeline Trials by Sponsor" figure={barFigure(toRecords(pageData?.bySponsor), "sponsor", "pipeline_trials", true)} />
                    <ChartTile title="Unique Assets by Sponsor" figure={barFigure(toRecords(pageData?.bySponsor), "sponsor", "unique_assets", true)} />
                  </TwoCol>
                ) : null}
                {pipelineSubtab === "indication" ? (
                  <TwoCol>
                    <ChartTile title="Pipeline Trials by Indication" figure={barFigure(toRecords(pageData?.byIndication), "condition", "trial_count", true)} />
                    <ChartTile title="Indication Treemap" figure={treemapFigure(toRecords(pageData?.byIndication), "condition", "trial_count")} />
                  </TwoCol>
                ) : null}
                {pipelineSubtab === "interventions" ? (
                  <ChartTile title="Top Pipeline Interventions" figure={barFigure(toRecords(pageData?.topInterventions), "intervention", "trial_count", true)} />
                ) : null}
                {pipelineSubtab === "heatmap" ? (
                  <ChartTile title="Sponsor × Indication Pipeline Heatmap" figure={heatmapFigure(toRecords(pageData?.sponsorIndicationHeatmap), "condition", "sponsor", "trial_count")} />
                ) : null}
                {pipelineSubtab === "pro" ? (
                  <ChartTile title="Pipeline PRO Instrument Usage" figure={barFigure(toRecords(pageData?.proUsage), "instrument_name", "trial_count", true)} />
                ) : null}
                <SectionHeader title="Pipeline Trial Details" />
                <CsvButton rows={toRecords(pageData?.trialsTable)} filename="pipeline_trials.csv" />
                <AgGridTable rows={toRecords(pageData?.trialsTable)} />
                <AiSummaryBlock pageKey="pipeline" summary={pageSummaries.pipeline} loading={summaryLoading} onGenerate={() => requestSummary("pipeline")} />
              </>
            )}
          </div>
        ) : null}

        {!pageLoading && currentPage.key === "drug-detail" ? (
          <div className="page-stack">
            {Number(kpis.total_trials ?? 0) === 0 ? noData("trials for the current filters") : (
              <>
                <MetricRow items={[
                  { label: "Total Trials", value: kpis.total_trials, icon: "🧪" },
                  { label: "Completed", value: kpis.completed_trials, icon: "✅" },
                  { label: "With Results", value: kpis.trials_with_results, icon: "📋" },
                  { label: "Brand Names", value: kpis.unique_drugs, icon: "💊" },
                  { label: "Drug Classes", value: toRecords(pageData?.drugClasses).length, icon: "🏷️" },
                ]} />
                {!hasAnyFilter(filters) ? filterRequired("Please select at least one filter in the sidebar (indication, drug class, sponsor, phase, etc.) to view the charts.") : (
                  <>
                    <SectionTabs
                      items={[
                        { key: "brands", label: "💊 Brand Names / Drugs" },
                        { key: "phase", label: "📊 Phase & Design" },
                        { key: "classes", label: "🏷️ Drug Classes" },
                        { key: "trials", label: "📄 Trial List" },
                      ]}
                      active={drugDetailSubtab}
                      onChange={setDrugDetailSubtab}
                    />
                    {drugDetailSubtab === "brands"
                      ? (toRecords(pageData?.brandCounts).length
                        ? <ChartTile title="Brand Names — Trial Counts" figure={barFigure(toRecords(pageData?.brandCounts), "brand_name", "trial_count", true)} />
                        : noData("brand names"))
                      : null}
                    {drugDetailSubtab === "phase"
                      ? (toRecords(pageData?.phaseBrandHeatmap).length
                        ? <ChartTile title="Phase × Brand Name — Trial Counts" figure={heatmapFigure(toRecords(pageData?.phaseBrandHeatmap), "brand_name", "phase", "trial_count")} />
                        : noData("phase data"))
                      : null}
                    {drugDetailSubtab === "classes"
                      ? (toRecords(pageData?.drugClasses).length
                        ? <ChartTile title="ATC Drug Classes — Brands per Class" figure={barFigure(toRecords(pageData?.drugClasses), "drug_class", "brand_count", true)} />
                        : noData("drug classes"))
                      : null}
                    {drugDetailSubtab === "trials" ? (
                      toRecords(pageData?.trialsTable).length ? (
                        <>
                          <CsvButton rows={toRecords(pageData?.trialsTable)} filename="drug_detail_trials.csv" />
                          <AgGridTable rows={toRecords(pageData?.trialsTable)} />
                        </>
                      ) : noData("trial list")
                    ) : null}
                    <AiSummaryBlock pageKey="drug-detail" summary={pageSummaries["drug-detail"]} loading={summaryLoading} onGenerate={() => requestSummary("drug-detail")} />
                  </>
                )}
              </>
            )}
          </div>
        ) : null}

        {!pageLoading && currentPage.key === "sponsors" ? (
          <div className="page-stack">
            {!hasAnyFilter(filters) ? filterRequired("Please select at least one filter in the sidebar (indication, drug class, sponsor, phase, etc.) to view the charts.") : (
              <>
                <SectionTabs
                  items={[
                    { key: "counts", label: "📊 Trial Counts" },
                    { key: "phase", label: "📐 Phase Mix" },
                    { key: "pro", label: "👤 PRO Adoption" },
                    { key: "endpoints", label: "🎯 Endpoint Usage" },
                  ]}
                  active={sponsorSubtab}
                  onChange={setSponsorSubtab}
                />
                {sponsorSubtab === "counts" ? (
                  <TwoCol>
                    <ChartTile title="Total Trials per Sponsor" figure={barFigure(toRecords(pageData?.trialCounts), "sponsor", "total_trials", true)} />
                    <ChartTile title="Active vs Completed by Sponsor" figure={groupedBarFigure(
                      toRecords(pageData?.trialCounts),
                      "sponsor",
                      [
                        { key: "active_trials", label: "Active", color: "#2A9D8F" },
                        { key: "completed_trials", label: "Completed", color: "#0F4C81" },
                      ],
                      true,
                    )} />
                  </TwoCol>
                ) : null}
                {sponsorSubtab === "phase" ? (
                  <>
                    <ChartTile title="Phase Mix by Sponsor" figure={stackedBarFigure(toRecords(pageData?.phaseMix), "sponsor", "trial_count", "phase", PHASE_COLOR_MAP)} />
                  </>
                ) : null}
                {sponsorSubtab === "pro" ? (
                  <>
                    <ChartTile title="% Trials with Planned PROs by Sponsor" figure={barFigure(toRecords(pageData?.proAdoption), "sponsor", "pct_with_pro", true)} />
                    <AgGridTable rows={toRecords(pageData?.proAdoption)} />
                  </>
                ) : null}
                {sponsorSubtab === "endpoints" ? (
                  <>
                    <ChartTile title="Endpoint Category Usage by Sponsor" figure={heatmapFigure(toRecords(pageData?.endpointUsage), "category", "sponsor", "trial_count")} />
                    <AgGridTable rows={toRecords(pageData?.endpointUsage)} />
                  </>
                ) : null}
              </>
            )}
          </div>
        ) : null}

        {!pageLoading && currentPage.key === "trial-design" ? (
          <div className="page-stack">
            {!hasAnyFilter(filters) ? filterRequired("Please select at least one filter in the sidebar (indication, drug class, sponsor, phase, etc.) to view the charts.") : (
              <>
                <SectionTabs items={[{ key: "overview", label: "Overview" }]} active={trialDesignSubtab} onChange={setTrialDesignSubtab} />
                <TwoCol>
                  <ChartTile title="Allocation Method" figure={donutFigure(groupBy(toRecords(pageData?.designMetrics), "allocation", "trial_count"), "allocation", "trial_count")} />
                  <ChartTile title="Intervention Model" figure={barFigure(groupBy(toRecords(pageData?.designMetrics), "intervention_model", "trial_count"), "intervention_model", "trial_count", true)} />
                </TwoCol>
                <ChartTile title="Number of Arms / Groups per Trial" figure={barFigure(toRecords(pageData?.armsDistribution), "number_of_arms", "trial_count")} />
                <TwoCol>
                  <ChartTile title="Gender Eligibility" figure={donutFigure(groupBy(toRecords(pageData?.eligibilityDistribution), "gender", "trial_count"), "gender", "trial_count")} />
                  <ChartTile title="Eligible Age Groups" figure={barFigure(ageRows(toRecords(pageData?.eligibilityDistribution)), "Age Group", "trial_count")} />
                </TwoCol>
              </>
            )}
          </div>
        ) : null}

        {!pageLoading && currentPage.key === "endpoints" ? (
          <div className="page-stack">
            {!hasAnyFilter(filters) ? filterRequired("Please select at least one filter in the sidebar (indication, drug class, sponsor, phase, etc.) to view the charts.") : (
              <>
                <SectionTabs
                  items={[
                    { key: "types", label: "📊 Outcome Types" },
                    { key: "top", label: "🔢 Top Endpoints" },
                    { key: "pro", label: "👤 Planned PROs" },
                    { key: "table", label: "📄 Full Table" },
                  ]}
                  active={plannedSubtab}
                  onChange={setPlannedSubtab}
                />
                {plannedSubtab === "types" ? <ChartTile title="Outcome Type × Category (Unique Trials)" figure={heatmapFigure(toRecords(pageData?.designOutcomeTypeCategoryHeatmap), "outcome_category", "outcome_type", "trial_count")} /> : null}
                {plannedSubtab === "top" ? <ChartTile title="Top 10 Planned Endpoint Categories by Frequency" figure={barFigure(toRecords(pageData?.topDesignEndpoints), "outcome_category", "trial_count", true)} /> : null}
                {plannedSubtab === "pro" ? <ChartTile title="Planned vs Reported PRO Funnel" figure={funnelFigure(toRecords(pageData?.reportedProFunnel), "stage", "trial_count")} /> : null}
                {plannedSubtab === "table" ? <AgGridTable rows={toRecords(pageData?.designOutcomesTable)} /> : null}
              </>
            )}
          </div>
        ) : null}

        {!pageLoading && currentPage.key === "outcomes" ? (
          <div className="page-stack">
            {!hasAnyFilter(filters) ? filterRequired("Please select at least one filter in the sidebar (indication, drug class, sponsor, phase, etc.) to view the charts.") : (
              <>
                <SectionTabs
                  items={[
                    { key: "categories", label: "📊 Categories" },
                    { key: "types", label: "📋 Outcome Types" },
                    { key: "top", label: "🔢 Top Outcomes" },
                    { key: "pro", label: "👤 PRO Funnel" },
                  ]}
                  active={reportedSubtab}
                  onChange={setReportedSubtab}
                />
                {reportedSubtab === "categories" ? (
                  <TwoCol>
                    <ChartTile title="Outcomes by Category" figure={barFigure(toRecords(pageData?.reportedOutcomeCategories), "category", "outcome_count", true)} />
                    <ChartTile title="Trials per Category" figure={donutFigure(toRecords(pageData?.reportedOutcomeCategories), "category", "trial_count")} />
                  </TwoCol>
                ) : null}
                {reportedSubtab === "types" ? <ChartTile title="Outcome Type × Category (Unique Trials)" figure={heatmapFigure(toRecords(pageData?.outcomeTypeCategoryHeatmap), "outcome_category", "outcome_type", "trial_count")} /> : null}
                {reportedSubtab === "top" ? (
                  <>
                    <ChartTile title="Top 10 Outcome Categories by Frequency" figure={barFigure(toRecords(pageData?.reportedOutcomeCategories).slice(0, 10), "category", "outcome_count", true)} />
                    <AgGridTable rows={toRecords(pageData?.reportedOutcomeCategories)} />
                  </>
                ) : null}
                {reportedSubtab === "pro" ? <ChartTile title="Planned vs Reported PRO Funnel" figure={funnelFigure(toRecords(pageData?.reportedProFunnel), "stage", "trial_count")} /> : null}
              </>
            )}
          </div>
        ) : null}

        {!pageLoading && currentPage.key === "pro-overview" ? (
          <div className="page-stack">
            <MetricRow items={proMetrics(toRecords(pageData?.proUsageRaw), toRecords(pageData?.reportedProFunnel))} />
            {!hasAnyFilter(filters) ? filterRequired("Please select at least one filter in the sidebar (indication, drug class, sponsor, phase, etc.) to view the charts.") : (
              <>
                <SectionTabs
                  items={[
                    { key: "frequency", label: "📊 Instrument Frequency" },
                    { key: "funnel", label: "📋 Planned vs Reported" },
                    { key: "sponsor", label: "🏢 By Sponsor" },
                    { key: "phase", label: "📐 By Phase" },
                  ]}
                  active={proSubtab}
                  onChange={setProSubtab}
                />
                {proSubtab === "frequency" ? (
                  <TwoCol>
                    <ChartTile title="Top PRO Instruments (Total)" figure={barFigure(topProRows(toRecords(pageData?.proUsageRaw)), "instrument_name", "total", true)} />
                    <ChartTile title="Instrument Share (Top 10)" figure={donutFigure(topProRows(toRecords(pageData?.proUsageRaw)).slice(0, 10), "instrument_name", "total")} />
                  </TwoCol>
                ) : null}
                {proSubtab === "funnel" ? <ChartTile title="Planned → Reported PRO Funnel" figure={funnelFigure(toRecords(pageData?.reportedProFunnel), "stage", "trial_count")} /> : null}
                {proSubtab === "sponsor" ? <ChartTile title="PRO Adoption by Sponsor" figure={barFigure(sponsorTotals(toRecords(pageData?.proBySponsor)), "sponsor", "trial_count", true)} /> : null}
                {proSubtab === "phase" ? <ChartTile title="Trials with Planned PROs by Phase" figure={barFigure(toRecords(pageData?.proByPhase), "phase", "pro_trials")} /> : null}
                <AgGridTable rows={topProRows(toRecords(pageData?.proUsageRaw))} />
                <AiSummaryBlock pageKey="pro-overview" summary={pageSummaries["pro-overview"]} loading={summaryLoading} onGenerate={() => requestSummary("pro-overview")} />
              </>
            )}
          </div>
        ) : null}

        {!pageLoading && currentPage.key === "trial-groups" ? (
          <div className="page-stack">
            {!hasAnyFilter(filters) ? filterRequired("Please select at least one filter in the sidebar (indication, drug class, sponsor, phase, etc.) to view the charts.") : (
              <>
                <SectionTabs
                  items={[
                    { key: "design", label: "📐 Design Groups" },
                    { key: "result", label: "📋 Result Groups" },
                    { key: "distribution", label: "📊 Groups per Trial" },
                  ]}
                  active={trialGroupsSubtab}
                  onChange={setTrialGroupsSubtab}
                />
                {trialGroupsSubtab === "design" ? (
                  <>
                    <TwoCol>
                      <ChartTile title="Group Type Distribution" figure={donutFigure(groupBy(toRecords(pageData?.designGroups), "group_type", "count"), "group_type", "count")} />
                      <ChartTile title="Top Interventions in Groups" figure={barFigure(groupBy(toRecords(pageData?.designGroups), "intervention_name", "group_count"), "intervention_name", "group_count", true)} />
                    </TwoCol>
                    <AgGridTable rows={toRecords(pageData?.designGroups)} />
                  </>
                ) : null}
                {trialGroupsSubtab === "result" ? <AgGridTable rows={toRecords(pageData?.resultGroups)} /> : null}
                {trialGroupsSubtab === "distribution" ? <ChartTile title="Distribution: Design Groups per Trial" figure={barFigure(toRecords(pageData?.groupsPerTrialDistribution), "groups_per_trial", "trial_count")} /> : null}
              </>
            )}
          </div>
        ) : null}

        {!pageLoading && currentPage.key === "safety" ? (
          <div className="page-stack">
            <AlertCallout tone="warning" title="Safety Interpretation Note">
              Adverse event frequencies reflect reporting from individual trials, which vary in design, population, duration, and follow-up.
            </AlertCallout>
            <MetricRow items={safetyMetrics(pageData?.aeAggregates as Record<string, unknown> | undefined)} />
            {!hasAnyFilter(filters) ? filterRequired("Please select at least one filter in the sidebar (indication, drug class, sponsor, phase, etc.) to view the charts.") : (
              <>
                <div className="inline-controls">
                  <input
                    value={safetyOrganFilter}
                    onChange={(event) => {
                      setSafetyOrganFilter(event.target.value);
                      updateFilter("ae_organ_system", event.target.value ? [event.target.value] : []);
                    }}
                    placeholder="Filter by Organ System (optional)"
                  />
                  <input
                    value={safetyTermFilter}
                    onChange={(event) => {
                      setSafetyTermFilter(event.target.value);
                      updateFilter("ae_term", event.target.value ? [event.target.value] : []);
                    }}
                    placeholder="Filter by AE Term (optional)"
                  />
                </div>
                <SectionTabs
                  items={[
                    { key: "terms", label: "🔢 Top AE Terms" },
                    { key: "organ", label: "🫀 Organ Systems" },
                    { key: "drug", label: "💊 By Drug" },
                    { key: "detail", label: "📄 Detail Table" },
                  ]}
                  active={safetySubtab}
                  onChange={setSafetySubtab}
                />
                {safetySubtab === "terms" ? (
                  <>
                    <TwoCol>
                      <ChartTile title="Top AE Terms by Trial Count" figure={barFigure(toRecords((pageData?.aeAggregates as any)?.topAe).slice(0, 15), "adverse_event_term", "trial_count", true)} />
                      <ChartTile title="Top AE Terms by Subjects Affected" figure={barFigure(toRecords((pageData?.aeAggregates as any)?.topAe).slice(0, 15), "adverse_event_term", "total_affected", true)} />
                    </TwoCol>
                    <AgGridTable rows={toRecords((pageData?.aeAggregates as any)?.topAe)} />
                  </>
                ) : null}
                {safetySubtab === "organ" ? (
                  <TwoCol>
                    <ChartTile title="Top 10 Organ Systems by Trial Count" figure={barFigure(toRecords((pageData?.aeAggregates as any)?.organSystems).slice(0, 10), "organ_system", "trial_count", true)} />
                    <ChartTile title="Top 10 Organ Systems by Subjects Affected" figure={treemapFigure(toRecords((pageData?.aeAggregates as any)?.organSystems).slice(0, 10), "organ_system", "total_affected")} />
                  </TwoCol>
                ) : null}
                {safetySubtab === "drug" ? (
                  <TwoCol>
                    <ChartTile title="AE Trials by Drug" figure={barFigure(toRecords(pageData?.aeByDrug), "brand_name", "trial_count", true)} />
                    <ChartTile title="Unique AE Terms per Drug" figure={barFigure(toRecords(pageData?.aeByDrug), "brand_name", "unique_terms", true)} />
                  </TwoCol>
                ) : null}
                {safetySubtab === "detail" ? (
                  <>
                    <button className="action-button" onClick={loadSafetyDetail}>
                      Load Detail Table
                    </button>
                    {safetyDetailLoading ? <LoadingScreen message="Loading AE detail..." compact /> : null}
                    {safetyDetail.length ? <AgGridTable rows={safetyDetail} /> : null}
                  </>
                ) : null}
              </>
            )}
          </div>
        ) : null}

        {!pageLoading && currentPage.key === "drug-pricing" ? (
          <div className="page-stack">
            <MetricRow items={[
              { label: "Unique Drugs", value: kpis.unique_drugs, icon: "💊" },
              { label: "Dosage Forms", value: kpis.dosage_forms, icon: "🧪" },
              { label: "Unique Diseases", value: kpis.unique_diseases, icon: "🔬" },
              { label: `Avg Annual Cost (${String(kpis.latest_quarter ?? "—")})`, value: kpis.latest_avg_cost ? `$${Number(kpis.latest_avg_cost).toLocaleString()}` : "—", icon: "💰" },
            ]} />
            {!hasAnyFilter(filters) ? filterRequired("Select at least one filter in the sidebar to view pricing charts and data.") : (
              <>
                <SectionTabs
                  items={[
                    { key: "cost", label: "📈 Cost Over Time" },
                    { key: "class", label: "🏷️ By Drug Class" },
                    { key: "wac", label: "💲 WAC Price History" },
                    { key: "raw", label: "📄 Raw Data" },
                  ]}
                  active={pricingSubtab}
                  onChange={setPricingSubtab}
                />
                {pricingSubtab === "cost" ? <ChartTile title="Annual Cost Over Time per Drug" figure={multiLineFigure(toRecords(pageData?.annualCostPerBrandOverTime).map((row) => ({ ...row, quarter_start: yearLabel(row.quarter_start) })), "quarter_start", "total_cost", "brand_name")} /> : null}
                {pricingSubtab === "class" ? <ChartTile title="Avg Latest Annual Cost by Drug Class" figure={barFigure(toRecords(pageData?.annualCostByDrugClass), "drug_class", "avg_cost", true)} /> : null}
                {pricingSubtab === "wac" ? <ChartTile title="WAC Unit Price History" figure={multiLineFigure(toRecords(pageData?.wacPriceHistory).map((row) => ({ ...row, wac_unit_effective_date: yearLabel(row.wac_unit_effective_date) })), "wac_unit_effective_date", "wac_unit_price", "brand_name")} /> : null}
                {pricingSubtab === "raw" ? <AgGridTable rows={toRecords(pageData?.rawPricing)} /> : null}
                <AiSummaryBlock pageKey="drug-pricing" summary={pageSummaries["drug-pricing"]} loading={summaryLoading} onGenerate={() => requestSummary("drug-pricing")} />
              </>
            )}
          </div>
        ) : null}

        {!pageLoading && currentPage.key === "market-access" ? (
          <div className="page-stack">
            <div className="inline-controls">
              <button className={marketAccessYear === 2025 ? "pill active" : "pill"} onClick={() => setMarketAccessYear(2025)}>2025</button>
              <button className={marketAccessYear === 2026 ? "pill active" : "pill"} onClick={() => setMarketAccessYear(2026)}>2026</button>
            </div>
            <MetricRow items={[
              { label: "Drugs Tracked", value: kpis.total_drugs, icon: "💊" },
              { label: "With Prior Auth (PA)", value: `${metricValue(kpis.pa_pct)}%`, icon: "📋" },
              { label: "With Qty Limits (QL)", value: `${metricValue(kpis.ql_pct)}%`, icon: "⚖️" },
              { label: "With Specialty (SP)", value: `${metricValue(kpis.sp_pct)}%`, icon: "🏥" },
              { label: "Payers Covered", value: "6", icon: "🏛️" },
            ]} />
            {!hasAnyFilter(filters) ? filterRequired("Select at least one filter in the sidebar to view market access charts.") : (
              <>
                <SectionTabs
                  items={[
                    { key: "tiers", label: "🎨 Formulary Tiers" },
                    { key: "requirements", label: "✅ Access Requirements" },
                  ]}
                  active={marketAccessSubtab}
                  onChange={setMarketAccessSubtab}
                />
                {marketAccessSubtab === "tiers" ? <ChartTile title={`Formulary Tiers by Drug & Payer (${marketAccessYear})`} figure={tierFigure(toRecords(pageData?.tierGrid))} /> : null}
                {marketAccessSubtab === "requirements" ? (
                  <>
                    <div className="inline-controls">
                      {["PA", "QL", "SP"].map((option) => (
                        <button key={option} className={marketAccessReqType === option ? "pill active" : "pill"} onClick={() => setMarketAccessReqType(option)}>
                          {option}
                        </button>
                      ))}
                    </div>
                    <ChartTile title={`${marketAccessReqType} Requirement by Drug & Payer (${marketAccessYear})`} figure={reqFigure(toRecords(pageData?.requirementGrid), marketAccessReqType)} />
                  </>
                ) : null}
                <AiSummaryBlock pageKey="market-access" summary={pageSummaries["market-access"]} loading={summaryLoading} onGenerate={() => requestSummary("market-access")} />
              </>
            )}
          </div>
        ) : null}

        {!pageLoading && currentPage.key === "ask-the-data" ? (
          <div className="page-stack">
            <div className="ask-card">
              <h3>What do you want to explore?</h3>
              <div className="ask-input-row">
                <input value={askQuestion} onChange={(event) => setAskQuestion(event.target.value)} placeholder="e.g. Phase 2 trials for NSCLC by AstraZeneca" />
                <button onClick={() => extractFiltersFromQuestion(askQuestion)} disabled={!askQuestion.trim() || askLoading}>
                  Ask ▶
                </button>
              </div>
              <div className="example-grid">
                {[
                  "Phase 2 trials for NSCLC by AstraZeneca",
                  "Completed breast cancer trials with posted results",
                  "Recruiting AML trials from major pharma",
                  "Merck's Phase 3 oncology pipeline",
                ].map((example) => (
                  <button key={example} className="example-button" onClick={() => { setAskQuestion(example); extractFiltersFromQuestion(example); }}>
                    {example}
                  </button>
                ))}
              </div>
            </div>
            {askExtracted ? (
              <div className="ask-result">
                <div className="ask-title">🎯 Interpreted as</div>
                <div className="ask-interpretation">{String(askExtracted.interpretation ?? "—")}</div>
                <div className="chip-row">
                  {renderAskChips(askExtracted)}
                </div>
                <div className="inline-controls">
                  <button className="action-button" onClick={applyAskFilters}>Apply to Dashboard</button>
                  <button className="ghost-button" onClick={() => setAskExtracted(null)}>Ask Again</button>
                </div>
              </div>
            ) : null}
          </div>
        ) : null}

        {!pageLoading && currentPage.key === "scores" ? (
          <div className="page-stack">
            <AlertCallout tone="info" title="Work in Progress">
              {String(pageData?.message ?? "This page is currently a work in progress.")}
            </AlertCallout>
          </div>
        ) : null}
      </main>

      <style jsx global>{`
        body {
          background:
            radial-gradient(circle at top right, rgba(46, 134, 171, 0.12), transparent 28%),
            linear-gradient(180deg, #f8fafc 0%, #edf4fb 100%);
          color: #1a1a2e;
        }
        .dashboard-shell {
          display: grid;
          grid-template-columns: 292px minmax(0, 1fr);
          min-height: 100vh;
        }
        .dashboard-sidebar {
          background: linear-gradient(180deg, #0b1929 0%, #0f4c81 100%);
          color: #ffffff;
          padding: 20px 16px 24px;
          position: sticky;
          top: 0;
          height: 100vh;
          overflow-y: auto;
        }
        .dashboard-main {
          padding: 14px 18px 36px;
          min-width: 0;
        }
        .sidebar-brand {
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 0 4px 12px;
          margin-bottom: 12px;
          border-bottom: 1px solid rgba(255, 255, 255, 0.18);
        }
        .sidebar-brand img {
          flex-shrink: 0;
          border-radius: 6px;
        }
        .sidebar-brand-name {
          font-size: 10px;
          line-height: 1.35;
          color: rgba(219, 231, 244, 0.7);
          font-weight: 600;
          letter-spacing: 0.03em;
          text-transform: uppercase;
        }
        .user-badge {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 0 0 10px;
          border-bottom: 1px solid rgba(255, 255, 255, 0.12);
          margin-bottom: 12px;
        }
        .user-avatar {
          width: 28px;
          height: 28px;
          border-radius: 50%;
          background: rgba(255, 255, 255, 0.14);
          border: 1.5px solid rgba(255, 255, 255, 0.22);
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 10px;
          font-weight: 700;
          color: #ffffff;
          flex-shrink: 0;
          letter-spacing: 0.02em;
        }
        .user-info {
          flex: 1;
          min-width: 0;
        }
        .user-name {
          font-size: 12px;
          font-weight: 600;
          color: #ffffff;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .user-role {
          font-size: 10px;
          color: rgba(255, 255, 255, 0.4);
          margin-top: 1px;
        }
        .user-signout-btn {
          background: transparent;
          border: none;
          color: rgba(255, 255, 255, 0.35);
          cursor: pointer;
          font-size: 13px;
          padding: 4px 6px;
          border-radius: 6px;
          line-height: 1;
          transition: color 0.2s, background 0.2s;
          flex-shrink: 0;
        }
        .user-signout-btn:hover {
          color: #ffffff;
          background: rgba(255, 255, 255, 0.1);
        }
        .reset-button,
        .action-button,
        .ghost-button,
        .example-button,
        .ask-input-row button,
        .pill {
          border: none;
          border-radius: 8px;
          cursor: pointer;
          transition: background 0.2s ease, transform 0.2s ease;
        }
        .reset-button {
          width: 100%;
          background: transparent;
          color: rgba(255, 255, 255, 0.55);
          padding: 9px 12px;
          border: 1px solid rgba(255, 255, 255, 0.16);
          font-size: 12px;
          font-weight: 500;
          letter-spacing: 0.01em;
        }
        .sidebar-filter-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-bottom: 12px;
          padding-bottom: 8px;
          border-bottom: 1px solid rgba(255, 255, 255, 0.08);
        }
        .sidebar-filter-label {
          font-size: 10px;
          font-weight: 700;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          color: rgba(255, 255, 255, 0.45);
        }
        .sidebar-filter-count {
          background: rgba(255, 255, 255, 0.16);
          color: #ffffff;
          font-size: 11px;
          font-weight: 700;
          padding: 2px 8px;
          border-radius: 999px;
        }
        .sidebar-section-divider {
          height: 1px;
          background: rgba(255, 255, 255, 0.08);
          margin: 6px 0 14px;
        }
        .dashboard-sidebar details {
          border: 1px solid rgba(255, 255, 255, 0.15);
          border-radius: 10px;
          margin-bottom: 10px;
          overflow: hidden;
        }
        .dashboard-sidebar summary {
          list-style: none;
          cursor: pointer;
          padding: 11px 14px;
          color: #e2e8f0;
          font-weight: 600;
          font-size: 13px;
          background: rgba(255, 255, 255, 0.05);
          transition: background 0.15s ease;
          display: flex;
          align-items: center;
          justify-content: space-between;
        }
        .dashboard-sidebar summary:hover {
          background: rgba(255, 255, 255, 0.1);
        }
        .dashboard-sidebar summary::marker { display: none; }
        .dashboard-sidebar summary::after {
          content: '›';
          font-size: 16px;
          font-weight: 300;
          color: rgba(255, 255, 255, 0.35);
          transition: transform 0.2s ease, color 0.2s ease;
          flex-shrink: 0;
          line-height: 1;
        }
        .dashboard-sidebar details[open] summary {
          background: rgba(255, 255, 255, 0.08);
          border-bottom: 1px solid rgba(255, 255, 255, 0.1);
        }
        .dashboard-sidebar details[open] > summary::after {
          transform: rotate(90deg);
          color: rgba(255, 255, 255, 0.65);
        }
        .dashboard-sidebar details > div {
          padding: 10px 12px 6px;
        }
        .enrollment-range {
          margin-bottom: 12px;
        }
        .enrollment-range-label {
          display: block;
          margin-bottom: 6px;
          font-size: 13px;
          font-weight: 600;
          color: #ffffff;
        }
        .range-row {
          display: flex;
          align-items: center;
          gap: 6px;
        }
        .range-row > span {
          color: rgba(255, 255, 255, 0.45);
          font-size: 13px;
          flex-shrink: 0;
        }
        .range-input {
          flex: 1;
          min-width: 0;
          border-radius: 8px;
          border: 1px solid rgba(255, 255, 255, 0.3);
          background: rgba(255, 255, 255, 0.96);
          color: #1a1a2e;
          padding: 9px 10px;
          font-size: 13px;
          outline: none;
        }
        .range-input:focus {
          border-color: #8dc7dd;
          box-shadow: 0 0 0 3px rgba(141, 199, 221, 0.24);
        }
        .range-input::-webkit-outer-spin-button,
        .range-input::-webkit-inner-spin-button {
          -webkit-appearance: none;
        }
        .range-input[type=number] {
          -moz-appearance: textfield;
        }
        .sidebar-field,
        .msd-wrapper {
          margin-bottom: 12px;
        }
        .sidebar-field-label,
        .msd-label {
          display: block;
          margin-bottom: 6px;
          font-size: 13px;
          font-weight: 600;
          color: #ffffff;
        }
        .sidebar-select-input,
        .msd-search {
          width: 100%;
          border-radius: 8px;
          border: 1px solid rgba(255, 255, 255, 0.3);
          background: rgba(255, 255, 255, 0.96);
          color: #1a1a2e;
          padding: 10px 12px;
          outline: none;
          box-shadow: inset 0 1px 1px rgba(15, 76, 129, 0.06);
        }
        .sidebar-select-input:focus,
        .msd-search:focus {
          border-color: #8dc7dd;
          box-shadow: 0 0 0 3px rgba(141, 199, 221, 0.24);
        }
        .msd-trigger {
          width: 100%;
          display: flex;
          align-items: center;
          gap: 8px;
          justify-content: space-between;
          padding: 10px 12px;
          border-radius: 8px;
          border: 1px solid rgba(255, 255, 255, 0.3);
          background: rgba(255, 255, 255, 0.96);
          color: #1a1a2e;
          cursor: pointer;
          font-weight: 500;
        }
        .msd-count {
          min-width: 22px;
          height: 22px;
          display: inline-grid;
          place-items: center;
          padding: 0 6px;
          border-radius: 999px;
          background: #0f4c81;
          color: #ffffff;
          font-size: 12px;
          font-weight: 700;
        }
        .msd-chevron {
          color: #5b7288;
          font-size: 11px;
        }
        .msd-panel {
          margin-top: 8px;
          border-radius: 10px;
          border: 1px solid rgba(255, 255, 255, 0.25);
          background: rgba(11, 25, 41, 0.88);
          backdrop-filter: blur(10px);
          box-shadow: 0 14px 30px rgba(5, 15, 25, 0.28);
          overflow: hidden;
        }
        .msd-search {
          margin: 10px;
          width: calc(100% - 20px);
          border-color: rgba(255, 255, 255, 0.18);
          background: rgba(255, 255, 255, 0.95);
        }
        .msd-list {
          max-height: 240px;
          overflow-y: auto;
          padding: 4px 6px 8px;
        }
        .msd-item {
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 8px 10px;
          border-radius: 8px;
          color: #e2e8f0;
          cursor: pointer;
          font-size: 13px;
        }
        .msd-item:hover {
          background: rgba(255, 255, 255, 0.08);
        }
        .msd-item input {
          accent-color: #8dc7dd;
        }
        .msd-empty {
          padding: 14px 10px;
          color: #cbd5e1;
          font-size: 13px;
          text-align: center;
        }
        .msd-pills {
          display: flex;
          flex-wrap: wrap;
          gap: 6px;
          margin-top: 8px;
        }
        .msd-pill {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          max-width: 100%;
          padding: 5px 8px 5px 10px;
          border-radius: 999px;
          background: rgba(255, 255, 255, 0.14);
          color: #ffffff;
          border: 1px solid rgba(255, 255, 255, 0.18);
          font-size: 12px;
        }
        .msd-pill button {
          border: none;
          background: rgba(255, 255, 255, 0.16);
          color: #ffffff;
          width: 18px;
          height: 18px;
          border-radius: 999px;
          cursor: pointer;
          padding: 0;
          line-height: 1;
        }
        .dashboard-main :global(.plot-wrapper) {
          width: 100%;
        }
        .tabs {
          display: flex;
          flex-wrap: nowrap;
          gap: 6px;
          background: white;
          border: 1px solid #e5e7eb;
          border-radius: 12px;
          padding: 4px;
          margin-bottom: 14px;
          overflow-x: auto;
          scrollbar-width: none;
        }
        .tabs::-webkit-scrollbar { display: none; }
        .tab-button {
          background: transparent;
          color: #374151;
          padding: 8px 12px;
          border-radius: 8px;
          font-weight: 600;
          cursor: pointer;
          border: none;
          flex: 0 0 auto;
          white-space: nowrap;
          line-height: 1.1;
        }
        .top-tabs {
          padding: 4px;
          border-radius: 14px;
        }
        .top-tab-button {
          font-size: 13px;
          min-height: 36px;
        }
        .section-tabs {
          width: fit-content;
          max-width: 100%;
          margin-bottom: 10px;
        }
        .section-tab-button {
          font-size: 12px;
          padding: 7px 11px;
          min-height: 32px;
        }
        .tab-button:hover {
          background: rgba(15, 76, 129, 0.08);
        }
        .tab-button.active {
          background: #0f4c81;
          color: white;
          box-shadow: inset 0 -1px 0 rgba(255, 255, 255, 0.12);
        }
        .page-header {
          padding: 8px 2px 14px;
          border-bottom: 2px solid #e5e7eb;
          margin-bottom: 14px;
        }
        .page-header h1 {
          margin: 0;
          font-size: 26px;
          color: #0f4c81;
          letter-spacing: -0.02em;
        }
        .page-header p {
          color: #6b7280;
          margin: 6px 0 0;
          max-width: 720px;
          font-size: 14px;
          line-height: 1.5;
        }
        .filter-bar {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
          align-items: center;
          background: #ffffff;
          border: 1px solid #e5e7eb;
          border-radius: 10px;
          padding: 8px 12px;
          margin-bottom: 14px;
          box-shadow: 0 1px 4px rgba(0, 0, 0, 0.05);
        }
        .filter-chip {
          padding: 5px 10px;
          border-radius: 7px;
          background: #ebf4fb;
          border: 1px solid #a8dadc;
          font-size: 12px;
          font-weight: 600;
          white-space: nowrap;
        }
        .filter-chip-indication,
        .filter-chip-drug-class {
          background: #e1eef9;
          border-color: #b9d2ec;
          color: #0b4f82;
        }
        .filter-chip-sponsor,
        .filter-chip-agency-class {
          background: #e8f5f2;
          border-color: #aad9cd;
          color: #176758;
        }
        .filter-chip-phase,
        .filter-chip-status {
          background: #fff3df;
          border-color: #f1cd87;
          color: #9b6100;
        }
        .filter-chip-country,
        .filter-chip-drug,
        .filter-chip-drug-indication,
        .filter-chip-endpoint,
        .filter-chip-pro {
          background: #f2ecff;
          border-color: #d6c8ff;
          color: #4f3f95;
        }
        .page-stack {
          display: grid;
          gap: 16px;
        }
        .two-col {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 14px;
          align-items: start;
        }
        .metric-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
          gap: 12px;
        }
        .metric-card {
          background: white;
          border: 1px solid #e5e7eb;
          border-left: 4px solid #0f4c81;
          border-radius: 12px;
          padding: 20px 24px;
          min-height: 126px;
          position: relative;
          box-shadow: 0 1px 3px rgba(0, 0, 0, 0.04);
          transition: transform 0.18s ease, box-shadow 0.18s ease, border-color 0.18s ease;
        }
        .metric-card:hover {
          transform: translateY(-1px);
          box-shadow: 0 8px 22px rgba(15, 76, 129, 0.08);
          border-color: #cfdbe7;
        }
        .metric-label {
          font-size: 12px;
          text-transform: uppercase;
          color: #6b7280;
          font-weight: 600;
          min-height: 32px;
          padding-right: 42px;
        }
        .metric-value {
          font-size: 32px;
          font-weight: 700;
          color: #0f4c81;
          margin-top: 10px;
        }
        .metric-icon {
          position: absolute;
          top: 16px;
          right: 16px;
          background: rgba(15, 76, 129, 0.08);
          border-radius: 8px;
          padding: 6px 8px;
        }
        .chart-tile,
        .table-card,
        .ask-card,
        .ask-result,
        .alert {
          background: white;
          border: 1px solid #e5e7eb;
          border-radius: 12px;
          box-shadow: 0 1px 3px rgba(0, 0, 0, 0.04);
        }
        .chart-tile {
          padding: 12px 12px 4px;
          transition: transform 0.18s ease, box-shadow 0.18s ease, border-color 0.18s ease;
          min-width: 0;
        }
        .chart-canvas {
          width: 100%;
          min-width: 0;
        }
        .chart-tile:hover,
        .table-card:hover,
        .ask-card:hover,
        .ask-result:hover {
          transform: translateY(-1px);
          box-shadow: 0 10px 24px rgba(15, 76, 129, 0.08);
          border-color: #d5e3ee;
        }
        .chart-header {
          padding: 0 2px 6px;
        }
        .chart-title {
          font-size: 14px;
          font-weight: 700;
          color: #0f4c81;
        }
        .chart-tile :global(.js-plotly-plot),
        .chart-tile :global(.plot-container),
        .chart-tile :global(.svg-container) {
          width: 100% !important;
        }
        .chart-canvas :global(.js-plotly-plot),
        .chart-canvas :global(.plot-container),
        .chart-canvas :global(.svg-container) {
          height: 100% !important;
        }
        .chart-tile :global(.js-plotly-plot .plotly) {
          border-radius: 8px;
          overflow: hidden;
        }
        .chart-tile :global(.modebar) {
          opacity: 0;
          transition: opacity 0.15s ease;
        }
        .chart-tile:hover :global(.modebar) {
          opacity: 1;
        }
        .alert {
          padding: 16px 18px;
        }
        .alert.info { border-left: 4px solid #2e86ab; }
        .alert.warning { border-left: 4px solid #e9c46a; }
        .alert.danger { border-left: 4px solid #e76f51; }
        .empty-state {
          text-align: center;
          padding: 60px 20px;
          background: white;
          border: 1px solid #e5e7eb;
          border-radius: 12px;
        }
        .empty-icon {
          font-size: 48px;
          margin-bottom: 16px;
        }
        .section-header {
          margin: 20px 0 12px;
        }
        .section-header h3 {
          margin: 0 0 2px;
          color: #0f4c81;
          font-size: 20px;
          font-weight: 700;
        }
        .section-header p {
          margin: 0;
          color: #6b7280;
          font-size: 14px;
          font-weight: 400;
        }
        .table-card {
          padding: 12px;
          overflow-x: auto;
        }
        .table-card.ag-theme-alpine {
          padding: 8px;
          overflow: hidden;
        }
        table {
          width: 100%;
          border-collapse: collapse;
          font-size: 14px;
        }
        th,
        td {
          padding: 10px 12px;
          border-bottom: 1px solid #e5e7eb;
          text-align: left;
          vertical-align: top;
        }
        th {
          color: #6b7280;
          font-size: 12px;
          text-transform: uppercase;
        }
        .csv-button,
        .action-button {
          background: #0f4c81;
          color: white;
          padding: 10px 14px;
        }
        .csv-button:hover,
        .action-button:hover,
        .example-button:hover,
        .pill:hover,
        .reset-button:hover {
          background: rgba(255, 255, 255, 0.08);
          color: rgba(255, 255, 255, 0.85);
          border-color: rgba(255, 255, 255, 0.28);
        }
        .ghost-button {
          background: #f8fafc;
          color: #0f4c81;
          padding: 10px 14px;
          border: 1px solid #e5e7eb;
        }
        .ghost-button:hover {
          background: #eef4f9;
        }
        .inline-controls {
          display: flex;
          flex-wrap: wrap;
          gap: 10px;
          align-items: center;
        }
        .inline-controls input,
        .ask-input-row input,
        .sidebar-input {
          width: 100%;
          border: 1px solid #d1d5db;
          border-radius: 8px;
          padding: 10px 12px;
          background: white;
        }
        .pill {
          padding: 8px 14px;
          background: white;
          border: 1px solid #e5e7eb;
        }
        .pill.active {
          background: #0f4c81;
          color: white;
        }
        .ask-input-row {
          display: grid;
          grid-template-columns: minmax(0, 1fr) 120px;
          gap: 12px;
          margin-bottom: 16px;
        }
        .ask-input-row button {
          background: #0f4c81;
          color: white;
        }
        .example-grid {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 10px;
        }
        .example-button {
          background: #f8fafc;
          border: 1px solid #e5e7eb;
          padding: 12px;
          text-align: left;
        }
        .module-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
          gap: 14px;
        }
        .module-card {
          text-align: left;
          background: #ffffff;
          border: 1px solid #e5e7eb;
          border-radius: 12px;
          padding: 18px 20px;
          cursor: pointer;
          transition: box-shadow .2s, border-color .2s, transform .2s;
          display: flex;
          align-items: flex-start;
          gap: 14px;
          position: relative;
          overflow: hidden;
        }
        .module-card::after {
          content: '';
          position: absolute;
          top: 0; left: 0;
          width: 3px; height: 100%;
          background: #0f4c81;
          border-radius: 12px 0 0 12px;
          opacity: 0;
          transition: opacity .2s;
        }
        .module-card:hover {
          box-shadow: 0 6px 24px rgba(15, 76, 129, .13);
          border-color: #93c5fd;
          transform: translateY(-2px);
        }
        .module-card:hover::after { opacity: 1; }
        .module-icon-wrap {
          background: rgba(15, 76, 129, 0.08);
          border-radius: 10px;
          width: 42px;
          height: 42px;
          min-width: 42px;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 1.2rem;
          line-height: 1;
          flex-shrink: 0;
        }
        .module-body { flex: 1; min-width: 0; }
        .module-card-label {
          font-size: 14px;
          font-weight: 700;
          color: #1e40af;
          margin-bottom: 4px;
          line-height: 1.3;
        }
        .module-card-desc {
          color: #6b7280;
          line-height: 1.45;
          font-size: 12.5px;
        }
        .module-arrow {
          font-size: 1.15rem;
          color: #cbd5e1;
          flex-shrink: 0;
          align-self: center;
          transition: color .2s, transform .2s;
          font-weight: 300;
          padding-left: 4px;
        }
        .module-card:hover .module-arrow {
          color: #0f4c81;
          transform: translateX(3px);
        }
        .ask-result {
          padding: 20px 24px;
        }
        .ask-title {
          font-size: 12px;
          color: #6b7280;
          text-transform: uppercase;
          font-weight: 700;
        }
        .ask-interpretation {
          margin-top: 8px;
          font-size: 20px;
          font-weight: 700;
          color: #0f4c81;
        }
        .chip-row {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
          margin: 16px 0;
        }
        .chip {
          background: #0f4c81;
          color: white;
          padding: 6px 12px;
          border-radius: 999px;
          font-size: 13px;
        }
        .loading-screen {
          display: grid;
          place-items: center;
          min-height: 200px;
          color: #6b7280;
        }
        .loading-screen.compact {
          min-height: 120px;
        }
        .skeleton-block {
          border-radius: 14px;
          background: linear-gradient(90deg, #edf2f7 0%, #f8fbfd 45%, #edf2f7 100%);
          background-size: 220% 100%;
          animation: shimmer 1.4s linear infinite;
          border: 1px solid #e5e7eb;
        }
        .skeleton-metric {
          min-height: 126px;
        }
        .skeleton-chart {
          min-height: 340px;
        }
        .sidebar-loading {
          margin-top: 12px;
          font-size: 12px;
          color: #cbd5e1;
        }
        .ag-theme-alpine {
          --ag-font-family: "DM Sans", system-ui, sans-serif;
          --ag-border-color: #e5e7eb;
          --ag-row-border-color: #edf2f7;
          --ag-header-background-color: #f8fafc;
          --ag-header-foreground-color: #64748b;
          --ag-background-color: #ffffff;
          --ag-odd-row-background-color: #fbfdff;
          --ag-row-hover-color: #eef5fb;
          --ag-selected-row-background-color: #e7f0fa;
          --ag-border-radius: 10px;
          --ag-wrapper-border-radius: 10px;
          --ag-cell-horizontal-padding: 12px;
          --ag-grid-size: 8px;
        }
        .ag-theme-alpine .ag-header {
          border-bottom: 1px solid #e5e7eb;
        }
        .ag-theme-alpine .ag-header-cell-label {
          font-weight: 700;
          text-transform: uppercase;
          font-size: 11px;
          letter-spacing: 0.04em;
        }
        .ag-theme-alpine .ag-row {
          font-size: 13px;
        }
        @keyframes shimmer {
          0% { background-position: 200% 0; }
          100% { background-position: -20% 0; }
        }
        @media (max-width: 640px) {
          .metric-grid {
            grid-template-columns: 1fr;
          }
        }
        @media (max-width: 1280px) {
          .dashboard-main {
            padding: 14px 16px 32px;
          }
        }
        @media (max-width: 960px) {
          .dashboard-shell {
            grid-template-columns: 1fr;
          }
          .dashboard-sidebar {
            position: static;
            height: auto;
          }
          .two-col,
          .example-grid,
          .ask-input-row {
            grid-template-columns: 1fr;
          }
          .dashboard-main {
            padding: 14px;
          }
        }
      `}</style>
    </div>
  );
}

function LoadingScreen({ message, compact = false }: { message: string; compact?: boolean }) {
  if (compact) {
    return <div className="loading-screen compact">{message}</div>;
  }
  return (
    <div className="page-stack">
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: 12 }}>
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="skeleton-block skeleton-metric" />
        ))}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <div className="skeleton-block skeleton-chart" />
        <div className="skeleton-block skeleton-chart" />
      </div>
    </div>
  );
}

function TopTabs({ pages, activeKey, onChange }: { pages: PageMeta[]; activeKey: string; onChange: (key: string) => void }) {
  return (
    <div className="tabs top-tabs">
      {pages.map((page) => (
        <button key={page.key} className={`tab-button top-tab-button${page.key === activeKey ? " active" : ""}`} onClick={() => onChange(page.key)}>
          {page.label}
        </button>
      ))}
    </div>
  );
}

const moduleDesc: Record<string, string> = {
  "ask-the-data": "Natural language queries that automatically apply filters across the dashboard.",
  pipeline: "Investigational oncology pipeline by sponsor, indication, and PRO usage.",
  "drug-detail": "Brand portfolios, drug classes, and phase distribution for selected assets.",
  "drug-pricing": "Annual cost trends and WAC price history across dosage forms.",
  "market-access": "Formulary tiers and PA/QL/SP requirements across 6 major US payers.",
  sponsors: "Compare sponsor trial counts, phase mix, PRO adoption, and endpoint focus.",
  "trial-design": "Allocation methods, intervention models, arms count, and eligibility criteria.",
  endpoints: "Protocol-level outcome types, top endpoint categories, and planned PRO instruments.",
  outcomes: "Posted result outcomes: category distributions, types, and top reported endpoints.",
  scores: "Numeric outcome measurements, score distributions, and drug comparisons.",
  "pro-overview": "PRO instrument adoption: planned vs reported, by sponsor, and by phase.",
  "trial-groups": "Protocol arms, design groups, and result groups: structure and drug linkage.",
  safety: "Adverse event terms, organ systems, drug associations, and incidence analysis.",
};

function PageHeader({ page }: { page: PageMeta }) {
  const subtitles: Record<string, string> = {
    home: "Competitive landscape, pipeline intelligence, endpoint benchmarking, PRO analytics, and safety analysis.",
    pipeline: "Investigational asset landscape: sponsor activity, indication coverage, and pipeline PRO usage.",
    "drug-detail": "Trial portfolio, conditions studied, and drug classes for the active filter scope.",
    "drug-pricing": "Annual cost trends and WAC unit price history for the active filter scope.",
    "market-access": "Formulary tier and utilization-management requirements across 6 major US payers (2025 & 2026).",
    sponsors: "Compare sponsor trial portfolios, phase distribution, PRO adoption rates, and endpoint focus.",
    "trial-design": "Benchmark trial design patterns: allocation method, intervention model, arms count, and eligibility.",
    endpoints: "Protocol-level endpoint design: outcome types, most common endpoints, and planned PRO instruments.",
    outcomes: "Analysis of posted result outcomes: category distributions, types, and top reported endpoints.",
    scores: "Numeric outcome measurements: score distributions, drug comparisons, and result-group analysis.",
    "pro-overview": "Patient-reported outcome instrument adoption: planned vs reported, by sponsor, and by phase.",
    "trial-groups": "Protocol arms, design groups, and result groups: intervention mapping and group structure.",
    safety: "Adverse event reporting: terms, organ systems, drug associations, and incidence analysis.",
    "ask-the-data": "Ask a question about the clinical trial landscape — filters are applied automatically across all tabs.",
  };

  return (
    <div className="page-header">
      <h1>{page.title}</h1>
      <p>{subtitles[page.key] ?? ""}</p>
    </div>
  );
}

const CHIP_CLASS: Record<string, string> = {
  Indication: "filter-chip-indication",
  "Drug Class": "filter-chip-drug-class",
  Sponsor: "filter-chip-sponsor",
  "Agency Class": "filter-chip-agency-class",
  Phase: "filter-chip-phase",
  Status: "filter-chip-status",
  Country: "filter-chip-country",
  Drug: "filter-chip-drug",
  "Drug Indication": "filter-chip-drug-indication",
  "Endpoint Category": "filter-chip-endpoint",
  "PRO Instrument": "filter-chip-pro",
  "PRO Domain": "filter-chip-pro",
};

function FilterSummaryBar({ active }: { active: Record<string, string> }) {
  const entries = Object.entries(active);
  return (
    <div className="filter-bar">
      <strong>🔍 Filters</strong>
      {!entries.length ? <span style={{ color: "#9ca3af", fontStyle: "italic" }}>No filters active</span> : null}
      {entries.map(([label, value]) => {
        const chipClass = CHIP_CLASS[label] ?? "filter-chip-sponsor";
        return (
          <span key={label} className={`filter-chip ${chipClass}`} title={`${label}: ${value}`}>
            {label}: {value.length > 28 ? `${value.slice(0, 28)}…` : value}
          </span>
        );
      })}
    </div>
  );
}

function MetricRow({ items }: { items: { label: string; value: unknown; icon: string }[] }) {
  return (
    <div className="metric-grid">
      {items.map((item) => (
        <div key={item.label} className="metric-card">
          <div className="metric-icon">{item.icon}</div>
          <div className="metric-label">{item.label}</div>
          <div className="metric-value">{metricValue(item.value)}</div>
        </div>
      ))}
    </div>
  );
}

function ChartTile({ title, figure }: { title: string; figure: { data: any[]; layout: any } }) {
  const plotHeight =
    typeof figure?.layout?.height === "number" && Number.isFinite(figure.layout.height)
      ? figure.layout.height
      : 380;
  const chartKey = `${title}-${figure?.data?.length ?? 0}-${plotHeight}`;

  return (
    <div className="chart-tile">
      <div className="chart-header">
        <div className="chart-title">{title}</div>
      </div>
      <div className="chart-canvas" style={{ height: plotHeight }}>
        <Plot
          key={chartKey}
          data={figure.data}
          layout={{ ...figure.layout, autosize: true }}
          config={{ displayModeBar: "hover", responsive: true, displaylogo: false, modeBarButtonsToRemove: ["select2d", "lasso2d", "autoScale2d"] }}
          useResizeHandler
          style={{ width: "100%", height: `${plotHeight}px` }}
        />
      </div>
    </div>
  );
}

function SectionTabs({ items, active, onChange }: { items: { key: string; label: string }[]; active: string; onChange: (key: string) => void }) {
  return (
    <div className="tabs section-tabs">
      {items.map((item) => (
        <button key={item.key} className={`tab-button section-tab-button${item.key === active ? " active" : ""}`} onClick={() => onChange(item.key)}>
          {item.label}
        </button>
      ))}
    </div>
  );
}

function SectionHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="section-header">
      <h3>{title}</h3>
      {subtitle ? <p>{subtitle}</p> : null}
    </div>
  );
}

function AlertCallout({ title, children, tone }: { title: string; children: ReactNode; tone: "info" | "warning" | "danger" }) {
  return (
    <div className={`alert ${tone}`}>
      <strong>{title}</strong>
      <div style={{ marginTop: 6 }}>{children}</div>
    </div>
  );
}

function CsvButton({ rows, filename }: { rows: KeyValueRecord[]; filename: string }) {
  if (!rows.length) return null;
  return (
    <button className="csv-button" onClick={() => downloadCsv(rows, filename)}>
      ⬇ Download CSV
    </button>
  );
}

function AgGridTable({ rows }: { rows: KeyValueRecord[] }) {
  if (!rows.length) {
    return <div className="table-card">No data to display.</div>;
  }
  const columns: ColDef<KeyValueRecord>[] = inferColumns(rows).map((column) => ({
    field: column,
    headerName: column.replaceAll("_", " "),
    sortable: true,
    filter: true,
    resizable: true,
    minWidth: 140,
    flex: 1,
    valueFormatter: (params) => (params.value == null ? "-" : String(params.value)),
  }));
  return (
    <div className="table-card ag-theme-alpine" style={{ height: Math.min(Math.max(rows.length * 42 + 56, 240), 720) }}>
      <AgGridReact
        rowData={rows}
        columnDefs={columns}
        defaultColDef={{
          sortable: true,
          filter: true,
          resizable: true,
          minWidth: 140,
          flex: 1,
        }}
        animateRows
      />
    </div>
  );
}

function SidebarSelectField({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: string[];
}) {
  return (
    <div className="sidebar-field">
      <label className="sidebar-field-label">{label}</label>
      <select className="sidebar-select-input" value={value} onChange={(event) => onChange(event.target.value)}>
        {options.map((option) => (
          <option key={option || "__empty__"} value={option}>
            {option || "All"}
          </option>
        ))}
      </select>
    </div>
  );
}

function MultiCheckboxDropdown({
  label,
  values,
  options,
  onChange,
}: {
  label: string;
  values: string[];
  options: string[];
  onChange: (values: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    if (open) document.addEventListener("mousedown", handleOutside);
    return () => document.removeEventListener("mousedown", handleOutside);
  }, [open]);

  const filtered = options.filter((opt) => opt.toLowerCase().includes(search.toLowerCase()));

  function toggle(opt: string) {
    onChange(values.includes(opt) ? values.filter((v) => v !== opt) : [...values, opt]);
  }

  return (
    <div className="msd-wrapper" ref={ref}>
      <label className="msd-label">{label}</label>
      <button type="button" className="msd-trigger" onClick={() => setOpen((o) => !o)}>
        <span>{values.length === 0 ? "All" : `${values.length} selected`}</span>
        {values.length > 0 && <span className="msd-count">{values.length}</span>}
        <span className="msd-chevron">{open ? "▲" : "▼"}</span>
      </button>
      {open && (
        <div className="msd-panel">
          {options.length > 8 && (
            <input
              className="msd-search"
              placeholder="Search…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onClick={(e) => e.stopPropagation()}
              autoFocus
            />
          )}
          <div className="msd-list">
            {filtered.map((opt) => (
              <label key={opt} className="msd-item">
                <input type="checkbox" checked={values.includes(opt)} onChange={() => toggle(opt)} />
                {opt}
              </label>
            ))}
            {!filtered.length && <div className="msd-empty">No options match</div>}
          </div>
        </div>
      )}
      {values.length > 0 && (
        <div className="msd-pills">
          {values.map((v) => (
            <span key={v} className="msd-pill">
              {v.length > 22 ? `${v.slice(0, 22)}…` : v}
              <button type="button" onClick={() => toggle(v)}>×</button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function TwoCol({ children }: { children: ReactNode }) {
  return <div className="two-col">{children}</div>;
}

function AiSummaryBlock({
  pageKey,
  summary,
  loading,
  onGenerate,
}: {
  pageKey: string;
  summary?: string;
  loading: boolean;
  onGenerate: () => void;
}) {
  return (
    <div className="page-stack">
      <div style={{ display: "flex", justifyContent: "flex-end" }}>
        <button className="action-button" onClick={onGenerate} disabled={loading}>
          🤖 AI Summary
        </button>
      </div>
      {summary ? (
        <div className="ask-result">
          <div className="ask-title">🤖 AI Generated · GPT-4o · Based on current filters</div>
          <div style={{ marginTop: 16, whiteSpace: "pre-wrap", lineHeight: 1.6 }}>{summary}</div>
        </div>
      ) : null}
    </div>
  );
}

function groupBy(rows: KeyValueRecord[], key: string, valueKey: string) {
  const map = new Map<string, number>();
  rows.forEach((row) => {
    const group = String(row[key] ?? "Unknown");
    const value = Number(row[valueKey] ?? 1);
    map.set(group, (map.get(group) ?? 0) + value);
  });
  return Array.from(map.entries())
    .map(([group, value]) => ({ [key]: group, [valueKey]: value }))
    .sort((a, b) => Number(b[valueKey]) - Number(a[valueKey]));
}

function ageRows(rows: KeyValueRecord[]) {
  const totals = { Adult: 0, Child: 0, "Older Adult": 0 };
  rows.forEach((row) => {
    totals.Adult += Number(row.adult ?? 0);
    totals.Child += Number(row.child ?? 0);
    totals["Older Adult"] += Number(row.older_adult ?? 0);
  });
  return Object.entries(totals).map(([label, total]) => ({ "Age Group": label, trial_count: total }));
}

function proMetrics(rawRows: KeyValueRecord[], funnelRows: KeyValueRecord[]) {
  const uniqueInstruments = Array.from(new Set(rawRows.map((row) => String(row.instrument_name ?? "")))).filter(Boolean).length;
  const planned = funnelRows.find((row) => row.stage === "Planned PROs")?.trial_count ?? 0;
  const reported = funnelRows.find((row) => row.stage === "Reported PROs")?.trial_count ?? 0;
  return [
    { label: "Unique PRO Instruments", value: uniqueInstruments, icon: "📋" },
    { label: "Trials with Planned PRO", value: planned, icon: "📝" },
    { label: "Trials with Reported PRO", value: reported, icon: "✅" },
  ];
}

function topProRows(rawRows: KeyValueRecord[]) {
  const grouped = new Map<string, { instrument_name: string; planned_count: number; reported_count: number; total: number }>();
  rawRows.forEach((row) => {
    const key = String(row.instrument_name ?? "");
    if (!key) return;
    const current = grouped.get(key) ?? {
      instrument_name: key,
      planned_count: 0,
      reported_count: 0,
      total: 0,
    };
    current.planned_count += Number(row.planned_count ?? 0);
    current.reported_count += Number(row.reported_count ?? 0);
    current.total = current.planned_count + current.reported_count;
    grouped.set(key, current);
  });
  return Array.from(grouped.values()).sort((a, b) => b.total - a.total).slice(0, 15);
}

function sponsorTotals(rows: KeyValueRecord[]) {
  const seen = new Map<string, number>();
  rows.forEach((row) => {
    const sponsor = String(row.sponsor ?? "");
    if (!sponsor) return;
    seen.set(sponsor, Math.max(seen.get(sponsor) ?? 0, Number(row.sponsor_total ?? 0)));
  });
  return Array.from(seen.entries()).map(([sponsor, trial_count]) => ({ sponsor, trial_count })).sort((a, b) => b.trial_count - a.trial_count);
}

function safetyMetrics(aeAggregates?: Record<string, unknown>) {
  const kpis = (aeAggregates?.kpis as Record<string, unknown>) ?? {};
  return [
    { label: "Trials with AEs", value: kpis.trials_with_ae ?? 0, icon: "🧪" },
    { label: "AE Records", value: kpis.total_ae_records ?? 0, icon: "📋" },
    { label: "Unique AE Terms", value: kpis.unique_ae_terms ?? 0, icon: "🔬" },
    { label: "Organ Systems", value: kpis.unique_organ_systems ?? 0, icon: "🫀" },
    { label: "Total Subjects Affected", value: kpis.total_subjects_affected ?? 0, icon: "👥" },
  ];
}

function renderAskChips(extracted: Record<string, unknown>) {
  const chips: string[] = [];
  if (typeof extracted.indication === "string") chips.push(`Condition: ${extracted.indication}`);
  if (typeof extracted.atc_class === "string") chips.push(`Drug Class: ${extracted.atc_class}`);
  if (Array.isArray(extracted.sponsors)) chips.push(...extracted.sponsors.map((value) => `Sponsor: ${value}`));
  if (Array.isArray(extracted.phases)) chips.push(...extracted.phases.map((value) => `Phase: ${value}`));
  if (Array.isArray(extracted.statuses)) chips.push(...extracted.statuses.map((value) => `Status: ${value}`));
  if (Array.isArray(extracted.countries)) chips.push(...extracted.countries.map((value) => `Country: ${value}`));
  if (Array.isArray(extracted.agency_class)) chips.push(...extracted.agency_class.map((value) => `Agency Class: ${value}`));
  if (typeof extracted.has_results === "boolean") chips.push(`Has Results: ${extracted.has_results ? "Yes" : "No"}`);
  return chips.map((chip) => <span key={chip} className="chip">{chip}</span>);
}

function tierFigure(rows: KeyValueRecord[]) {
  const payers = ["aetna_tier", "cigna_tier", "united_tier", "kaiser_tier", "optum_tier", "anthem_tier"];
  const labels = ["Aetna", "Cigna", "UnitedHealthcare", "Kaiser", "OptumRx", "Anthem"];
  return {
    data: [
      {
        type: "heatmap",
        x: labels,
        y: rows.map((row) => row.brand_name),
        z: rows.map((row) => payers.map((payer) => parseTier(row[payer]))),
        text: rows.map((row) => payers.map((payer) => String(row[payer] ?? "NC"))),
        texttemplate: "%{text}",
        colorscale: [
          [0, "#9CA3AF"],
          [0.2, "#9CA3AF"],
          [0.2, "#2A9D8F"],
          [0.4, "#2A9D8F"],
          [0.4, "#2E86AB"],
          [0.6, "#2E86AB"],
          [0.6, "#F18F01"],
          [0.8, "#F18F01"],
          [0.8, "#E76F51"],
          [1, "#E76F51"],
        ],
        zmin: 0,
        zmax: 4,
      },
    ],
    layout: {
      paper_bgcolor: "rgba(0,0,0,0)",
      plot_bgcolor: "rgba(0,0,0,0)",
      font: { family: "DM Sans, system-ui, sans-serif", size: 12, color: "#1A1A2E" },
      height: Math.max(420, rows.length * 28 + 160),
      margin: { l: 180, r: 100, t: 56, b: 40 },
      yaxis: { autorange: "reversed" },
    },
  };
}

function reqFigure(rows: KeyValueRecord[], reqType: string) {
  const payers = ["aetna_req", "cigna_req", "united_req", "kaiser_req", "optum_req", "anthem_req"];
  const labels = ["Aetna", "Cigna", "UnitedHealthcare", "Kaiser", "OptumRx", "Anthem"];
  return {
    data: [
      {
        type: "heatmap",
        x: labels,
        y: rows.map((row) => row.brand_name),
        z: rows.map((row) => payers.map((payer) => String(row[payer] ?? "").toUpperCase().includes(reqType) ? 1 : 0)),
        text: rows.map((row) => payers.map((payer) => String(row[payer] ?? "").toUpperCase().includes(reqType) ? "✓" : "")),
        texttemplate: "%{text}",
        colorscale: [
          [0, "#FFFFFF"],
          [1, "#2A9D8F"],
        ],
        zmin: 0,
        zmax: 1,
        showscale: false,
        xgap: 3,
        ygap: 3,
      },
    ],
    layout: {
      paper_bgcolor: "#E5E7EB",
      plot_bgcolor: "rgba(0,0,0,0)",
      font: { family: "DM Sans, system-ui, sans-serif", size: 12, color: "#1A1A2E" },
      height: Math.max(420, rows.length * 30 + 160),
      margin: { l: 180, r: 40, t: 56, b: 40 },
      yaxis: { autorange: "reversed" },
    },
  };
}

function parseTier(value: unknown) {
  if (value == null) return 0;
  const str = String(value).trim().toUpperCase();
  if (!str || str === "NC" || str === "N/A" || str === "NOT COVERED") return 0;
  const numeric = Number(str);
  if (Number.isNaN(numeric)) return 0;
  return Math.min(numeric, 4);
}
