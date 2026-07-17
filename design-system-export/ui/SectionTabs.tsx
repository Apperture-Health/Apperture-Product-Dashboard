"use client";

export function SectionTabs({
  items,
  active,
  onChange,
}: {
  items: { key: string; label: string }[];
  active: string;
  onChange: (key: string) => void;
}) {
  return (
    <div className="tabs section-tabs">
      {items.map((item) => (
        <button
          key={item.key}
          className={`tab-button section-tab-button${item.key === active ? " active" : ""}`}
          onClick={() => onChange(item.key)}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}
