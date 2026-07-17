"use client";

import { metricValue } from "@/lib/transforms";

export function MetricRow({ items }: { items: { label: string; value: unknown; icon: string }[] }) {
  return (
    <div className="metric-grid">
      {items.map((item) => (
        <div key={item.label} className="metric-card">
          <div className="metric-icon">{item.icon}</div>
          <div className="metric-label">{item.label}</div>
          <div className="metric-value">{metricValue(item.value)}</div>
        </div>
      ))}
    </div>
  );
}
