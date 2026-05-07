"use client";

export function SectionHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="section-header">
      <h3>{title}</h3>
      {subtitle ? <p>{subtitle}</p> : null}
    </div>
  );
}
