"use client";

import { useState } from "react";
import { barFigure, donutFigure } from "@/lib/charts";
import { groupBy, hasAnyFilter } from "@/lib/transforms";
import { AgGridTable } from "@/components/ui/AgGridTable";
import { ChartSkeleton } from "@/components/ui/ChartSkeleton";
import { ChartTile } from "@/components/ui/ChartTile";
import { SectionTabs } from "@/components/ui/SectionTabs";
import { TableSkeleton } from "@/components/ui/TableSkeleton";
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

export function TrialGroupsPage({ filters, pageData }: PageProps) {
  const [subtab, setSubtab] = useState("design");
  const ready = (key: string) => pageData?.[key] !== undefined;

  return (
    <div className="page-stack">
      {!hasAnyFilter(filters)
        ? filterRequired("Please select at least one filter in the sidebar (indication, drug class, sponsor, phase, etc.) to view the charts.")
        : (
          <>
            <SectionTabs
              items={[
                { key: "design", label: "📐 Design Groups" },
                { key: "result", label: "📋 Result Groups" },
                { key: "distribution", label: "📊 Groups per Trial" },
              ]}
              active={subtab}
              onChange={setSubtab}
            />
            {subtab === "design" ? (
              ready("designGroups") ? (
                <>
                  <TwoCol>
                    <ChartTile title="Group Type Distribution" figure={donutFigure(groupBy(toRecs(pageData?.designGroups), "group_type", "count"), "group_type", "count")} />
                    <ChartTile title="Top Interventions in Groups" figure={barFigure(groupBy(toRecs(pageData?.designGroups), "intervention_name", "group_count"), "intervention_name", "group_count", true)} />
                  </TwoCol>
                  <AgGridTable rows={toRecs(pageData?.designGroups)} />
                </>
              ) : <ChartSkeleton />
            ) : null}
            {subtab === "result" ? (
              ready("resultGroups")
                ? <AgGridTable rows={toRecs(pageData?.resultGroups)} />
                : <TableSkeleton rows={8} />
            ) : null}
            {subtab === "distribution" ? (
              ready("groupsPerTrialDistribution")
                ? <ChartTile title="Distribution: Design Groups per Trial" figure={barFigure(toRecs(pageData?.groupsPerTrialDistribution), "groups_per_trial", "trial_count")} />
                : <ChartSkeleton />
            ) : null}
          </>
        )}
    </div>
  );
}
