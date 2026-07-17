# Design System Export

A self-contained copy of the visual layer from the Clinical Trials Intelligence Platform
dashboard. Drop this folder into another repo (or hand it to Claude) to build pages that
look like that dashboard, **without** dragging along its backend, auth, filters, or data layer.

## Contents

```
DESIGN_SYSTEM.md    ← READ FIRST. Colour tokens, chart rules, component patterns, formatting.
global.css          ← The entire global stylesheet (605 lines, plain CSS, no interpolation).
                      Extracted from DashboardShell.tsx's <style jsx global> block.
ui/                 ← 18 reusable primitives (MetricRow, ChartTile, SectionHeader, PageHeader,
                      AgGridTable, TopTabs, MultiCheckboxDropdown, AlertCallout, skeletons, …)
lib/charts.ts       ← Plotly layout helpers + the 12-colour chart sequence.
lib/constants.ts    ← PAGE_META / CHIP_CLASS — shows the nav + chip conventions.
example/layout.tsx  ← How DM Sans is loaded (root layout).
example/HomePage.tsx← A real page, showing how the primitives compose:
                      PageHeader → MetricRow → TwoCol → ChartTile.
```

## How to use it

1. Copy `global.css` into your app and import it once (e.g. in the root layout), **or** paste
   its contents back into a `<style jsx global>{\` … \`}</style>` block if you prefer the
   original single-file approach.
2. Copy `ui/` into `src/components/ui/` and `lib/charts.ts` into `src/lib/`.
3. Load DM Sans — see `example/layout.tsx`.
4. Build pages by composing the `ui/` primitives, following `example/HomePage.tsx`.

## Prompt to give Claude in the new repo

> Match the design system in `design-system-export/DESIGN_SYSTEM.md` exactly. Use the tokens
> from its colour table — never invent one-off hex values. Reuse the primitives in
> `design-system-export/ui/` rather than writing new components, and use the Plotly layout
> helpers in `lib/charts.ts` for any chart. This page is **not** a sidebar dashboard, so keep
> the card / chart / typography styles from `global.css` and drop the `.dashboard-shell`,
> `.dashboard-sidebar`, and `.ask-sidebar-*` rules.

(Adjust that last sentence if your new page *is* a sidebar dashboard.)

## Caveats

- `ui/` components import from `../../lib/...` paths — fix the import paths to match the new
  repo's structure.
- `MultiCheckboxDropdown`, `SidebarSelectField`, and `SearchableSelectField` are styled for the
  **dark sidebar**. On a white page they need colour overrides.
- `constants.ts` and `example/HomePage.tsx` contain app-specific content (tab names, KPI labels).
  They're included as *pattern references*, not as code to keep verbatim.
- The `.um-*` classes at the end of `global.css` belong to the User Management page — drop them
  if you don't need it.
