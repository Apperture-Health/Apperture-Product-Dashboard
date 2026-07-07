"use client";

import { useState } from "react";
import Image from "next/image";
import { AuthSession, FilterOptions, FilterState } from "@/lib/types";
import { hasAnyFilter, activeFilterSummary, getInitials } from "@/lib/transforms";
import { MultiCheckboxDropdown } from "@/components/ui/MultiCheckboxDropdown";
import { SidebarSelectField } from "@/components/ui/SidebarSelectField";
import { apiRequest } from "@/lib/api";

const CHIP_COLORS: Record<string, string> = {
  "Condition":    "#0F4C81",
  "Drug Class":   "#1D3557",
  "Sponsor":      "#2E86AB",
  "Phase":        "#2A9D8F",
  "Status":       "#F18F01",
  "Country":      "#E76F51",
  "Agency Class": "#457B9D",
  "Has Results":  "#6B7280",
};

const EXAMPLES = [
  "Phase 2 trials for NSCLC by AstraZeneca",
  "Completed breast cancer trials with posted results",
  "Recruiting AML trials from major pharma",
  "Merck's Phase 3 oncology pipeline",
];

function buildChips(extracted: Record<string, unknown>): Array<{ label: string; value: string }> {
  const chips: Array<{ label: string; value: string }> = [];
  if (typeof extracted.indication === "string") chips.push({ label: "Condition", value: extracted.indication });
  if (typeof extracted.atc_class === "string") chips.push({ label: "Drug Class", value: extracted.atc_class });
  if (Array.isArray(extracted.sponsors)) extracted.sponsors.forEach((v) => chips.push({ label: "Sponsor", value: String(v) }));
  if (Array.isArray(extracted.phases)) extracted.phases.forEach((v) => chips.push({ label: "Phase", value: String(v) }));
  if (Array.isArray(extracted.statuses)) extracted.statuses.forEach((v) => chips.push({ label: "Status", value: String(v) }));
  if (Array.isArray(extracted.countries)) extracted.countries.forEach((v) => chips.push({ label: "Country", value: String(v) }));
  if (Array.isArray(extracted.agency_class)) extracted.agency_class.forEach((v) => chips.push({ label: "Agency Class", value: String(v) }));
  if (typeof extracted.has_results === "boolean") chips.push({ label: "Has Results", value: extracted.has_results ? "Yes" : "No" });
  return chips;
}

type SidebarProps = {
  session: AuthSession;
  filters: FilterState;
  filterOptions: FilterOptions;
  filtersLoading: boolean;
  updateFilter: <K extends keyof FilterState>(key: K, value: FilterState[K]) => void;
  resetFilters: () => void;
  onLogout: () => void;
  onApplyFilters: (extracted: Record<string, unknown>) => void;
};

export function Sidebar({
  session,
  filters,
  filterOptions,
  filtersLoading,
  updateFilter,
  resetFilters,
  onLogout,
  onApplyFilters,
}: SidebarProps) {
  const indicationOptions = session.allowed_indications ?? filterOptions.indications;
  const atcClassOptions = session.allowed_atc_classes ?? filterOptions.atc_classes;
  const activeFilters = activeFilterSummary(filters);

  const [question, setQuestion] = useState("");
  const [extracted, setExtracted] = useState<Record<string, unknown> | null>(null);
  const [aiLoading, setAiLoading] = useState(false);

  async function runExtract(q: string) {
    if (!q.trim()) return;
    setAiLoading(true);
    setExtracted(null);
    try {
      const result = await apiRequest<{ extracted: Record<string, unknown> }>("/api/ai/extract-filters", {
        method: "POST",
        body: JSON.stringify({ question: q }),
      });
      setExtracted(result.extracted);
    } finally {
      setAiLoading(false);
    }
  }

  function handleApply() {
    if (!extracted) return;
    onApplyFilters(extracted);
    setExtracted(null);
    setQuestion("");
  }

  const chips = extracted ? buildChips(extracted) : [];

  return (
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
        <button className="user-signout-btn" onClick={onLogout} title="Sign out">⏻</button>
      </div>

      {/* ── Ask the Data ─────────────────────────────────────────────── */}
      <div className="ask-sidebar-section">
        <div className="ask-sidebar-label">💬 Ask the Data</div>
        <input
          className="ask-sidebar-input"
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && runExtract(question)}
          placeholder="e.g. Phase 2 NSCLC by AstraZeneca"
          disabled={aiLoading}
        />
        <button
          className="ask-sidebar-btn"
          onClick={() => runExtract(question)}
          disabled={!question.trim() || aiLoading}
        >
          {aiLoading ? "Extracting…" : "Ask ▶"}
        </button>

        {!extracted && !aiLoading && (
          <details className="ask-sidebar-examples-details">
            <summary className="ask-sidebar-examples-summary">Try an example</summary>
            <div className="ask-sidebar-examples">
              {EXAMPLES.map((ex) => (
                <button
                  key={ex}
                  className="ask-sidebar-example"
                  onClick={() => { setQuestion(ex); runExtract(ex); }}
                >
                  {ex}
                </button>
              ))}
            </div>
          </details>
        )}

        {extracted && (
          <div className="ask-sidebar-result">
            {typeof extracted.interpretation === "string" && (
              <div className="ask-sidebar-interpretation">
                <span className="ask-sidebar-interpreted-label">🎯 Interpreted as</span>
                {extracted.interpretation}
              </div>
            )}
            {chips.length > 0 ? (
              <div className="ask-sidebar-chips">
                {chips.map(({ label, value }) => (
                  <span
                    key={`${label}-${value}`}
                    className="ask-sidebar-chip"
                    style={{ background: CHIP_COLORS[label] ?? "#6B7280" }}
                  >
                    {label}: {value}
                  </span>
                ))}
              </div>
            ) : (
              <div className="ask-sidebar-no-match">No filters could be extracted. Try rephrasing.</div>
            )}
            <div className="ask-sidebar-actions">
              <button className="ask-sidebar-apply" onClick={handleApply} disabled={chips.length === 0}>
                ✅ Apply
              </button>
              <button className="ask-sidebar-dismiss" onClick={() => { setExtracted(null); setQuestion(""); }}>
                ✕ Dismiss
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ── Filters ──────────────────────────────────────────────────── */}
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
              updateFilter("has_results", value === "Has Results" ? true : value === "No Results" ? false : null)
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
            label="Drug Indication"
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
  );
}
