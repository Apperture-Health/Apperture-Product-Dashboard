"use client";

export function ProgressBar() {
  return (
    <div
      className="skeleton-block"
      style={{ height: 3, borderRadius: 2, marginBottom: 8 }}
      aria-busy="true"
      aria-label="Loading page data"
    />
  );
}
