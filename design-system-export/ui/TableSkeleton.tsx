"use client";

export function TableSkeleton({ rows = 8 }: { rows?: number }) {
  return (
    <div className="table-card" style={{ padding: 12, display: "grid", gap: 6 }}>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="skeleton-block" style={{ height: 36, borderRadius: 6 }} />
      ))}
    </div>
  );
}
