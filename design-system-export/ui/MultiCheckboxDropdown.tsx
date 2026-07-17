"use client";

import { useEffect, useRef, useState } from "react";

export function MultiCheckboxDropdown({
  label,
  values,
  options,
  onChange,
}: {
  label: string;
  values: string[];
  options: string[];
  onChange: (values: string[]) => void;
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

  const filtered = options.filter((opt) => opt.toLowerCase().includes(search.toLowerCase()));

  function toggle(opt: string) {
    onChange(values.includes(opt) ? values.filter((v) => v !== opt) : [...values, opt]);
  }

  return (
    <div className="msd-wrapper" ref={ref}>
      <label className="msd-label">{label}</label>
      <button type="button" className="msd-trigger" onClick={() => setOpen((o) => !o)}>
        <span>{values.length === 0 ? "All" : `${values.length} selected`}</span>
        {values.length > 0 && <span className="msd-count">{values.length}</span>}
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
              <label key={opt} className="msd-item">
                <input type="checkbox" checked={values.includes(opt)} onChange={() => toggle(opt)} />
                {opt}
              </label>
            ))}
            {!filtered.length && <div className="msd-empty">No options match</div>}
          </div>
        </div>
      )}
      {values.length > 0 && (
        <div className="msd-pills">
          {values.map((v) => (
            <span key={v} className="msd-pill">
              {v.length > 22 ? `${v.slice(0, 22)}…` : v}
              <button type="button" onClick={() => toggle(v)}>×</button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
