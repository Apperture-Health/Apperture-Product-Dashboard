"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Single-select combobox for the dark sidebar: shows the current value, opens a
 * panel with a type-to-filter search box and a scrollable option list. Reuses the
 * `.msd-*` styles from MultiCheckboxDropdown for visual consistency.
 *
 * `options` includes the empty-string "All" sentinel (same contract as the plain
 * <select> it replaces).
 */
export function SearchableSelectField({
  label,
  value,
  onChange,
  options,
  allLabel = "All",
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: string[];
  allLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    if (open) document.addEventListener("mousedown", handleOutside);
    return () => document.removeEventListener("mousedown", handleOutside);
  }, [open]);

  // Reset the search box each time the panel opens.
  useEffect(() => {
    if (open) setSearch("");
  }, [open]);

  const labelFor = (opt: string) => opt || allLabel;
  const filtered = options.filter((opt) => labelFor(opt).toLowerCase().includes(search.toLowerCase()));

  function select(opt: string) {
    onChange(opt);
    setOpen(false);
  }

  return (
    <div className="msd-wrapper" ref={ref}>
      <label className="msd-label">{label}</label>
      <button type="button" className="msd-trigger" onClick={() => setOpen((o) => !o)}>
        <span className="msd-trigger-value">{value ? value : allLabel}</span>
        <span className="msd-chevron">{open ? "▲" : "▼"}</span>
      </button>
      {open && (
        <div className="msd-panel">
          {options.length > 8 && (
            <input
              className="msd-search"
              placeholder="Search…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onClick={(e) => e.stopPropagation()}
              autoFocus
            />
          )}
          <div className="msd-list">
            {filtered.map((opt) => (
              <button
                type="button"
                key={opt || "__all__"}
                className={`msd-item msd-item--single${opt === value ? " is-selected" : ""}`}
                onClick={() => select(opt)}
              >
                {labelFor(opt)}
              </button>
            ))}
            {!filtered.length && <div className="msd-empty">No options match</div>}
          </div>
        </div>
      )}
    </div>
  );
}
