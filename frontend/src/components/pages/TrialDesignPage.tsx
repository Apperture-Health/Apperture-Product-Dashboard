"use client";

import { useState } from "react";
import { barFigure, donutFigure } from "@/lib/charts";
import { ageRows, groupBy, hasAnyFilter } from "@/lib/transforms";
import { ChartSkeleton } from "@/components/ui/ChartSkeleton";
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

export function TrialDesignPage({ filters, pageData }: PageProps) {
  const [subtab, setSubtab] = useState("overview");
  const ready = (key: string) => pageData?.[key] !== undefined;

  return (
    <div className="page-stack">
      {!hasAnyFilter(filters)
        ? filterRequired("Please select at least one filter in the sidebar (indication, drug class, sponsor, phase, etc.) to view the charts.")
        : (
          <>
            <SectionTabs items={[{ key: "overview", label: "Overview" }]} active={subtab} onChange={setSubtab} />
            {ready("designMetrics") ? (
              <TwoCol>
                <ChartTile title="Allocation Method" figure={donutFigure(groupBy(toRecs(pageData?.designMetrics), "allocation", "trial_count"), "allocation", "trial_count")} />
                <ChartTile title="Intervention Model" figure={barFigure(groupBy(toRecs(pageData?.designMetrics), "intervention_model", "trial_count"), "intervention_model", "trial_count", true)} />
              </TwoCol>
            ) : <ChartSkeleton />}
            {ready("armsDistribution")
              ? <ChartTile title="Number of Arms / Groups per Trial" figure={barFigure(toRecs(pageData?.armsDistribution), "number_of_arms", "trial_count")} />
              : <ChartSkeleton />}
            {ready("eligibilityDistribution") ? (
              <TwoCol>
                <ChartTile title="Gender Eligibility" figure={donutFigure(groupBy(toRecs(pageData?.eligibilityDistribution), "gender", "trial_count"), "gender", "trial_count")} />
                <ChartTile title="Eligible Age Groups" figure={barFigure(ageRows(toRecs(pageData?.eligibilityDistribution)), "Age Group", "trial_count")} />
              </TwoCol>
            ) : <ChartSkeleton />}
          </>
        )}
    </div>
  );
}
