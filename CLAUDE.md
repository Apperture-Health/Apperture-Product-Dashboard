# Design System & UI Standards

This project is a **Next.js analytics dashboard** (App Router, TypeScript). All UI work must follow the design system defined below. Do not deviate from colours, typography, spacing, or component patterns without being explicitly asked.

The `legacy/` folder is a deprecated Streamlit prototype — do not edit it.

---

## Stack

- **Framework**: Next.js 14+ App Router (`frontend/`)
- **Language**: TypeScript
- **Charts**: Plotly.js (rendered via react-plotly.js or direct Plotly calls)
- **Tables**: AG Grid (`ag-theme-alpine`)
- **Styling**: Single `<style jsx global>` block inside `DashboardShell.tsx` — no separate CSS files
- **State**: React hooks only (`useState`, custom hooks) — no Zustand or Redux
- **Backend**: FastAPI (`backend/`), proxied through Next.js at `app/api/[...path]/route.ts`
- **Font**: DM Sans (Google Fonts), loaded in `app/layout.tsx`

---

## Colour Palette

These values appear throughout the global stylesheet in `DashboardShell.tsx`. Never hardcode one-off hex values in component files — match these tokens.

| Token | Hex | Usage |
|---|---|---|
| primary | `#0F4C81` | headings, active tabs, KPI values, primary buttons, sidebar active state |
| secondary | `#2E86AB` | chart accents, sponsor chips |
| accent | `#F18F01` | amber highlights, status chips |
| success | `#2A9D8F` | teal, positive deltas |
| warning | `#E9C46A` | warning states |
| danger | `#E76F51` | errors, terminated status |
| bg_dark | `#0B1929` | sidebar gradient top |
| bg_card | `#FFFFFF` | card backgrounds |
| text_primary | `#1A1A2E` | body text |
| text_secondary | `#6B7280` | labels, subtitles, muted text |
| page_bg | `#F8FAFC` | main content background |

Chart colour sequence (in order): `#0F4C81`, `#2E86AB`, `#2A9D8F`, `#F18F01`, `#E76F51`, `#E9C46A`, `#457B9D`, `#A8DADC`, `#264653`, `#F4A261`, `#1D3557`, `#6B7280`.

---

## App Structure

```
frontend/
  app/
    layout.tsx                  ← root layout (DM Sans font, metadata)
    page.tsx                    ← redirects to /dashboard
    dashboard/
      page.tsx                  ← renders <DashboardShell />
    api/[...path]/route.ts      ← proxy to FastAPI backend
    auth/[...path]/route.ts     ← auth proxy
  src/
    components/
      DashboardShell.tsx        ← layout grid, global <style jsx global>, state wiring
      Sidebar.tsx               ← filter sidebar + Ask the Data AI section
      FilterSummaryBar.tsx      ← active filter chip bar below tab nav
      LoginPage.tsx
      pages/                    ← one component per tab, each exports a named function
        HomePage.tsx
        PipelinePage.tsx
        DrugDetailPage.tsx
        DrugPricingPage.tsx
        MarketAccessPage.tsx
        SponsorsPage.tsx
        TrialDesignPage.tsx
        EndpointsPage.tsx
        OutcomesPage.tsx
        ScoresPage.tsx
        ProOverviewPage.tsx
        TrialGroupsPage.tsx
        SafetyPage.tsx
        RealWorldSafetyPage.tsx
        types.ts                ← PageProps type
      ui/                       ← reusable primitives
        MultiCheckboxDropdown.tsx
        SidebarSelectField.tsx
        AgGridTable.tsx
        AiSummaryBlock.tsx
        ChartTile.tsx
        MetricRow.tsx
        PageHeader.tsx
        SectionHeader.tsx
        TopTabs.tsx
        SectionTabs.tsx
        TwoCol.tsx
        CsvButton.tsx
        AlertCallout.tsx
        LoadingScreen.tsx
        ChartSkeleton.tsx
        TableSkeleton.tsx
        ProgressBar.tsx
    hooks/
      useAuth.ts                ← login/logout, session state
      useFilters.ts             ← FilterState + FilterOptions, cascade logic
      useProgressivePageData.ts ← KPI-first progressive data loading
      usePageData.ts
    lib/
      types.ts                  ← FilterState, FilterOptions, AuthSession, PageMeta
      constants.ts              ← PAGE_META, PAGE_SUBTITLES, defaultFilters, emptyOptions, CHIP_CLASS
      api.ts                    ← apiRequest() fetch wrapper
      charts.ts                 ← Plotly layout helpers
      transforms.ts             ← activeFilterSummary(), slugToMeta(), hasAnyFilter(), getInitials()
```

