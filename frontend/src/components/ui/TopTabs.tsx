"use client";

import { PageMeta } from "@/lib/types";

export function TopTabs({
  pages,
  activeKey,
  onChange,
}: {
  pages: PageMeta[];
  activeKey: string;
  onChange: (key: string) => void;
}) {
  return (
    <div className="tabs top-tabs">
      {pages.map((page) => (
        <button
          key={page.key}
          className={`tab-button top-tab-button${page.key === activeKey ? " active" : ""}`}
          onClick={() => onChange(page.key)}
        >
          {page.label}
        </button>
      ))}
    </div>
  );
}
