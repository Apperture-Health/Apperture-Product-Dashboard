"use client";

import { useState } from "react";
import { hasAnyFilter, metricValue, reqFigure, tierFigure } from "@/lib/transforms";
import { AiSummaryBlock } from "@/components/ui/AiSummaryBlock";
import { ChartSkeleton } from "@/components/ui/ChartSkeleton";
import { ChartTile } from "@/components/ui/ChartTile";
import { MetricRow } from "@/components/ui/MetricRow";
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

type MarketAccessPageProps = PageProps & {
  marketAccessYear: number;
  setMarketAccessYear: (year: number) => void;
};

export function MarketAccessPage({
  filters,
  pageData,
  pageSummaries,
  summaryLoading,
  requestSummary,
  marketAccessYear,
  setMarketAccessYear,
}: MarketAccessPageProps) {
  const [subtab, setSubtab] = useState("tiers");
  const [reqType, setReqType] = useState("PA");
  const kpis = (pageData?.kpis as Record<string, unknown>) ?? {};

  return (
    <div className="page-stack">
      <div className="inline-controls">
        <button className={marketAccessYear === 2025 ? "pill active" : "pill"} onClick={() => setMarketAccessYear(2025)}>2025</button>
        <button className={marketAccessYear === 2026 ? "pill active" : "pill"} onClick={() => setMarketAccessYear(2026)}>2026</button>
      </div>
      <MetricRow
        items={[
          { label: "Drugs Tracked", value: kpis.total_drugs, icon: "💊" },
          { label: "With Prior Auth (PA)", value: `${metricValue(kpis.pa_pct)}%`, icon: "📋" },
          { label: "With Qty Limits (QL)", value: `${metricValue(kpis.ql_pct)}%`, icon: "⚖️" },
          { label: "With Specialty (SP)", value: `${metricValue(kpis.sp_pct)}%`, icon: "🏥" },
          { label: "Payers Covered", value: "6", icon: "🏛️" },
        ]}
      />
      {!hasAnyFilter(filters)
        ? filterRequired("Select at least one filter in the sidebar to view market access charts.")
        : (
          <>
            <SectionTabs
              items={[
                { key: "tiers", label: "🎨 Formulary Tiers" },
                { key: "requirements", label: "✅ Access Requirements" },
              ]}
              active={subtab}
              onChange={setSubtab}
            />
            {subtab === "tiers" ? (
              !pageData?.tierGrid
                ? <ChartSkeleton />
                : <ChartTile title={`Formulary Tiers by Drug & Payer (${marketAccessYear})`} figure={tierFigure(toRecs(pageData?.tierGrid))} />
            ) : null}
            {subtab === "requirements" ? (
              !pageData?.requirementGrid
                ? <ChartSkeleton />
                : <>
                    <div className="inline-controls">
                      {["PA", "QL", "SP"].map((option) => (
                        <button key={option} className={reqType === option ? "pill active" : "pill"} onClick={() => setReqType(option)}>
                          {option}
                        </button>
                      ))}
                    </div>
                    <ChartTile title={`${reqType} Requirement by Drug & Payer (${marketAccessYear})`} figure={reqFigure(toRecs(pageData?.requirementGrid), reqType)} />
                  </>
            ) : null}
            <AiSummaryBlock
              pageKey="market-access"
              summary={pageSummaries["market-access"]}
              loading={summaryLoading}
              onGenerate={() => requestSummary("market-access", marketAccessYear)}
            />
          </>
        )}
    </div>
  );
}
