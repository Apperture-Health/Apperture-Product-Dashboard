"use client";

import { useState } from "react";
import { barFigure, donutFigure, funnelFigure, heatmapFigure } from "@/lib/charts";
import { hasAnyFilter } from "@/lib/transforms";
import { AgGridTable } from "@/components/ui/AgGridTable";
import { ChartTile } from "@/components/ui/ChartTile";
import { SectionTabs } from "@/components/ui/SectionTabs";
import { TwoCol } from "@/components/ui/TwoCol";
import { PageProps, toRecs } from "./types";

function filterRequired(message: string) {
  return (
    <div className="empty-state">
      <div className="empty-icon">🔎</div>
      <h3>Filter Required</h3>
      <p>{message}</p>
    </div>
  );
}

export function OutcomesPage({ filters, pageData }: PageProps) {
  const [subtab, setSubtab] = useState("categories");

  return (
    <div className="page-stack">
      {!hasAnyFilter(filters)
        ? filterRequired("Please select at least one filter in the sidebar (indication, drug class, sponsor, phase, etc.) to view the charts.")
        : (
          <>
            <SectionTabs
              items={[
                { key: "categories", label: "📊 Categories" },
                { key: "types", label: "📋 Outcome Types" },
                { key: "top", label: "🔢 Top Outcomes" },
                { key: "pro", label: "👤 PRO Funnel" },
              ]}
              active={subtab}
              onChange={setSubtab}
            />
            {subtab === "categories" ? (
              <TwoCol>
                <ChartTile title="Outcomes by Category" figure={barFigure(toRecs(pageData?.reportedOutcomeCategories), "category", "outcome_count", true)} />
                <ChartTile title="Trials per Category" figure={donutFigure(toRecs(pageData?.reportedOutcomeCategories), "category", "trial_count")} />
              </TwoCol>
            ) : null}
            {subtab === "types" ? <ChartTile title="Outcome Type × Category (Unique Trials)" figure={heatmapFigure(toRecs(pageData?.outcomeTypeCategoryHeatmap), "outcome_category", "outcome_type", "trial_count")} /> : null}
            {subtab === "top" ? (
              <>
                <ChartTile title="Top 10 Outcome Categories by Frequency" figure={barFigure(toRecs(pageData?.reportedOutcomeCategories).slice(0, 10), "category", "outcome_count", true)} />
                <AgGridTable rows={toRecs(pageData?.reportedOutcomeCategories)} />
              </>
            ) : null}
            {subtab === "pro" ? (() => {
              const funnelRows = toRecs(pageData?.reportedProFunnel);
              return funnelRows.some((row) => Number(row.trial_count ?? 0) > 0)
                ? <ChartTile title="Planned vs Reported PRO Funnel" figure={funnelFigure(funnelRows, "stage", "trial_count")} />
                : <p style={{ color: "#6B7280", fontSize: 14 }}>No PRO endpoint data for the current filter scope.</p>;
            })() : null}
          </>
        )}
    </div>
  );
}
