import type { Layout, Data, Datum } from "plotly.js";

const colors = {
  primary: "#0F4C81",
  secondary: "#2E86AB",
  accent: "#F18F01",
  success: "#2A9D8F",
  warning: "#E9C46A",
  danger: "#E76F51",
  neutral: "#6B7280",
  sequence: [
    "#0F4C81",
    "#2E86AB",
    "#2A9D8F",
    "#F18F01",
    "#E76F51",
    "#E9C46A",
    "#457B9D",
    "#A8DADC",
    "#264653",
    "#F4A261",
    "#1D3557",
    "#6B7280",
  ],
};

const BAR_CHART_HEIGHT = 380;

export const baseLayout: Partial<Layout> = {
  paper_bgcolor: "rgba(0,0,0,0)",
  plot_bgcolor: "rgba(0,0,0,0)",
  font: { family: "DM Sans, system-ui, sans-serif", size: 12, color: "#1A1A2E" },
  margin: { l: 44, r: 16, t: 14, b: 36 },
  hoverlabel: {
    bgcolor: "#ffffff",
    bordercolor: "#E5E7EB",
    font: { size: 13, color: "#0F4C81", family: "DM Sans, system-ui, sans-serif" },
  },
  hovermode: "closest",
  height: BAR_CHART_HEIGHT,
  legend: {
    orientation: "h",
    yanchor: "bottom",
    y: 1.02,
    xanchor: "right",
    x: 1,
    font: { size: 10 },
  },
  xaxis: {
    showgrid: false,
    showline: true,
    linecolor: "#E5E7EB",
    tickfont: { size: 11 },
    automargin: true,
  },
  yaxis: {
    showgrid: true,
    gridcolor: "#F3F4F6",
    gridwidth: 1,
    showline: true,
    linecolor: "#E5E7EB",
    tickfont: { size: 11 },
    automargin: true,
  },
};

function clipped(values: Array<string | number>) {
  return values.map((value) => {
    const str = String(value);
    return str.length > 22 ? `${str.slice(0, 22)}…` : str;
  });
}