---

## Navigation

Pages are defined as an array in `src/lib/constants.ts`:

```ts
export const PAGE_META: PageMeta[] = [
  { key: "home",      label: "🏠 Home",      title: "Clinical Trials Intelligence Platform" },
  { key: "pipeline",  label: "📈 Pipeline",  title: "Pipeline Landscape" },
  // … one entry per tab
];
```

- Active tab is driven by the URL query param `?tab=<key>` (e.g. `?tab=pipeline`)
- `DashboardShell` reads `searchParams.get("tab")`, resolves it with `slugToMeta()`, and conditionally renders the matching page component
- Tab visibility is controlled by `session.visible_tabs` (user-level access)
- To add a new page: add an entry to `PAGE_META`, add the page component to `pages/`, and add a render block in `DashboardShell`

---

## Filter State

Managed by `src/hooks/useFilters.ts`. Never store filter state in component-local state — always use this hook.

```ts
const { filters, filterOptions, filtersLoading, updateFilter, resetFilters, applyExtracted } = useFilters(session);
```

`FilterState` (from `src/lib/types.ts`) — key fields:

```ts
type FilterState = {
  indication_name: string | null;   // global — cascades and clears downstream on change
  atc_class_name:  string | null;   // global — cascades and clears downstream on change
  sponsor:         string[];
  sponsor_agency_class: string[];
  brand_name:      string[];
  drug_indication: string | null;
  study_type:      string[];
  phase:           string[];
  overall_status:  string[];
  country:         string[];
  endpoint_category: string[];
  pro_instrument:  string[];
  pro_domain:      string[];
  has_results:     boolean | null;
  enrollment_min:  number | null;
  enrollment_max:  number | null;
};
```

- `updateFilter(key, value)` — updates a single field; changing `indication_name` or `atc_class_name` auto-clears all downstream fields
- `resetFilters(allowedIndications?, allowedAtcClasses?)` — resets to `defaultFilters`
- `applyExtracted(extracted)` — applies AI-extracted filter dict (from the sidebar Ask the Data feature)

`FilterOptions` holds the available options for each dropdown (fetched from `/api/filters/options` and narrowed by the active global filter).

---

## Sidebar Structure

`src/components/Sidebar.tsx` — receives props from `DashboardShell`, no internal filter state.

```
<aside className="dashboard-sidebar">
  1. Brand (logo + "Clinical Trials Intelligence Platform")
  2. User badge (avatar initials, display name, sign-out button)
  3. Ask the Data section (text input → API call → chips → Apply/Dismiss)
  4. Filters header (label + active count badge)
  5. SidebarSelectField: Condition (Disease Area)   → indication_name
  6. SidebarSelectField: Drug Class (ATC)           → atc_class_name
  7. <details> Trial Attributes: Study Type, Phase, Status, Results Posted, Enrollment Range
  8. <details> Sponsor / Drug: Sponsor, Agency Class, Drug (Brand Name), Drug Indication
  9. <details> Endpoints / Outcomes: Endpoint Category
  10. <details> PRO: PRO Instrument, PRO Domain
  11. <details> Geography: Country
  12. Reset All Filters button
</aside>
```

Sidebar props:
```ts
type SidebarProps = {
  session: AuthSession;
  filters: FilterState;
  filterOptions: FilterOptions;
  filtersLoading: boolean;
  updateFilter: <K extends keyof FilterState>(key: K, value: FilterState[K]) => void;
  resetFilters: () => void;
  onLogout: () => void;
  onApplyFilters: (extracted: Record<string, unknown>) => void;
};
```

---

## Component Patterns

### Page components

