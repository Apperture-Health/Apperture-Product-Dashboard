"use client";

import { useState } from "react";
import { PHASE_COLOR_MAP, barFigure, groupedBarFigure, heatmapFigure, stackedBarFigure } from "@/lib/charts";
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

export function SponsorsPage({ filters, pageData }: PageProps) {
  const [subtab, setSubtab] = useState("counts");

  return (
    <div className="page-stack">
      {!hasAnyFilter(filters)
        ? filterRequired("Please select at least one filter in the sidebar (indication, drug class, sponsor, phase, etc.) to view the charts.")
        : (
          <>
            <SectionTabs
              items={[
                { key: "counts", label: "📊 Trial Counts" },
                { key: "phase", label: "📐 Phase Mix" },
                { key: "pro", label: "👤 PRO Adoption" },
                { key: "endpoints", label: "🎯 Endpoint Usage" },
              ]}
              active={subtab}
              onChange={setSubtab}
            />
            {subtab === "counts" ? (
              <TwoCol>
                <ChartTile title="Total Trials per Sponsor" figure={barFigure(toRecs(pageData?.trialCounts), "sponsor", "total_trials", true)} />
                <ChartTile
                  title="Active vs Completed by Sponsor"
                  figure={groupedBarFigure(
                    toRecs(pageData?.trialCounts),
                    "sponsor",
                    [
                      { key: "active_trials", label: "Active", color: "#2A9D8F" },
                      { key: "completed_trials", label: "Completed", color: "#0F4C81" },
                    ],
                    true,
                  )}
                />
              </TwoCol>
            ) : null}
            {subtab === "phase" ? (
              <ChartTile title="Phase Mix by Sponsor" figure={stackedBarFigure(toRecs(pageData?.phaseMix), "sponsor", "trial_count", "phase", PHASE_COLOR_MAP)} />
            ) : null}
            {subtab === "pro" ? (
              <>
                <ChartTile title="% Trials with Planned PROs by Sponsor" figure={barFigure(toRecs(pageData?.proAdoption), "sponsor", "pct_with_pro", true)} />
                <AgGridTable rows={toRecs(pageData?.proAdoption)} />
              </>
            ) : null}
            {subtab === "endpoints" ? (
              <>
                <ChartTile title="Endpoint Category Usage by Sponsor" figure={heatmapFigure(toRecs(pageData?.endpointUsage), "category", "sponsor", "trial_count")} />
                <AgGridTable rows={toRecs(pageData?.endpointUsage)} />
              </>
            ) : null}
          </>
        )}
    </div>
  );
}
