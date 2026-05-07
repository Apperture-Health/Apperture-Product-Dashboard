"use client";

export function SidebarSelectField({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: string[];
}) {
  return (
    <div className="sidebar-field">
      <label className="sidebar-field-label">{label}</label>
      <select
        className="sidebar-select-input"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      >
        {options.map((option) => (
          <option key={option || "__empty__"} value={option}>
            {option || "All"}
          </option>
        ))}
      </select>
    </div>
  );
}
