"use client";

export function ChartSkeleton({ height = 380 }: { height?: number }) {
  return (
    <div
      className="chart-tile skeleton-block skeleton-chart"
      style={{ minHeight: height }}
      aria-busy="true"
      aria-label="Chart loading"
    />
  );
}
