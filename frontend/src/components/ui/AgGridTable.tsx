"use client";

import { ColDef } from "ag-grid-community";
import { AgGridReact } from "ag-grid-react";
import { KeyValueRecord } from "@/lib/types";
import { inferColumns } from "@/lib/transforms";

export function AgGridTable({
  rows,
  height,
  onRowClick,
}: {
  rows: KeyValueRecord[];
  height?: number;
  onRowClick?: (row: KeyValueRecord) => void;
}) {
  if (!rows.length) {
    return <div className="table-card">No data to display.</div>;
  }
  const columns: ColDef<KeyValueRecord>[] = inferColumns(rows).map((column) => ({
    field: column,
    headerName: column.replaceAll("_", " "),
    sortable: true,
    filter: true,
    resizable: true,
    minWidth: 140,
    flex: 1,
    valueFormatter: (params) => (params.value == null ? "-" : String(params.value)),
  }));
  const resolvedHeight = height ?? Math.min(Math.max(rows.length * 42 + 56, 240), 720);
  return (
    <div
      className="table-card ag-theme-alpine"
      style={{ height: resolvedHeight, cursor: onRowClick ? "pointer" : undefined }}
    >
      <AgGridReact
        rowData={rows}
        columnDefs={columns}
        defaultColDef={{ sortable: true, filter: true, resizable: true, minWidth: 140, flex: 1 }}
        animateRows
        onRowClicked={onRowClick ? (event) => { if (event.data) onRowClick(event.data); } : undefined}
      />
    </div>
  );
}
