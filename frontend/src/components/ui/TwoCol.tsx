"use client";

import { ReactNode } from "react";

export function TwoCol({ children }: { children: ReactNode }) {
  return <div className="two-col">{children}</div>;
}
