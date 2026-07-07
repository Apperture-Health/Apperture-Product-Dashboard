"use client";

import { useState } from "react";
import { barFigure, donutFigure, funnelFigure } from "@/lib/charts";
import { hasAnyFilter, proMetrics, sponsorTotals, topProRows } from "@/lib/transforms";
import { AgGridTable } from "@/components/ui/AgGridTable";
import { AiSummaryBlock } from "@/components/ui/AiSummaryBlock";
import { ChartTile } from "@/components/ui/ChartTile";
import { MetricRow } from "@/components/ui/MetricRow";
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

export function ProOverviewPage({ filters, pageData, pageSummaries, summaryLoading, requestSummary }: PageProps) {
  const [subtab, setSubtab] = useState("frequency");

  return (
    <div className="page-stack">
      <MetricRow items={proMetrics(toRecs(pageData?.proUsageRaw), toRecs(pageData?.reportedProFunnel))} />
      {!hasAnyFilter(filters)
        ? filterRequired("Please select at least one filter in the sidebar (indication, drug class, sponsor, phase, etc.) to view the charts.")
        : (
          <>
            <SectionTabs
              items={[
                { key: "frequency", label: "📊 Instrument Frequency" },
                { key: "funnel", label: "📋 Planned vs Reported" },
                { key: "sponsor", label: "🏢 By Sponsor" },
                { key: "phase", label: "📐 By Phase" },
              ]}
              active={subtab}
              onChange={setSubtab}
            />
            {subtab === "frequency" ? (
              <TwoCol>
                <ChartTile title="Top PRO Instruments (Total)" figure={barFigure(topProRows(toRecs(pageData?.proUsageRaw)), "instrument_name", "total", true)} />
                <ChartTile title="Instrument Share (Top 10)" figure={donutFigure(topProRows(toRecs(pageData?.proUsageRaw)).slice(0, 10), "instrument_name", "total")} />
              </TwoCol>
            ) : null}
            {subtab === "funnel" ? (() => {
              const funnelRows = toRecs(pageData?.reportedProFunnel);
              return funnelRows.some((row) => Number(row.trial_count ?? 0) > 0)
                ? <ChartTile title="Planned → Reported PRO Funnel" figure={funnelFigure(funnelRows, "stage", "trial_count")} />
                : <p style={{ color: "#6B7280", fontSize: 14 }}>No PRO endpoint data for the current filter scope.</p>;
            })() : null}
            {subtab === "sponsor" ? <ChartTile title="PRO Adoption by Sponsor" figure={barFigure(sponsorTotals(toRecs(pageData?.proBySponsor)), "sponsor", "trial_count", true)} /> : null}
            {subtab === "phase" ? <ChartTile title="Trials with Planned PROs by Phase" figure={barFigure(toRecs(pageData?.proByPhase), "phase", "pro_trials")} /> : null}
            <AgGridTable rows={topProRows(toRecs(pageData?.proUsageRaw))} />
            <AiSummaryBlock pageKey="pro-overview" summary={pageSummaries["pro-overview"]} loading={summaryLoading} onGenerate={() => requestSummary("pro-overview")} />
          </>
        )}
    </div>
  );
}
