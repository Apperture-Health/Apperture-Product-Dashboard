"use client";

import { useState } from "react";
import { barFigure, funnelFigure, heatmapFigure } from "@/lib/charts";
import { hasAnyFilter } from "@/lib/transforms";
import { AgGridTable } from "@/components/ui/AgGridTable";
import { ChartTile } from "@/components/ui/ChartTile";
import { SectionTabs } from "@/components/ui/SectionTabs";
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

export function EndpointsPage({ filters, pageData }: PageProps) {
  const [subtab, setSubtab] = useState("types");

  return (
    <div className="page-stack">
      {!hasAnyFilter(filters)
        ? filterRequired("Please select at least one filter in the sidebar (indication, drug class, sponsor, phase, etc.) to view the charts.")
        : (
          <>
            <SectionTabs
              items={[
                { key: "types", label: "📊 Outcome Types" },
                { key: "top", label: "🔢 Top Endpoints" },
                { key: "pro", label: "👤 Planned PROs" },
                { key: "table", label: "📄 Full Table" },
              ]}
              active={subtab}
              onChange={setSubtab}
            />
            {subtab === "types" ? <ChartTile title="Outcome Type × Category (Unique Trials)" figure={heatmapFigure(toRecs(pageData?.designOutcomeTypeCategoryHeatmap), "outcome_category", "outcome_type", "trial_count")} /> : null}
            {subtab === "top" ? <ChartTile title="Top 10 Planned Endpoint Categories by Frequency" figure={barFigure(toRecs(pageData?.topDesignEndpoints), "outcome_category", "trial_count", true)} /> : null}
            {subtab === "pro" ? <ChartTile title="Planned vs Reported PRO Funnel" figure={funnelFigure(toRecs(pageData?.reportedProFunnel), "stage", "trial_count")} /> : null}
            {subtab === "table" ? <AgGridTable rows={toRecs(pageData?.designOutcomesTable)} /> : null}
          </>
        )}
    </div>
  );
}
