"use client";

import { useState } from "react";
import { barFigure, treemapFigure } from "@/lib/charts";
import { hasAnyFilter } from "@/lib/transforms";
import { apiRequest, pagePayload } from "@/lib/api";
import { FilterState, KeyValueRecord } from "@/lib/types";
import { AgGridTable } from "@/components/ui/AgGridTable";
import { AlertCallout } from "@/components/ui/AlertCallout";
import { ChartTile } from "@/components/ui/ChartTile";
import { LoadingScreen } from "@/components/ui/LoadingScreen";
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

type SafetyPageProps = PageProps & {
  updateFilter: <K extends keyof FilterState>(key: K, value: FilterState[K]) => void;
};

export function SafetyPage({ filters, pageData, updateFilter }: SafetyPageProps) {
  const [subtab, setSubtab] = useState("terms");
  const [organFilter, setOrganFilter] = useState("");
  const [termFilter, setTermFilter] = useState("");
  const [safetyDetail, setSafetyDetail] = useState<KeyValueRecord[]>([]);
  const [detailLoading, setDetailLoading] = useState(false);

  const aeAggregates = pageData?.aeAggregates as Record<string, unknown> | undefined;

  async function loadDetail() {
    setDetailLoading(true);
    try {
      const result = await apiRequest<{ detail: KeyValueRecord[] }>("/api/pages/safety/detail", {
        method: "POST",
        body: pagePayload(filters, {
          organ_system: organFilter || null,
          ae_term: termFilter || null,
        }),
      });
      setSafetyDetail(result.detail);
    } finally {
      setDetailLoading(false);
    }
  }

  return (
    <div className="page-stack">
      <AlertCallout tone="warning" title="Safety Interpretation Note">
        Adverse event frequencies reflect reporting from individual trials, which vary in design, population, duration, and follow-up.
      </AlertCallout>
      {!hasAnyFilter(filters)
        ? filterRequired("Please select at least one filter in the sidebar (indication, drug class, sponsor, phase, etc.) to view the charts.")
        : (
          <>
            <div className="inline-controls">
              <input
                value={organFilter}
                onChange={(event) => {
                  setOrganFilter(event.target.value);
                  updateFilter("ae_organ_system", event.target.value ? [event.target.value] : []);
                }}
                placeholder="Filter by Organ System (optional)"
              />
              <input
                value={termFilter}
                onChange={(event) => {
                  setTermFilter(event.target.value);
                  updateFilter("ae_term", event.target.value ? [event.target.value] : []);
                }}
                placeholder="Filter by AE Term (optional)"
              />
            </div>
            <SectionTabs
              items={[
                { key: "terms", label: "🔢 Top AE Terms" },
                { key: "organ", label: "🫀 Organ Systems" },
                { key: "drug", label: "💊 By Drug" },
                { key: "detail", label: "📄 Detail Table" },
              ]}
              active={subtab}
              onChange={setSubtab}
            />
            {subtab === "terms" ? (
              <>
                <TwoCol>
                  <ChartTile title="Top AE Terms by Trial Count" figure={barFigure(toRecs((aeAggregates as any)?.topAe).slice(0, 15), "adverse_event_term", "trial_count", true)} />
                  <ChartTile title="Top AE Terms by Subjects Affected" figure={barFigure(toRecs((aeAggregates as any)?.topAe).slice(0, 15), "adverse_event_term", "total_affected", true)} />
                </TwoCol>
                <AgGridTable rows={toRecs((aeAggregates as any)?.topAe)} />
              </>
            ) : null}
            {subtab === "organ" ? (
              <TwoCol>
                <ChartTile title="Top 10 Organ Systems by Trial Count" figure={barFigure(toRecs((aeAggregates as any)?.organSystems).slice(0, 10), "organ_system", "trial_count", true)} />
                <ChartTile title="Top 10 Organ Systems by Subjects Affected" figure={treemapFigure(toRecs((aeAggregates as any)?.organSystems).slice(0, 10), "organ_system", "total_affected")} />
              </TwoCol>
            ) : null}
            {subtab === "drug" ? (
              <TwoCol>
                <ChartTile title="AE Trials by Drug" figure={barFigure(toRecs(pageData?.aeByDrug), "brand_name", "trial_count", true)} />
                <ChartTile title="Unique AE Terms per Drug" figure={barFigure(toRecs(pageData?.aeByDrug), "brand_name", "unique_terms", true)} />
              </TwoCol>
            ) : null}
            {subtab === "detail" ? (
              <>
                <button className="action-button" onClick={loadDetail}>Load Detail Table</button>
                {detailLoading ? <LoadingScreen message="Loading AE detail..." compact /> : null}
                {safetyDetail.length ? <AgGridTable rows={safetyDetail} /> : null}
              </>
            ) : null}
          </>
        )}
    </div>
  );
}
