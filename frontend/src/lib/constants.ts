import { FilterOptions, FilterState, PageMeta } from "@/lib/types";

export const PAGE_META: PageMeta[] = [
  { key: "home", label: "🏠 Home", title: "Clinical Trials Intelligence Platform" },
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
  { key: "real-world-safety", label: "🌐 Real World Safety", title: "FAERS Post-Market Safety" },
  { key: "user-management", label: "🔐 User Management", title: "User Management" },
];

export const HOME_KEY = "home";

export type PageGroup = {
  key: string;
  label: string;
  tabKeys: string[];
};

export const PAGE_GROUPS: PageGroup[] = [
  { key: "pipeline", label: "📈 Pipeline",            tabKeys: ["pipeline"] },
  { key: "market",   label: "📊 Market Intelligence", tabKeys: ["drug-detail", "drug-pricing", "market-access", "sponsors"] },
  { key: "design",   label: "🔬 Trial Design",        tabKeys: ["trial-design", "trial-groups"] },
  { key: "evidence", label: "📈 Clinical Evidence",   tabKeys: ["endpoints", "outcomes", "scores", "pro-overview"] },
  { key: "safety",   label: "🛡️ Safety",              tabKeys: ["safety", "real-world-safety"] },
  { key: "admin",    label: "🔐 User Management",      tabKeys: ["user-management"] },
];

export const PAGE_SUBTITLES: Record<string, string> = {
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
  "real-world-safety": "Post-market spontaneous safety reports from FDA FAERS.",
  "ask-the-data": "Ask a question about the clinical trial landscape — filters are applied automatically across all tabs.",
  "user-management": "Manage dashboard users: logins, tab access, disease-area scope, and KPI snapshots.",
};

export const MODULE_DESC: Record<string, string> = {
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
  "real-world-safety": "Post-market spontaneous safety reports from FDA FAERS: reactions, SOC, and outcomes.",
};

export const CHIP_CLASS: Record<string, string> = {
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

export const PAGE_DATA_CACHE_MAX = 30;

export const PAGE_ENDPOINT_MAP: Record<string, { path: string; extra?: Record<string, unknown> }> = {
  home: { path: "/api/pages/home" },
  pipeline: { path: "/api/pages/pipeline" },
  "drug-detail": { path: "/api/pages/drug-detail" },
  "drug-pricing": { path: "/api/pages/drug-pricing" },
  sponsors: { path: "/api/pages/sponsors" },
  "trial-design": { path: "/api/pages/trial-design" },
  endpoints: { path: "/api/pages/planned-endpoints" },
  outcomes: { path: "/api/pages/reported-outcomes" },
  scores: { path: "/api/pages/outcome-scores" },
  "pro-overview": { path: "/api/pages/pro-overview" },
  "trial-groups": { path: "/api/pages/trial-groups" },
  safety: { path: "/api/pages/safety" },
  "real-world-safety": { path: "/api/pages/real-world-safety" },
};

export const defaultFilters: FilterState = {
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

export const emptyOptions: FilterOptions = {
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
