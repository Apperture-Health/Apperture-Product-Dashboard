"use client";

import { useEffect, useRef, useState } from "react";
import { apiRequest, pagePayload } from "@/lib/api";
import { barFigure, donutFigure, heatmapFigure, treemapFigure } from "@/lib/charts";
import { hasAnyFilter, makeCacheKey } from "@/lib/transforms";
import { AgGridTable } from "@/components/ui/AgGridTable";
import { AiSummaryBlock } from "@/components/ui/AiSummaryBlock";
import { AlertCallout } from "@/components/ui/AlertCallout";
import { ChartSkeleton } from "@/components/ui/ChartSkeleton";
import { ChartTile } from "@/components/ui/ChartTile";
import { CsvButton } from "@/components/ui/CsvButton";
import { MetricRow } from "@/components/ui/MetricRow";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { SectionTabs } from "@/components/ui/SectionTabs";
import { TableSkeleton } from "@/components/ui/TableSkeleton";
import { TwoCol } from "@/components/ui/TwoCol";
import { PageProps, toRecs } from "./types";

const PIPELINE_CLASSES = ["novel drug", "new indication", "new population"] as const;

function filterRequired(message: string) {
  return (
    <div className="empty-state">
      <div className="empty-icon">🔎</div>
      <h3>Filter Required</h3>
      <p>{message}</p>
    </div>
  );
}

