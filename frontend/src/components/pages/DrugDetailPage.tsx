"use client";

import { useState } from "react";
import { barFigure, heatmapFigure } from "@/lib/charts";
import { hasAnyFilter } from "@/lib/transforms";
import { AgGridTable } from "@/components/ui/AgGridTable";
import { AiSummaryBlock } from "@/components/ui/AiSummaryBlock";
import { AlertCallout } from "@/components/ui/AlertCallout";
import { ChartTile } from "@/components/ui/ChartTile";
import { CsvButton } from "@/components/ui/CsvButton";
import { MetricRow } from "@/components/ui/MetricRow";
import { SectionTabs } from "@/components/ui/SectionTabs";
import { PageProps, toRecs } from "./types";

function noData(context: string) {
  return (
    <AlertCallout tone="info" title="No Data">
      No data available for the {context}. Try adjusting your filters or broadening the selection.
    </AlertCallout>
  );
}

function filterRequired(message: string) {
  return (
    <div className="empty-state">
      <div className="empty-icon">🔎</div>
      <h3>Filter Required</h3>
      <p>{message}</p>
    </div>
  );
}

export function DrugDetailPage({ filters, pageData, pageSummaries, summaryLoading, requestSummary }: PageProps) {
  const [subtab, setSubtab] = useState("brands");
  const kpis = (pageData?.kpis as Record<string, unknown>) ?? {};

  if (Number(kpis.total_trials ?? 0) === 0) {
    return <div className="page-stack">{noData("trials for the current filters")}</div>;
  }

  return (
    <div className="page-stack">
      <MetricRow
        items={[
          { label: "Total Trials", value: kpis.total_trials, icon: "🧪" },
          { label: "Completed", value: kpis.completed_trials, icon: "✅" },
          { label: "With Results", value: kpis.trials_with_results, icon: "📋" },
          { label: "Brand Names", value: kpis.unique_drugs, icon: "💊" },
          { label: "Drug Classes", value: toRecs(pageData?.drugClasses).length, icon: "🏷️" },
        ]}
      />
      {!hasAnyFilter(filters)
        ? filterRequired("Please select at least one filter in the sidebar (indication, drug class, sponsor, phase, etc.) to view the charts.")
        : (
          <>
            <SectionTabs
              items={[
                { key: "brands", label: "💊 Brand Names / Drugs" },
                { key: "phase", label: "📊 Phase & Design" },
                { key: "classes", label: "🏷️ Drug Classes" },
                { key: "trials", label: "📄 Trial List" },
              ]}
              active={subtab}
              onChange={setSubtab}
            />
            {subtab === "brands"
              ? (toRecs(pageData?.brandCounts).length
                ? <ChartTile title="Brand Names — Trial Counts" figure={barFigure(toRecs(pageData?.brandCounts), "brand_name", "trial_count", true)} />
                : noData("brand names"))
              : null}
            {subtab === "phase"
              ? (toRecs(pageData?.phaseBrandHeatmap).length
                ? <ChartTile title="Phase × Brand Name — Trial Counts" figure={heatmapFigure(toRecs(pageData?.phaseBrandHeatmap), "brand_name", "phase", "trial_count")} />
                : noData("phase data"))
              : null}
            {subtab === "classes"
              ? (toRecs(pageData?.drugClasses).length
                ? <ChartTile title="ATC Drug Classes — Brands per Class" figure={barFigure(toRecs(pageData?.drugClasses), "drug_class", "brand_count", true)} />
                : noData("drug classes"))
              : null}
            {subtab === "trials"
              ? (toRecs(pageData?.trialsTable).length
                ? <>
                    <CsvButton rows={toRecs(pageData?.trialsTable)} filename="drug_detail_trials.csv" />
                    <AgGridTable rows={toRecs(pageData?.trialsTable)} />
                  </>
                : noData("trial list"))
              : null}
            <AiSummaryBlock pageKey="drug-detail" summary={pageSummaries["drug-detail"]} loading={summaryLoading} onGenerate={() => requestSummary("drug-detail")} />
          </>
        )}
    </div>
  );
}
