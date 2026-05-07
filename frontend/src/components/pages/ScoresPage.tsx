"use client";

import { AlertCallout } from "@/components/ui/AlertCallout";
import { PageProps } from "./types";

export function ScoresPage({ pageData }: PageProps) {
  return (
    <div className="page-stack">
      <AlertCallout tone="info" title="Work in Progress">
        {String(pageData?.message ?? "This page is currently a work in progress.")}
      </AlertCallout>
    </div>
  );
}