function numeric(value: unknown) {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : 0;
  }
  if (typeof value === "string") {
    const parsed = Number(value.replaceAll(",", "").trim());
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

export function barFigure(rows: Record<string, unknown>[], xKey: string, yKey: string, horizontal = false) {
  if (!rows.length) return { data: [], layout: baseLayout };

  const orderedRows = horizontal
    ? [...rows].sort((a, b) => numeric(b[yKey]) - numeric(a[yKey]))
    : rows;

  const labels = orderedRows.map((row) => String(row[xKey] ?? ""));
  const clippedLabels = clipped(labels);
  const values = orderedRows.map((row) => numeric(row[yKey]));

  const maxLabelLength = clippedLabels.reduce((max, l) => Math.max(max, l.length), 0);
  const horizontalLeftMargin = Math.min(260, Math.max(120, maxLabelLength * 8));

  // Multi-colour bars for horizontal (each row visually distinct);
  // single primary colour for vertical (category axis already differentiates).
  const markerColor = horizontal
    ? values.map((_, i) => colors.sequence[i % colors.sequence.length])
    : colors.primary;

  const hoverTemplate = horizontal
    ? "<b>%{y}</b><br>Count: <b>%{x:,}</b><extra></extra>"
    : "<b>%{x}</b><br>Count: <b>%{y:,}</b><extra></extra>";

  return {
    data: [
      {
        type: "bar",
        x: horizontal ? values : clippedLabels,
        y: horizontal ? clippedLabels : values,
        marker: {
          color: markerColor,
          opacity: 0.88,
          line: { color: "rgba(255,255,255,0.3)", width: 1 },
        },
        orientation: horizontal ? "h" : "v",
        hovertemplate: hoverTemplate,
      },
    ],
    layout: {
      ...baseLayout,
      height: BAR_CHART_HEIGHT,
      margin: horizontal
        ? { l: horizontalLeftMargin, r: 32, t: 14, b: 20 }
        : { l: 44, r: 16, t: 14, b: 36 },
      xaxis: {
        ...baseLayout.xaxis,
        type: horizontal ? "linear" : "category",
        automargin: true,
      },
      yaxis: {
        ...baseLayout.yaxis,
        type: horizontal ? "category" : "linear",
        autorange: horizontal ? "reversed" : undefined,
        automargin: true,
      },
      bargap: horizontal ? 0.28 : 0.22,
    },
  };
}
export function lineFigure(rows: Record<string, unknown>[], xKey: string, yKey: string, mode: "lines+markers" | "lines" = "lines+markers"): { data: Data[]; layout: Partial<Layout> } {
  return {
    data: [
      {
        type: "scatter",
        mode,
        x: rows.map((row) => row[xKey] as Datum),
        y: rows.map((row) => Number(row[yKey] ?? 0)),
        line: { color: colors.primary, width: 3, shape: "hv" },
        marker: { color: colors.primary, size: 6 },
      },
    ],
    layout: baseLayout,
  };
}

export function multiLineFigure(rows: Record<string, unknown>[], xKey: string, yKey: string, seriesKey: string): { data: Data[]; layout: Partial<Layout> } {
  const groups = Array.from(new Set(rows.map((row) => String(row[seriesKey] ?? ""))));
  return {
    data: groups.map((group, index) => ({
      type: "scatter",
      mode: "lines+markers" as const,
      name: group,
      x: rows.filter((row) => String(row[seriesKey] ?? "") === group).map((row) => row[xKey] as Datum),
      y: rows.filter((row) => String(row[seriesKey] ?? "") === group).map((row) => Number(row[yKey] ?? 0)),
      line: { color: colors.sequence[index % colors.sequence.length], width: 2, shape: "hv" },
      marker: { color: colors.sequence[index % colors.sequence.length], size: 4 },
    })),
    layout: {
      ...baseLayout,
      legend: {
        orientation: "v",
        yanchor: "top",
        y: 1,
        xanchor: "left",
        x: 1.02,
        font: { size: 10 },
      },
      margin: { l: 40, r: 160, t: 56, b: 40 },
    },
  };
}

export function donutFigure(rows: Record<string, unknown>[], labelKey: string, valueKey: string): { data: Data[]; layout: Partial<Layout> } {
  return {
    data: [
      {
        type: "pie",
        labels: rows.map((row) => row[labelKey] as Datum),
        values: rows.map((row) => Number(row[valueKey] ?? 0)),
        hole: 0.45,
        textinfo: "label+percent",
        marker: { colors: colors.sequence },
      },
    ],
    layout: {
      ...baseLayout,
      legend: { orientation: "v", y: 0.5, x: 1.02 },
      margin: { l: 8, r: 8, t: 48, b: 12 },
    },
  };
}

export function heatmapFigure(
  rows: Record<string, unknown>[],
  xKey: string,
  yKey: string,
  valueKey: string,
  textKey?: string
): { data: Data[]; layout: Partial<Layout> } {
  // 1. Guard against empty data
  if (!rows || rows.length === 0) {
    return { data: [], layout: baseLayout };
  }

  // 2. Extract unique axes (keeping them raw for data matching)
  const xValues = Array.from(new Set(rows.map((row) => String(row[xKey] ?? ""))));
  const yValues = Array.from(new Set(rows.map((row) => String(row[yKey] ?? ""))));

  // 3. Create a Lookup Map for O(1) access
  // This prevents the blank chart issue by ensuring keys match exactly
  const lookup = new Map<string, Record<string, unknown>>();
  rows.forEach((row) => {
    const key = `${String(row[xKey] ?? "")}|${String(row[yKey] ?? "")}`;
    lookup.set(key, row);
  });

  // 4. Build Z-Matrix (values) and Text-Matrix in a single pass
  const z: number[][] = [];
  const text: string[][] = [];

  yValues.forEach((yVal) => {
    const zRow: number[] = [];
    const textRow: string[] = [];

    xValues.forEach((xVal) => {
      const match = lookup.get(`${xVal}|${yVal}`);
      
      // Plotly expects null or number for heatmap Z values
      const val = match?.[valueKey];
      zRow.push(val !== undefined && val !== null ? Number(val) : 0);

      if (textKey) {
        textRow.push(String(match?.[textKey] ?? ""));
      }
    });

    z.push(zRow);
    if (textKey) text.push(textRow);
  });

  // Dashboard-aligned colorscale: low = near-white, high = primary navy
  const navyColorscale: [number, string][] = [
    [0.0, "#EEF4FB"],
    [0.2, "#BFDBF7"],
    [0.4, "#7AB8E0"],
    [0.6, "#2E86AB"],
    [0.8, "#1A5F8A"],
    [1.0, "#0F4C81"],
  ];

  const maxYLabelLength = yValues.reduce((max, v) => Math.max(max, v.length), 0);
  const leftMargin = Math.min(220, Math.max(72, maxYLabelLength * 7.5));
  const needsRotation = xValues.some((v) => v.length > 8);
  const bottomMargin = needsRotation ? 110 : 56;

  return {
    data: [
      {
        type: "heatmap",
        x: xValues,
        y: yValues,
        z: z,
        text: textKey ? (text as any) : undefined,
        texttemplate: textKey ? "%{text}" : undefined,
        colorscale: navyColorscale as any,
        reversescale: false,
        hovertemplate: "<b>%{y}</b><br>%{x}<br>Value: <b>%{z:,}</b><extra></extra>",
        hoverongaps: false,
        showscale: true,
        xgap: 2,
        ygap: 2,
        colorbar: {
          thickness: 14,
          len: 0.85,
          tickfont: { size: 11, color: "#1A1A2E" },
          outlinecolor: "#E5E7EB",
          outlinewidth: 1,
        } as any,
      },
    ],
    layout: {
      ...baseLayout,
      height: Math.max(380, yValues.length * 32 + 100),
      margin: { l: leftMargin, r: 64, t: 14, b: bottomMargin },
      xaxis: {
        ...baseLayout.xaxis,
        type: "category",
        automargin: true,
        tickangle: needsRotation ? -40 : 0,
        tickfont: { size: 11 },
      },
      yaxis: {
        ...baseLayout.yaxis,
        type: "category",
        automargin: true,
        tickfont: { size: 11 },
      },
    },
  };
}


export function treemapFigure(rows: Record<string, unknown>[], labelKey: string, valueKey: string): { data: Data[]; layout: Partial<Layout> } {
  return {
    data: [
      {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        type: "treemap" as any,
        labels: rows.map((row) => String(row[labelKey] ?? "")),
        parents: rows.map(() => ""),
        values: rows.map((row) => Number(row[valueKey] ?? 0)),
        marker: { colors: colors.sequence },
      },
    ],
    layout: {
      ...baseLayout,
      height: BAR_CHART_HEIGHT,
      margin: { l: 8, r: 8, t: 14, b: 8 },
    },
  };
}

export function funnelFigure(rows: Record<string, unknown>[], labelKey: string, valueKey: string): { data: Data[]; layout: Partial<Layout> } {
  return {
    data: [
      {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        type: "funnel" as any,
        y: rows.map((row) => row[labelKey] as Datum),
        x: rows.map((row) => Number(row[valueKey] ?? 0)),
        marker: { color: colors.sequence },
      },
    ],
    layout: baseLayout,
  };
}

export function areaFigure(rows: Record<string, unknown>[], xKey: string, yKey: string): { data: Data[]; layout: Partial<Layout> } {
  return {
    data: [
      {
        type: "scatter",
        mode: "lines" as const,
        x: rows.map((row) => row[xKey] as Datum),
        y: rows.map((row) => Number(row[yKey] ?? 0)),
        fill: "tozeroy",
        fillcolor: "rgba(15,76,129,0.12)",
        line: { color: colors.primary, width: 2.5 },
      },
    ],
    layout: baseLayout,
  };
}

export function groupedBarFigure(
  rows: Record<string, unknown>[],
  xKey: string,
  series: { key: string; label: string; color: string }[],
  horizontal = false,
): { data: Data[]; layout: Partial<Layout> } {
  const xVals = rows.map((row) => String(row[xKey] ?? ""));
  return {
    data: series.map((s) => ({
      type: "bar" as const,
      name: s.label,
      x: (horizontal ? rows.map((row) => Number(row[s.key] ?? 0)) : xVals) as Datum[],
      y: (horizontal ? clipped(xVals) : rows.map((row) => Number(row[s.key] ?? 0))) as Datum[],
      marker: { color: s.color },
      orientation: (horizontal ? "h" : "v") as "h" | "v",
    })),
    layout: {
      ...baseLayout,
      barmode: "group",
      margin: horizontal ? { l: 24, r: 24, t: 56, b: 36 } : baseLayout.margin,
    },
  };
}

export const PHASE_COLOR_MAP: Record<string, string> = {
  "EARLY_PHASE1": "#A8DADC",
  "PHASE1": "#2E86AB",
  "PHASE1/PHASE2": "#457B9D",
  "PHASE2": "#0F4C81",
  "PHASE2/PHASE3": "#1D3557",
  "PHASE3": "#2A9D8F",
  "PHASE4": "#F18F01",
  "N/A": "#9CA3AF",
};

export function stackedBarFigure(
  rows: Record<string, unknown>[],
  xKey: string,
  yKey: string,
  colorKey: string,
  colorMap?: Record<string, string>,
  horizontal = false,
): { data: Data[]; layout: Partial<Layout> } {
  const groups = Array.from(new Set(rows.map((row) => String(row[colorKey] ?? ""))));
  const xValues = Array.from(new Set(rows.map((row) => String(row[xKey] ?? ""))));
  const clippedXValues = clipped(xValues);
  const maxLabelLength = clippedXValues.reduce((max, label) => Math.max(max, label.length), 0);
  const horizontalLeftMargin = Math.min(260, Math.max(120, maxLabelLength * 8));

  const valuesByGroup = new Map<string, Map<string, number>>();
  rows.forEach((row) => {
    const group = String(row[colorKey] ?? "");
    const xValue = String(row[xKey] ?? "");
    const value = numeric(row[yKey]);
    const groupValues = valuesByGroup.get(group) ?? new Map<string, number>();
    groupValues.set(xValue, (groupValues.get(xValue) ?? 0) + value);
    valuesByGroup.set(group, groupValues);
  });

  return {
    data: groups.map((group, idx) => {
      const valMap = valuesByGroup.get(group) ?? new Map<string, number>();
      return {
        type: "bar" as const,
        name: group,
        x: (horizontal ? xValues.map((x) => valMap.get(x) ?? 0) : xValues) as Datum[],
        y: (horizontal ? clippedXValues : xValues.map((x) => valMap.get(x) ?? 0)) as Datum[],
        marker: { color: colorMap?.[group] ?? colors.sequence[idx % colors.sequence.length] },
        orientation: (horizontal ? "h" : "v") as "h" | "v",
      };
    }),
    layout: {
      ...baseLayout,
      barmode: "stack",
      margin: horizontal
        ? { ...baseLayout.margin, l: horizontalLeftMargin, r: 40 }
        : baseLayout.margin,
      xaxis: {
        ...baseLayout.xaxis,
        type: horizontal ? "linear" : "category",
        automargin: true,
      },
      yaxis: {
        ...baseLayout.yaxis,
        type: horizontal ? "category" : "linear",
        automargin: true,
      },
    },
  };
}
