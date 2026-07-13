"use client";

import { useEffect } from "react";
import dynamic from "next/dynamic";

const Plot = dynamic(() => import("react-plotly.js"), { ssr: false });

// react-plotly.js measures its container width when the <Plot> first mounts.
// When a chart mounts during a streaming swap (its data chunk lands while the
// sub-tab / layout is still settling), it can capture a 0/stale width and draw a
// blank plot that only corrects on the next window resize. Nudging a resize once
// the DOM has laid out — via useResizeHandler, which listens for window resize —
// forces Plotly to re-measure and paint correctly on first appearance.
function nudgeResize() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event("resize"));
}

export function ChartTile({ title, figure }: { title: string; figure: { data: any[]; layout: any } }) {
  const plotHeight =
    typeof figure?.layout?.height === "number" && Number.isFinite(figure.layout.height)
      ? figure.layout.height
      : 380;
  const chartKey = `${title}-${figure?.data?.length ?? 0}-${plotHeight}`;

  // Re-fires on each fresh mount (chartKey changes when data arrives/changes).
  useEffect(() => {
    const raf = requestAnimationFrame(nudgeResize);
    return () => cancelAnimationFrame(raf);
  }, [chartKey]);

  return (
    <div className="chart-tile">
      <div className="chart-header">
        <div className="chart-title">{title}</div>
      </div>
      <div className="chart-canvas" style={{ height: plotHeight }}>
        <Plot
          key={chartKey}
          data={figure.data}
          layout={{ ...figure.layout, autosize: true }}
          config={{
            displayModeBar: "hover",
            responsive: true,
            displaylogo: false,
            modeBarButtonsToRemove: ["select2d", "lasso2d", "autoScale2d"],
          }}
          useResizeHandler
          onInitialized={nudgeResize}
          style={{ width: "100%", height: `${plotHeight}px` }}
        />
      </div>
    </div>
  );
}
