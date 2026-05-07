"use client";

import { useState } from "react";
import { barFigure, heatmapFigure, treemapFigure } from "@/lib/charts";
import { hasAnyFilter } from "@/lib/transforms";
import { AgGridTable } from "@/components/ui/AgGridTable";
import { AiSummaryBlock } from "@/components/ui/AiSummaryBlock";
import { AlertCallout } from "@/components/ui/AlertCallout";
import { ChartTile } from "@/components/ui/ChartTile";
import { CsvButton } from "@/components/ui/CsvButton";
import { MetricRow } from "@/components/ui/MetricRow";
import { SectionHeader } from "@/components/ui/SectionHeader";
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

export function PipelinePage({ filters, pageData, pageSummaries, summaryLoading, requestSummary }: PageProps) {
  const [subtab, setSubtab] = useState("sponsor");
  const kpis = (pageData?.kpis as Record<string, unknown>) ?? {};

  return (
    <div className="page-stack">
      <AlertCallout tone="info" title="Pipeline Data Note">
        Pipeline data is sourced from `onco_pipeline_trials` and reflects investigational oncology assets.
      </AlertCallout>
      <MetricRow
        items={[
          { label: "Pipeline Trials", value: kpis.pipeline_trials, icon: "🔬" },
          { label: "Unique Assets", value: kpis.unique_assets, icon: "💊" },
          { label: "Active Sponsors", value: kpis.active_sponsors, icon: "🏢" },
          { label: "Indications Covered", value: kpis.indications_covered, icon: "🎯" },
          { label: "With Planned PROs", value: kpis.with_pros, icon: "👤" },
        ]}
      />
      {!hasAnyFilter(filters)
        ? filterRequired("Please select at least one filter in the sidebar (indication, drug class, sponsor, phase, etc.) to view the charts.")
        : (
          <>
            <SectionTabs
              items={[
                { key: "sponsor", label: "🏢 By Sponsor" },
                { key: "indication", label: "🎯 By Indication" },
                { key: "interventions", label: "💊 Interventions" },
                { key: "heatmap", label: "🗺️ Sponsor × Indication" },
                { key: "pro", label: "👤 PRO Usage" },
              ]}
              active={subtab}
              onChange={setSubtab}
            />
            {subtab === "sponsor" ? (
              <TwoCol>
                <ChartTile title="Pipeline Trials by Sponsor" figure={barFigure(toRecs(pageData?.bySponsor), "sponsor", "pipeline_trials", true)} />
                <ChartTile title="Unique Assets by Sponsor" figure={barFigure(toRecs(pageData?.bySponsor), "sponsor", "unique_assets", true)} />
              </TwoCol>
            ) : null}
            {subtab === "indication" ? (
              <TwoCol>
                <ChartTile title="Pipeline Trials by Indication" figure={barFigure(toRecs(pageData?.byIndication), "condition", "trial_count", true)} />
                <ChartTile title="Indication Treemap" figure={treemapFigure(toRecs(pageData?.byIndication), "condition", "trial_count")} />
              </TwoCol>
            ) : null}
            {subtab === "interventions" ? (
              <ChartTile title="Top Pipeline Interventions" figure={barFigure(toRecs(pageData?.topInterventions), "intervention", "trial_count", true)} />
            ) : null}
            {subtab === "heatmap" ? (
              <ChartTile title="Sponsor × Indication Pipeline Heatmap" figure={heatmapFigure(toRecs(pageData?.sponsorIndicationHeatmap), "condition", "sponsor", "trial_count")} />
            ) : null}
            {subtab === "pro" ? (
              <ChartTile title="Pipeline PRO Instrument Usage" figure={barFigure(toRecs(pageData?.proUsage), "instrument_name", "trial_count", true)} />
            ) : null}
            <SectionHeader title="Pipeline Trial Details" />
            <CsvButton rows={toRecs(pageData?.trialsTable)} filename="pipeline_trials.csv" />
            <AgGridTable rows={toRecs(pageData?.trialsTable)} />
            <AiSummaryBlock pageKey="pipeline" summary={pageSummaries.pipeline} loading={summaryLoading} onGenerate={() => requestSummary("pipeline")} />
          </>
        )}
    </div>
  );
}
