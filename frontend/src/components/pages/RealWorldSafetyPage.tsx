"use client";

import { barFigure, donutFigure, heatmapFigure, treemapFigure } from "@/lib/charts";
import { AgGridTable } from "@/components/ui/AgGridTable";
import { AlertCallout } from "@/components/ui/AlertCallout";
import { ChartSkeleton } from "@/components/ui/ChartSkeleton";
import { ChartTile } from "@/components/ui/ChartTile";
import { CsvButton } from "@/components/ui/CsvButton";
import { MetricRow } from "@/components/ui/MetricRow";
import { SectionTabs } from "@/components/ui/SectionTabs";
import { TwoCol } from "@/components/ui/TwoCol";
import { KeyValueRecord } from "@/lib/types";
import { useState } from "react";
import { PageProps, toRecs } from "./types";

function unpivot(
  pivotRows: KeyValueRecord[],
  indexCol: string,
  valueKey: string,
  xKey: string,
  yKey: string
): KeyValueRecord[] {
  if (!pivotRows.length) return [];
  const result: KeyValueRecord[] = [];
  pivotRows.forEach((row) => {
    const yVal = row[indexCol];
    Object.entries(row).forEach(([col, val]) => {
      if (col === indexCol) return;
      result.push({ [xKey]: col, [yKey]: yVal, [valueKey]: val ?? 0 });
    });
  });
  return result;
}

export function RealWorldSafetyPage({ pageData }: PageProps) {
  const [subtab, setSubtab] = useState("ae");

  if (pageData?.filterRequired || pageData === null) {
    return (
      <div className="empty-state">
        <div className="empty-icon">🔎</div>
        <h3>Filter Required</h3>
        <p>Select at least one filter in the sidebar to view FAERS charts and data.</p>
      </div>
    );
  }

  const brands = (pageData.brands as string[]) ?? [];
  const resolutionNote = pageData.resolutionNote as string | null;

  if (brands.length === 0) {
    return (
      <div className="empty-state">
        <div className="empty-icon">💊</div>
        <h3>No Drug Scope</h3>
        <p>
          {resolutionNote ??
            "No drugs could be resolved from the current filters. Select a Drug Class or Brand Name in the sidebar to scope FAERS data."}
        </p>
      </div>
    );
  }

  const kpis = (pageData.kpis as Record<string, number>) ?? {};

  return (
    <div className="page-stack">
      {resolutionNote && (
        <AlertCallout tone="info" title="Drug Resolution">
          {resolutionNote}
        </AlertCallout>
      )}

      <MetricRow
        items={[
          { label: "Total Reports", value: kpis.total_reports, icon: "📋" },
          { label: "Unique Reactions", value: kpis.unique_reactions, icon: "⚠️" },
          { label: "Serious Outcomes", value: kpis.serious_outcomes, icon: "🚨" },
          { label: "Unique Drugs", value: kpis.unique_drugs, icon: "💊" },
        ]}
      />

      <SectionTabs
        items={[
          { key: "ae", label: "⚠️ Adverse Events" },
          { key: "soc", label: "🫀 SOC" },
          { key: "outcomes", label: "📋 Outcomes" },
        ]}
        active={subtab}
        onChange={setSubtab}
      />

      {subtab === "ae" ? (
        !pageData.topReactions
          ? <ChartSkeleton />
          : (() => {
              const topReactions = toRecs(pageData.topReactions);
              const rxHeatmapRows = unpivot(toRecs(pageData.reactionHeatmap), "brand_name", "case_count", "pt", "brand_name");
              return topReactions.length === 0 ? (
                <p style={{ color: "#6B7280", fontSize: 14 }}>No reaction data found for the current filter scope.</p>
              ) : (
                <>
                  <TwoCol>
                    <ChartTile title="PT by Case Count" figure={barFigure(topReactions, "pt", "report_count", true)} />
                    {rxHeatmapRows.length > 0 ? (
                      <ChartTile
                        title="Top Drugs × Top AEs by Case Count"
                        figure={heatmapFigure(rxHeatmapRows, "pt", "brand_name", "case_count")}
                      />
                    ) : (
                      <div />
                    )}
                  </TwoCol>
                  <AgGridTable rows={topReactions} />
                  <CsvButton rows={topReactions} filename="top_reactions.csv" />
                </>
              );
            })()
      ) : null}

      {subtab === "soc" ? (
        !pageData.reactionsBySOC
          ? <ChartSkeleton />
          : (() => {
              const reactionsBySOC = toRecs(pageData.reactionsBySOC);
              return reactionsBySOC.length === 0 ? (
                <p style={{ color: "#6B7280", fontSize: 14 }}>No SOC data found for the current filter scope.</p>
              ) : (
                <>
                  <ChartTile title="SOC by Case Count" figure={treemapFigure(reactionsBySOC, "soc", "report_count")} />
                  <AgGridTable rows={reactionsBySOC} />
                  <CsvButton rows={reactionsBySOC} filename="reactions_by_soc.csv" />
                </>
              );
            })()
      ) : null}

      {subtab === "outcomes" ? (
        !pageData.outcomesDistribution
          ? <ChartSkeleton />
          : (() => {
              const outcomesDistribution = toRecs(pageData.outcomesDistribution);
              const outcHeatmapRows = unpivot(toRecs(pageData.outcomeHeatmap), "brand_name", "case_count", "outcome_label", "brand_name");
              return outcomesDistribution.length === 0 ? (
                <p style={{ color: "#6B7280", fontSize: 14 }}>No outcome data found for the current filter scope.</p>
              ) : (
                <>
                  <TwoCol>
                    <ChartTile
                      title="Outcome Distribution"
                      figure={donutFigure(outcomesDistribution, "outcome_label", "report_count")}
                    />
                    {outcHeatmapRows.length > 0 ? (
                      <ChartTile
                        title="Top Drugs × Outcomes by Case Count"
                        figure={heatmapFigure(outcHeatmapRows, "outcome_label", "brand_name", "case_count")}
                      />
                    ) : (
                      <div />
                    )}
                  </TwoCol>
                  <AgGridTable rows={outcomesDistribution} />
                  <CsvButton rows={outcomesDistribution} filename="outcomes.csv" />
                </>
              );
            })()
      ) : null}
    </div>
  );
}