export function PipelinePage({ filters, pageData, pageSummaries, summaryLoading, requestSummary, fullyLoaded }: PageProps) {
  const [subtab, setSubtab] = useState("sponsor");
  const [selectedClasses, setSelectedClasses] = useState<string[]>([]);
  const [localData, setLocalData] = useState<Record<string, unknown> | null>(null);
  const classFilterCache = useRef<Map<string, Record<string, unknown>>>(new Map());

  // Re-fetch whenever pipeline_classes change (parent pageData covers the initial load)
  useEffect(() => {
    const cacheKey = makeCacheKey("pipeline", filters, { pipeline_classes: selectedClasses });
    const cached = classFilterCache.current.get(cacheKey);
    if (cached) {
      setLocalData(cached);
      return;
    }

    let aborted = false;
    const controller = new AbortController();

    apiRequest<Record<string, unknown>>("/api/pages/pipeline", {
      method: "POST",
      body: pagePayload(filters, { pipeline_classes: selectedClasses }),
      signal: controller.signal,
    })
      .then((result) => {
        if (aborted) return;
        classFilterCache.current.set(cacheKey, result);
        setLocalData(result);
      })
      .catch((error) => {
        if (aborted || error.name === "AbortError") return;
        /* silently fall back to parent pageData */
      });
    return () => {
      aborted = true;
      controller.abort();
    };
  }, [filters, selectedClasses]);

  const data = localData ?? pageData;
  const kpis = (data?.kpis as Record<string, unknown>) ?? {};
  const hasFilter = hasAnyFilter(filters) || selectedClasses.length > 0;

  // When localData is present (class-filter sync refetch), all chart keys exist immediately.
  // When streaming via pageData, check key presence to decide chart vs skeleton.
  const chartsReady = (key: string) => localData !== null || !!(pageData?.[key]);

  function toggleClass(cls: string) {
    setSelectedClasses((prev) =>
      prev.includes(cls) ? prev.filter((c) => c !== cls) : [...prev, cls]
    );
  }

  return (
    <div className="page-stack">
      <AlertCallout tone="info" title="Pipeline Data Note">
        Pipeline data is sourced from <code>pipeline_trials</code> and reflects investigational assets.
      </AlertCallout>

      {/* Inline pipeline class filter */}
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginBottom: 8 }}>
        <span style={{ fontSize: 13, color: "#6B7280", fontWeight: 500 }}>Pipeline Class:</span>
        {PIPELINE_CLASSES.map((cls) => {
          const active = selectedClasses.includes(cls);
          return (
            <button
              key={cls}
              onClick={() => toggleClass(cls)}
              style={{
                padding: "4px 12px",
                borderRadius: 8,
                border: `1.5px solid ${active ? "#0F4C81" : "#D1D5DB"}`,
                background: active ? "#0F4C81" : "white",
                color: active ? "white" : "#1A1A2E",
                fontSize: 13,
                fontWeight: active ? 600 : 400,
                cursor: "pointer",
              }}
            >
              {cls}
            </button>
          );
        })}
        {selectedClasses.length > 0 && (
          <button
            onClick={() => setSelectedClasses([])}
            style={{ fontSize: 12, color: "#6B7280", background: "none", border: "none", cursor: "pointer" }}
          >
            ✕ Clear
          </button>
        )}
      </div>

      <MetricRow
        items={[
          { label: "Pipeline Trials", value: kpis.pipeline_trials, icon: "🔬" },
          { label: "Unique Assets", value: kpis.unique_assets, icon: "💊" },
          { label: "Active Sponsors", value: kpis.active_sponsors, icon: "🏢" },
          { label: "Conditions Covered", value: kpis.indications_covered, icon: "🎯" },
          { label: "With Planned PROs", value: kpis.with_pros, icon: "👤" },
        ]}
      />
      {!hasFilter
        ? filterRequired("Please select at least one filter in the sidebar (indication, drug class, sponsor, phase, etc.) or a pipeline class above to view the charts.")
        : (
          <>
            <SectionTabs
              items={[
                { key: "sponsor", label: "🏢 By Sponsor" },
                { key: "condition", label: "🎯 By Condition" },
                { key: "interventions", label: "💊 Interventions" },
                { key: "heatmap", label: "🗺️ Sponsor × Condition" },
                { key: "pro", label: "👤 PRO Usage" },
                { key: "class", label: "📋 By Class" },
              ]}
              active={subtab}
              onChange={setSubtab}
            />
            {subtab === "sponsor" ? (
              chartsReady("bySponsor")
                ? <TwoCol>
                    <ChartTile title="Pipeline Trials by Sponsor" figure={barFigure(toRecs(data?.bySponsor), "sponsor", "pipeline_trials", true)} />
                    <ChartTile title="Unique Assets by Sponsor" figure={barFigure(toRecs(data?.bySponsor), "sponsor", "unique_assets", true)} />
                  </TwoCol>
                : <ChartSkeleton />
            ) : null}
            {subtab === "condition" ? (
              chartsReady("byIndication")
                ? <TwoCol>
                    <ChartTile title="Pipeline Trials by Condition" figure={barFigure(toRecs(data?.byIndication), "condition", "trial_count", true)} />
                    <ChartTile title="Condition Treemap" figure={treemapFigure(toRecs(data?.byIndication), "condition", "trial_count")} />
                  </TwoCol>
                : <ChartSkeleton />
            ) : null}
            {subtab === "interventions" ? (
              chartsReady("topInterventions")
                ? <ChartTile title="Top Pipeline Interventions" figure={barFigure(toRecs(data?.topInterventions), "intervention", "trial_count", true)} />
                : <ChartSkeleton />
            ) : null}
            {subtab === "heatmap" ? (
              chartsReady("sponsorIndicationHeatmap")
                ? <ChartTile title="Sponsor × Condition Pipeline Heatmap" figure={heatmapFigure(toRecs(data?.sponsorIndicationHeatmap), "condition", "sponsor", "trial_count")} />
                : <ChartSkeleton />
            ) : null}
            {subtab === "pro" ? (
              chartsReady("proUsage")
                ? <ChartTile title="Pipeline PRO Instrument Usage" figure={barFigure(toRecs(data?.proUsage), "instrument_name", "trial_count", true)} />
                : <ChartSkeleton />
            ) : null}
            {subtab === "class" ? (
              chartsReady("pipelineByClass")
                ? <TwoCol>
                    <ChartTile title="Pipeline Trials by Class" figure={donutFigure(toRecs(data?.pipelineByClass), "pipeline_class", "trial_count")} />
                    <ChartTile title="Trial Count by Class" figure={barFigure(toRecs(data?.pipelineByClass), "pipeline_class", "trial_count", true)} />
                  </TwoCol>
                : <ChartSkeleton />
            ) : null}
            <SectionHeader title="Pipeline Trial Details" />
            {(localData !== null || (fullyLoaded ?? false))
              ? <>
                  <CsvButton rows={toRecs(data?.trialsTable)} filename="pipeline_trials.csv" />
                  <AgGridTable rows={toRecs(data?.trialsTable)} />
                </>
              : <TableSkeleton rows={8} />
            }
            <AiSummaryBlock pageKey="pipeline" summary={pageSummaries.pipeline} loading={summaryLoading} onGenerate={() => requestSummary("pipeline")} />
          </>
        )}
    </div>
  );
}
