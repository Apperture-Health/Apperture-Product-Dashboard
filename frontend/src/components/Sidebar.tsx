"use client";

import Image from "next/image";
import { AuthSession, FilterOptions, FilterState } from "@/lib/types";
import { hasAnyFilter, activeFilterSummary, getInitials } from "@/lib/transforms";
import { MultiCheckboxDropdown } from "@/components/ui/MultiCheckboxDropdown";
import { SidebarSelectField } from "@/components/ui/SidebarSelectField";

type SidebarProps = {
  session: AuthSession;
  filters: FilterState;
  filterOptions: FilterOptions;
  filtersLoading: boolean;
  updateFilter: <K extends keyof FilterState>(key: K, value: FilterState[K]) => void;
  resetFilters: () => void;
  onLogout: () => void;
};

export function Sidebar({
  session,
  filters,
  filterOptions,
  filtersLoading,
  updateFilter,
  resetFilters,
  onLogout,
}: SidebarProps) {
  const indicationOptions = session.allowed_indications ?? filterOptions.indications;
  const atcClassOptions = session.allowed_atc_classes ?? filterOptions.atc_classes;
  const activeFilters = activeFilterSummary(filters);

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
  );
}
