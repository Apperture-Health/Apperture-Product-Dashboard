import { FilterState, KeyValueRecord, PageMeta } from "@/lib/types";
import { PAGE_META, PAGE_DATA_CACHE_MAX } from "@/lib/constants";

export function hasAnyFilter(filters: FilterState): boolean {
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

export function activeFilterSummary(filters: FilterState): Record<string, string> {
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

export function getInitials(name: string): string {
  return name.split(/[\s_]+/).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? "").join("");
}

export function slugToMeta(tab: string | null, visibleTabs: string[]): PageMeta {
  const visible = PAGE_META.filter((page) => visibleTabs.includes(page.label));
  const found = visible.find((page) => page.key === tab);
  return found ?? visible[0] ?? PAGE_META[0];
}

export function metricValue(value: unknown): string {
  if (value == null) return "—";
  if (typeof value === "number") return value.toLocaleString();
  return String(value);
}

export function inferColumns(rows: KeyValueRecord[]): string[] {
  if (!rows.length) return [];
  return Object.keys(rows[0]);
}

export function toRecords(input: unknown): KeyValueRecord[] {
  if (!Array.isArray(input)) return [];
  return input as KeyValueRecord[];
}

export function yearLabel(value: unknown): string {
  if (value == null) return "";
  return String(value).slice(0, 10);
}

export function makeCacheKey(
  pageKey: string,
  filters: FilterState,
  extra?: Record<string, unknown>
): string {
  const stableFilters = Object.fromEntries(
    Object.entries(filters).sort(([a], [b]) => a.localeCompare(b))
  );
  const extraStr = extra ? `::${JSON.stringify(extra)}` : "";
  return `${pageKey}::${JSON.stringify(stableFilters)}${extraStr}`;
}

export function groupBy(rows: KeyValueRecord[], key: string, valueKey: string): KeyValueRecord[] {
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

export function ageRows(rows: KeyValueRecord[]): KeyValueRecord[] {
  const totals = { Adult: 0, Child: 0, "Older Adult": 0 };
  rows.forEach((row) => {
    totals.Adult += Number(row.adult ?? 0);
    totals.Child += Number(row.child ?? 0);
    totals["Older Adult"] += Number(row.older_adult ?? 0);
  });
  return Object.entries(totals).map(([label, total]) => ({ "Age Group": label, trial_count: total }));
}

export function proMetrics(
  rawRows: KeyValueRecord[],
  funnelRows: KeyValueRecord[]
): { label: string; value: unknown; icon: string }[] {
  const uniqueInstruments = Array.from(new Set(rawRows.map((row) => String(row.instrument_name ?? ""))))
    .filter(Boolean).length;
  const planned = funnelRows.find((row) => row.stage === "Planned PROs")?.trial_count ?? 0;
  const reported = funnelRows.find((row) => row.stage === "Reported PROs")?.trial_count ?? 0;
  return [
    { label: "Unique PRO Instruments", value: uniqueInstruments, icon: "📋" },
    { label: "Trials with Planned PRO", value: planned, icon: "📝" },
    { label: "Trials with Reported PRO", value: reported, icon: "✅" },
  ];
}

export function topProRows(
  rawRows: KeyValueRecord[]
): { instrument_name: string; planned_count: number; reported_count: number; total: number }[] {
  const grouped = new Map<string, { instrument_name: string; planned_count: number; reported_count: number; total: number }>();
  rawRows.forEach((row) => {
    const key = String(row.instrument_name ?? "");
    if (!key) return;
    const current = grouped.get(key) ?? { instrument_name: key, planned_count: 0, reported_count: 0, total: 0 };
    current.planned_count += Number(row.planned_count ?? 0);
    current.reported_count += Number(row.reported_count ?? 0);
    current.total = current.planned_count + current.reported_count;
    grouped.set(key, current);
  });
  return Array.from(grouped.values()).sort((a, b) => b.total - a.total).slice(0, 15);
}

export function sponsorTotals(rows: KeyValueRecord[]): KeyValueRecord[] {
  const seen = new Map<string, number>();
  rows.forEach((row) => {
    const sponsor = String(row.sponsor ?? "");
    if (!sponsor) return;
    seen.set(sponsor, Math.max(seen.get(sponsor) ?? 0, Number(row.sponsor_total ?? 0)));
  });
  return Array.from(seen.entries())
    .map(([sponsor, trial_count]) => ({ sponsor, trial_count }))
    .sort((a, b) => Number(b.trial_count) - Number(a.trial_count));
}

export function safetyMetrics(
  aeAggregates?: Record<string, unknown>
): { label: string; value: unknown; icon: string }[] {
  const kpis = (aeAggregates?.kpis as Record<string, unknown>) ?? {};
  return [
    { label: "Trials with AEs", value: kpis.trials_with_ae ?? 0, icon: "🧪" },
    { label: "AE Records", value: kpis.total_ae_records ?? 0, icon: "📋" },
    { label: "Unique AE Terms", value: kpis.unique_ae_terms ?? 0, icon: "🔬" },
    { label: "Organ Systems", value: kpis.unique_organ_systems ?? 0, icon: "🫀" },
    { label: "Total Subjects Affected", value: kpis.total_subjects_affected ?? 0, icon: "👥" },
  ];
}

export function parseTier(value: unknown): number {
  if (value == null) return 0;
  const str = String(value).trim().toUpperCase();
  if (!str || str === "NC" || str === "N/A" || str === "NOT COVERED") return 0;
  const numeric = Number(str);
  if (Number.isNaN(numeric)) return 0;
  return Math.min(numeric, 4);
}

export function tierFigure(rows: KeyValueRecord[]): { data: unknown[]; layout: unknown } {
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
          [0, "#9CA3AF"], [0.2, "#9CA3AF"],
          [0.2, "#2A9D8F"], [0.4, "#2A9D8F"],
          [0.4, "#2E86AB"], [0.6, "#2E86AB"],
          [0.6, "#F18F01"], [0.8, "#F18F01"],
          [0.8, "#E76F51"], [1, "#E76F51"],
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

export function reqFigure(rows: KeyValueRecord[], reqType: string): { data: unknown[]; layout: unknown } {
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
        colorscale: [[0, "#FFFFFF"], [1, "#2A9D8F"]],
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
