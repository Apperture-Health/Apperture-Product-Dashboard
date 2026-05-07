"use client";

import { PageMeta } from "@/lib/types";
import { PAGE_SUBTITLES } from "@/lib/constants";

export function PageHeader({ page }: { page: PageMeta }) {
  return (
    <div className="page-header">
      <h1>{page.title}</h1>
      <p>{PAGE_SUBTITLES[page.key] ?? ""}</p>
    </div>
  );
}
