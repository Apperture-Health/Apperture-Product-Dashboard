"use client";

import { useState } from "react";
import { areaFigure, barFigure } from "@/lib/charts";
import { hasAnyFilter, yearLabel } from "@/lib/transforms";
import { PAGE_META, MODULE_DESC } from "@/lib/constants";
import { PageMeta } from "@/lib/types";
import { AlertCallout } from "@/components/ui/AlertCallout";
import { ChartSkeleton } from "@/components/ui/ChartSkeleton";
import { ChartTile } from "@/components/ui/ChartTile";
import { MetricRow } from "@/components/ui/MetricRow";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { TwoCol } from "@/components/ui/TwoCol";
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

type HomePageProps = PageProps & {
  visibleLabels: string[];
  onNavigate: (key: string) => void;
};

export function HomePage({ filters, pageData, visibleLabels, onNavigate }: HomePageProps) {
  const kpis = (pageData?.kpis as Record<string, unknown>) ?? {};

  return (
    <div className="page-stack">
      <SectionHeader title="Database Coverage" subtitle="Total scope of the clinical trials dataset" />
      <MetricRow
        items={[
          { label: "Total Trials", value: kpis.total_trials, icon: "🧪" },
          { label: "Active Trials", value: kpis.active_trials, icon: "🔵" },
          { label: "Completed Trials", value: kpis.completed_trials, icon: "✅" },
          { label: "Trials with Results", value: kpis.trials_with_results, icon: "📋" },
          { label: "Unique Sponsors", value: kpis.unique_sponsors, icon: "🏢" },
          { label: "Unique Drugs", value: kpis.unique_drugs, icon: "💊" },
          { label: "Unique Conditions", value: kpis.unique_conditions, icon: "🔬" },
          { label: "Trials with PROs", value: kpis.trials_with_pros, icon: "👤" },
        ]}
      />
      {!hasAnyFilter(filters)
        ? filterRequired(
            "Please select at least one filter in the sidebar (indication, drug class, sponsor, phase, etc.) to view the charts."
          )
        : (
          <>
            <SectionHeader
              title="Landscape Overview"
              subtitle="Distribution of trials across phases, sponsors, conditions, and time"
            />
            <TwoCol>
              {!pageData?.trialsByPhase
                ? <ChartSkeleton />
                : toRecs(pageData.trialsByPhase).length
                  ? <ChartTile title="Trial Count by Phase" figure={barFigure(toRecs(pageData.trialsByPhase), "phase", "trial_count")} />
                  : noData("phase distribution")}
              {!pageData?.trialsOverTime
                ? <ChartSkeleton />
                : toRecs(pageData.trialsOverTime).length
                  ? <ChartTile title="Trials First Posted per Year" figure={areaFigure(toRecs(pageData.trialsOverTime).map((row) => ({ ...row, year: yearLabel(row.year) })), "year", "trial_count")} />
                  : noData("trial timeline")}
            </TwoCol>
            <TwoCol>
              {!pageData?.topSponsors
                ? <ChartSkeleton />
                : toRecs(pageData.topSponsors).length
                  ? <ChartTile title="Top Sponsors by Trial Count" figure={barFigure(toRecs(pageData.topSponsors).slice(0, 12), "sponsor", "trial_count", false)} />
                  : noData("sponsors")}
              {!pageData?.topConditions
                ? <ChartSkeleton />
                : toRecs(pageData.topConditions).length
                  ? <ChartTile title="Top MeSH Conditions" figure={barFigure(toRecs(pageData.topConditions).slice(0, 12), "condition", "trial_count", true)} />
                  : noData("conditions")}
            </TwoCol>
          </>
        )}
      <hr style={{ border: "none", borderTop: "1px solid #e5e7eb", margin: "8px 0 0" }} />
      <SectionHeader
        title="Explore Platform Modules"
        subtitle="Navigate to any analysis module using the tabs above or the shortcuts below"
      />
      <div className="module-grid">
        {PAGE_META.filter((p) => p.key !== "home" && visibleLabels.includes(p.label)).map((p) => {
          const [icon, ...rest] = p.label.split(" ");
          return (
            <button key={p.key} className="module-card" onClick={() => onNavigate(p.key)}>
              <div className="module-icon-wrap">{icon}</div>
              <div className="module-body">
                <div className="module-card-label">{p.title}</div>
                <div className="module-card-desc">{MODULE_DESC[p.key] ?? ""}</div>
              </div>
              <div className="module-arrow">›</div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
