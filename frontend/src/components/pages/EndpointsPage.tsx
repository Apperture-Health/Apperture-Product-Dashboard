"use client";

import { useState } from "react";
import { barFigure, funnelFigure, heatmapFigure } from "@/lib/charts";
import { hasAnyFilter } from "@/lib/transforms";
import { AgGridTable } from "@/components/ui/AgGridTable";
import { ChartSkeleton } from "@/components/ui/ChartSkeleton";
import { ChartTile } from "@/components/ui/ChartTile";
import { SectionTabs } from "@/components/ui/SectionTabs";
import { TableSkeleton } from "@/components/ui/TableSkeleton";
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
  const ready = (key: string) => pageData?.[key] !== undefined;

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
            {subtab === "types" ? (
              ready("designOutcomeTypeCategoryHeatmap")
                ? <ChartTile title="Outcome Type × Category (Unique Trials)" figure={heatmapFigure(toRecs(pageData?.designOutcomeTypeCategoryHeatmap), "outcome_category", "outcome_type", "trial_count")} />
                : <ChartSkeleton />
            ) : null}
            {subtab === "top" ? (
              ready("topDesignEndpoints")
                ? <ChartTile title="Top 10 Planned Endpoint Categories by Frequency" figure={barFigure(toRecs(pageData?.topDesignEndpoints), "outcome_category", "trial_count", true)} />
                : <ChartSkeleton />
            ) : null}
            {subtab === "pro" ? (
              !ready("reportedProFunnel") ? <ChartSkeleton /> : (() => {
                const funnelRows = toRecs(pageData?.reportedProFunnel);
                return funnelRows.some((row) => Number(row.trial_count ?? 0) > 0)
                  ? <ChartTile title="Planned vs Reported PRO Funnel" figure={funnelFigure(funnelRows, "stage", "trial_count")} />
                  : <p style={{ color: "#6B7280", fontSize: 14 }}>No PRO endpoint data for the current filter scope.</p>;
              })()
            ) : null}
            {subtab === "table" ? (
              ready("designOutcomesTable")
                ? <AgGridTable rows={toRecs(pageData?.designOutcomesTable)} />
                : <TableSkeleton rows={8} />
            ) : null}
          </>
        )}
    </div>
  );
}
