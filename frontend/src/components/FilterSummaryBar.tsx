"use client";

import { CHIP_CLASS } from "@/lib/constants";

export function FilterSummaryBar({ active }: { active: Record<string, string> }) {
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
