# Design System & UI Standards

Follow this document for all UI work. Do not deviate from colours, typography, spacing, or
component patterns without being explicitly asked. **Never hardcode one-off hex values —
always use the tokens below.**

---

## Stack assumptions

- **Framework**: Next.js 14+ App Router, TypeScript
- **Charts**: Plotly.js (via react-plotly.js or direct Plotly calls)
- **Tables**: AG Grid (`ag-theme-alpine`)
- **Styling**: one global stylesheet (`global.css` in this bundle). No CSS modules, no Tailwind,
  no per-component CSS files. Add new classes to the existing global stylesheet.
- **Font**: DM Sans (Google Fonts) — see `example/layout.tsx`

---

## Colour Palette

| Token | Hex | Usage |
|---|---|---|
| primary | `#0F4C81` | headings, active tabs, KPI values, primary buttons, sidebar active state |
| secondary | `#2E86AB` | chart accents, chips |
| accent | `#F18F01` | amber highlights, status chips |
| success | `#2A9D8F` | teal, positive deltas |
| warning | `#E9C46A` | warning states |
| danger | `#E76F51` | errors, terminated status |
| bg_dark | `#0B1929` | sidebar gradient top |
| bg_card | `#FFFFFF` | card backgrounds |
| text_primary | `#1A1A2E` | body text |
| text_secondary | `#6B7280` | labels, subtitles, muted text |
| page_bg | `#F8FAFC` | main content background |

**Chart colour sequence** (use in this exact order):
`#0F4C81`, `#2E86AB`, `#2A9D8F`, `#F18F01`, `#E76F51`, `#E9C46A`, `#457B9D`, `#A8DADC`,
`#264653`, `#F4A261`, `#1D3557`, `#6B7280`.

---

## Component Patterns

### MetricRow — `<MetricRow metrics={[...]} />`
Each metric: `{ label: string; value: string | number; icon: string; delta?: string }`.
Renders `.metric-grid` with a `.metric-card` per item:
- `.metric-card` — white card, `border-left: 4px solid #0f4c81`, `border-radius: 12px`, `padding: 20px 24px`
- `.metric-label` — 12px uppercase, `#6b7280`
- `.metric-value` — 32px bold, `#0f4c81`
- `.metric-icon` — top-right, `rgba(15,76,129,0.08)` background

### ChartTile — `<ChartTile title="..." subtitle="...">`
Wraps Plotly charts. **All Plotly charts must:**
- `font.family: "DM Sans, system-ui, sans-serif"`
- `paper_bgcolor: "rgba(0,0,0,0)"`, `plot_bgcolor: "rgba(0,0,0,0)"`
- `margin: { l: 40, r: 20, t: 40, b: 40 }`
- use the chart colour sequence above

`lib/charts.ts` already provides the layout helpers — use them rather than hand-rolling layouts.

### SectionHeader — `<SectionHeader title="..." subtitle="..." />`
- `.section-header h3` — `#0f4c81`, 20px, weight 700
- `.section-header p` — `#6b7280`, 14px

### PageHeader — `<PageHeader page={...} />`
Page title + subtitle block at the top of every page.

### AgGridTable — `<AgGridTable rows={[...]} />`
Uses `.ag-theme-alpine`. Theme CSS variables are set in the global stylesheet. Columns are
inferred from `rows[0]` keys; supports `onRowClick`.

### MultiCheckboxDropdown / SidebarSelectField / SearchableSelectField
Use these instead of raw `<select>` / `<select multiple>`. Note: their `.msd-*` / `.sidebar-*`
styles are tuned for a **dark sidebar** — on a white page you'll need colour overrides.

### AlertCallout — `<AlertCallout tone="info" | "warning" | "danger">`
Success/error/info banners.

### TwoCol / SectionTabs / CsvButton / ProgressBar / skeletons
Layout + supporting primitives. `ChartSkeleton` / `TableSkeleton` / `LoadingScreen` for
loading states.

---

## Key global classes

| Class | Purpose |
|---|---|
| `.dashboard-shell` | Grid layout: `292px sidebar + minmax(0,1fr) main` |
| `.dashboard-sidebar` | Dark gradient sidebar (`#0b1929 → #0f4c81`), sticky, `height: 100vh` |
| `.dashboard-main` | Main content area, `padding: 14px 18px 36px` |
| `.tabs` / `.tab-button` / `.tab-button.active` | Tab navigation bar |
| `.page-header` | Page title + subtitle block |
| `.filter-bar` / `.filter-chip` | Active-filter summary chip bar |
| `.metric-grid` / `.metric-card` | KPI metric cards |
| `.chart-tile` | Chart wrapper (white card, hover shadow) |
| `.table-card` | Data table wrapper |
| `.two-col` | Two-column chart grid (`1fr 1fr`) |
| `.page-stack` | Vertical stack of sections, `gap: 16px` |

> **If your app is not a sidebar dashboard**, keep the card / chart / typography / table styles
> and drop `.dashboard-shell`, `.dashboard-sidebar`, and the `.ask-sidebar-*` rules.

---

## Formatting Rules

| Type | Format | Null/empty |
|---|---|---|
| Integer counts | `1,234` (thousands separator) | `—` |
| Percentages | `12.3%` (1 decimal) | `—` |
| Floats | `1,234.56` | `—` |
| Status/phase strings | Title-cased via a mapping dict | raw value as fallback |
