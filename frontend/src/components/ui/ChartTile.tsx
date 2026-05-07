"use client";

import dynamic from "next/dynamic";

const Plot = dynamic(() => import("react-plotly.js"), { ssr: false });

export function ChartTile({ title, figure }: { title: string; figure: { data: any[]; layout: any } }) {
  const plotHeight =
    typeof figure?.layout?.height === "number" && Number.isFinite(figure.layout.height)
      ? figure.layout.height
      : 380;
  const chartKey = `${title}-${figure?.data?.length ?? 0}-${plotHeight}`;

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
          style={{ width: "100%", height: `${plotHeight}px` }}
        />
      </div>
    </div>
  );
}
