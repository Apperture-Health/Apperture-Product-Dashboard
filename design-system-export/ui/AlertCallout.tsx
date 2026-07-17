"use client";

import { ReactNode } from "react";

export function AlertCallout({
  title,
  children,
  tone,
}: {
  title: string;
  children: ReactNode;
  tone: "info" | "warning" | "danger";
}) {
  return (
    <div className={`alert ${tone}`}>
      <strong>{title}</strong>
      <div style={{ marginTop: 6 }}>{children}</div>
    </div>
  );
}
