"use client";

import { downloadCsv } from "@/lib/api";
import { KeyValueRecord } from "@/lib/types";

export function CsvButton({ rows, filename }: { rows: KeyValueRecord[]; filename: string }) {
  if (!rows.length) return null;
  return (
    <button className="csv-button" onClick={() => downloadCsv(rows, filename)}>
      ⬇ Download CSV
    </button>
  );
}