Each file in `src/components/pages/` exports one named function. All receive `PageProps`:

```ts
type PageProps = {
  filters: FilterState;
  pageData: unknown;          // typed per-page in the component itself
  updateFilter: <K extends keyof FilterState>(key: K, value: FilterState[K]) => void;
  kpisReady: boolean;
  fullyLoaded: boolean;
  pageSummaries: Record<string, string>;
  summaryLoading: boolean;
  requestSummary: (key: string) => void;
};
```

### MetricRow — `<MetricRow metrics={[...]} />`

Each metric: `{ label: string; value: string | number; icon: string; delta?: string }`.

Renders `.metric-grid` with `.metric-card` per item:
```
.metric-card  — white card, border-left: 4px solid #0f4c81, border-radius: 12px, padding: 20px 24px
.metric-label — 12px uppercase, color: #6b7280
.metric-value — 32px bold, color: #0f4c81
.metric-icon  — top-right, rgba(15,76,129,0.08) bg
```

### ChartTile — `<ChartTile title="..." subtitle="...">`

Wraps Plotly charts. All Plotly charts must:
- Use `font.family: "DM Sans, system-ui, sans-serif"`
- Use `paper_bgcolor: "rgba(0,0,0,0)"`, `plot_bgcolor: "rgba(0,0,0,0)"`
- Use `margin: { l:40, r:20, t:40, b:40 }`
- Use the chart colour sequence above

### SectionHeader — `<SectionHeader title="..." subtitle="..." />`

`.section-header h3` — `color: #0f4c81`, `font-size: 20px`, `font-weight: 700`
`.section-header p` — `color: #6b7280`, `font-size: 14px`

### AgGridTable — `<AgGridTable rows={[...]} columns={[...]} />`

Uses `.ag-theme-alpine`. CSS variables for the theme are set in the global stylesheet.

### SidebarSelectField

Single-select `<select>` styled for the dark sidebar. Always use this (not a raw `<select>`) for single-value sidebar filters.

### MultiCheckboxDropdown

Multi-select with a search input and pill tags. Always use this (not `<select multiple>`) for array-value sidebar filters.

---

## Global Stylesheet

All CSS lives in the `<style jsx global>` block at the bottom of `DashboardShell.tsx`. Key class names:

| Class | Purpose |
|---|---|
| `.dashboard-shell` | Grid layout: `292px sidebar + minmax(0,1fr) main` |
| `.dashboard-sidebar` | Dark gradient sidebar (`#0b1929 → #0f4c81`), sticky, `height: 100vh`, `overflow-y: auto` |
| `.dashboard-main` | Main content area, `padding: 14px 18px 36px` |
| `.tabs` / `.tab-button` / `.tab-button.active` | Tab navigation bar |
| `.page-header` | Page title + subtitle block |
| `.filter-bar` / `.filter-chip` | Active-filter summary bar |
| `.metric-grid` / `.metric-card` | KPI metric cards |
| `.chart-tile` | Chart wrapper (white card, hover shadow) |
| `.table-card` | Data table wrapper |
| `.two-col` | Two-column chart grid (`1fr 1fr`) |
| `.page-stack` | Vertical stack of sections with `gap: 16px` |
| `.ask-sidebar-*` | Ask the Data AI section in sidebar |

Do not add new CSS files. Add new classes to the existing `<style jsx global>` block.

---

## Formatting Rules

| Type | Format | Null/empty |
|---|---|---|
| Integer counts | `1,234` (thousands separator) | `—` |
| Percentages | `12.3%` (1 decimal) | `—` |
| Floats | `1,234.56` | `—` |
| Status/phase strings | Title-cased via mapping dict | raw value as fallback |

Formatting helpers live in `src/lib/transforms.ts`.

---

## API Pattern

All backend requests go through `src/lib/api.ts`:

```ts
const data = await apiRequest<ResponseType>("/api/pages/pipeline", {
  method: "POST",
  body: JSON.stringify(filters),
});
```

`apiRequest` handles credentials, JSON headers, and error throwing. Never use `fetch` directly in components.

Backend endpoints are proxied by Next.js from `app/api/[...path]/route.ts` to the FastAPI server.
