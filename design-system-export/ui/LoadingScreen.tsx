"use client";

export function LoadingScreen({ message, compact = false }: { message: string; compact?: boolean }) {
  if (compact) {
    return <div className="loading-screen compact">{message}</div>;
  }
  return (
    <div className="page-stack">
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: 12 }}>
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="skeleton-block skeleton-metric" />
        ))}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <div className="skeleton-block skeleton-chart" />
        <div className="skeleton-block skeleton-chart" />
      </div>
    </div>
  );
}
