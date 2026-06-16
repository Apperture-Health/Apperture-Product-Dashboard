"use client";

import { useState } from "react";
import { barFigure, multiLineFigure } from "@/lib/charts";
import { hasAnyFilter, metricValue, yearLabel } from "@/lib/transforms";
import { AgGridTable } from "@/components/ui/AgGridTable";
import { AiSummaryBlock } from "@/components/ui/AiSummaryBlock";
import { ChartSkeleton } from "@/components/ui/ChartSkeleton";
import { ChartTile } from "@/components/ui/ChartTile";
import { MetricRow } from "@/components/ui/MetricRow";
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

export function DrugPricingPage({ filters, pageData, pageSummaries, summaryLoading, requestSummary, fullyLoaded }: PageProps) {
  const [subtab, setSubtab] = useState("cost");
  const kpis = (pageData?.kpis as Record<string, unknown>) ?? {};

  return (
    <div className="page-stack">
      <MetricRow
        items={[
          { label: "Unique Drugs", value: kpis.unique_drugs, icon: "💊" },
          { label: "Dosage Forms", value: kpis.dosage_forms, icon: "🧪" },
          { label: "Unique Diseases", value: kpis.unique_diseases, icon: "🔬" },
          {
            label: `Avg Annual Cost (${String(kpis.latest_quarter ?? "—")})`,
            value: kpis.latest_avg_cost ? `$${Number(kpis.latest_avg_cost).toLocaleString()}` : "—",
            icon: "💰",
          },
        ]}
      />
      {!hasAnyFilter(filters)
        ? filterRequired("Select at least one filter in the sidebar to view pricing charts and data.")
        : (
          <>
            <SectionTabs
              items={[
                { key: "cost", label: "📈 Cost Over Time" },
                { key: "class", label: "🏷️ By Drug Class" },
                { key: "wac", label: "💲 WAC Price History" },
                { key: "raw", label: "📄 Raw Data" },
              ]}
              active={subtab}
              onChange={setSubtab}
            />
            {subtab === "cost" ? (
              !pageData?.annualCostPerBrandOverTime
                ? <ChartSkeleton />
                : <ChartTile
                    title="Annual Cost Over Time per Drug"
                    figure={multiLineFigure(
                      toRecs(pageData?.annualCostPerBrandOverTime).map((row) => ({ ...row, quarter_start: yearLabel(row.quarter_start) })),
                      "quarter_start", "total_cost", "brand_name",
                    )}
                  />
            ) : null}
            {subtab === "class" ? (
              !pageData?.annualCostByDrugClass
                ? <ChartSkeleton />
                : <ChartTile title="Avg Latest Annual Cost by Drug Class" figure={barFigure(toRecs(pageData?.annualCostByDrugClass), "drug_class", "avg_cost", true)} />
            ) : null}
            {subtab === "wac" ? (
              !pageData?.wacPriceHistory
                ? <ChartSkeleton />
                : <ChartTile
                    title="WAC Unit Price History"
                    figure={multiLineFigure(
                      toRecs(pageData?.wacPriceHistory).map((row) => ({ ...row, wac_unit_effective_date: yearLabel(row.wac_unit_effective_date) })),
                      "wac_unit_effective_date", "wac_unit_price", "brand_name",
                    )}
                  />
            ) : null}
            {subtab === "raw" ? (
              !(fullyLoaded ?? false)
                ? <TableSkeleton rows={8} />
                : <AgGridTable rows={toRecs(pageData?.rawPricing)} />
            ) : null}
            <AiSummaryBlock pageKey="drug-pricing" summary={pageSummaries["drug-pricing"]} loading={summaryLoading} onGenerate={() => requestSummary("drug-pricing")} />
          </>
        )}
    </div>
  );
}
