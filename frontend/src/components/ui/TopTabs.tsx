"use client";

import { PageMeta } from "@/lib/types";
import { HOME_KEY, PageGroup } from "@/lib/constants";

type Props = {
  groups: PageGroup[];
  visiblePages: PageMeta[];
  activeKey: string;
  onChange: (key: string) => void;
};

export function TwoTierNav({ groups, visiblePages, activeKey, onChange }: Props) {
  const homeVisible = visiblePages.some((p) => p.key === HOME_KEY);
  const activeGroup = groups.find((g) => g.tabKeys.includes(activeKey)) ?? null;

  function handleGroupClick(group: PageGroup) {
    const first = group.tabKeys.find((k) => visiblePages.some((p) => p.key === k));
    if (first) onChange(first);
  }

  return (
    <div className="nav-wrapper">
      <div className={`nav-group-tier${activeGroup !== null ? " has-subtabs" : ""}`}>
        {homeVisible && (
          <button
            className={`nav-group-btn${activeKey === HOME_KEY ? " active" : ""}`}
            onClick={() => onChange(HOME_KEY)}
          >
            🏠 Home
          </button>
        )}
        {groups.map((group) => (
          <button
            key={group.key}
            className={`nav-group-btn${activeGroup?.key === group.key ? " active" : ""}`}
            onClick={() => handleGroupClick(group)}
          >
            {group.label}
          </button>
        ))}
      </div>
      {activeGroup !== null && (
        <div className="nav-page-tier">
          {activeGroup.tabKeys
            .map((k) => visiblePages.find((p) => p.key === k))
            .filter((p): p is PageMeta => p !== undefined)
            .map((page) => (
              <button
                key={page.key}
                className={`nav-page-btn${page.key === activeKey ? " active" : ""}`}
                onClick={() => onChange(page.key)}
              >
                {page.label}
              </button>
            ))}
        </div>
      )}
    </div>
  );
}
