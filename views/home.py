"""
HOME / OVERVIEW page.
High-level landing page: platform intro, database coverage KPIs, charts, nav cards.
"""
from __future__ import annotations
import streamlit as st
import pandas as pd

from components.page_header import page_header
from components.metric_cards import kpi_row
from components.filter_summary import filter_summary_bar
from components.charts import phase_bar, area_chart, bar_chart
from components.chart_tile import chart_tile
from components.alerts import no_data_callout, filter_required_callout
from utils.filters import FilterState
from data.repository import (
    get_overview_kpis,
    get_trials_by_phase,
    get_trials_over_time,
    get_top_sponsors,
    get_top_conditions,
)
from config.settings import PAGES


_NAV_CSS = """
<style>
.nav-grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 14px;
    margin-top: 4px;
}
.nav-card {
    background: #FFFFFF;
    border: 1px solid #E5E7EB;
    border-radius: 12px;
    padding: 18px 20px;
    display: flex;
    align-items: flex-start;
    gap: 14px;
    transition: box-shadow .2s, border-color .2s, transform .2s;
    position: relative;
    overflow: hidden;
}
.nav-card::after {
    content: '';
    position: absolute;
    top: 0; left: 0;
    width: 3px; height: 100%;
    background: #0F4C81;
    border-radius: 12px 0 0 12px;
    opacity: 0;
    transition: opacity .2s;
}
.nav-card:hover {
    box-shadow: 0 6px 24px rgba(15,76,129,.13);
    border-color: #93C5FD;
    transform: translateY(-2px);
}
.nav-card:hover::after { opacity: 1; }
.nav-icon-wrap {
    background: rgba(15,76,129,0.08);
    border-radius: 10px;
    width: 42px;
    height: 42px;
    min-width: 42px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 1.2rem;
    line-height: 1;
    flex-shrink: 0;
}
.nav-body { flex: 1; min-width: 0; }
.nav-title {
    font-weight: 700;
    font-size: .875rem;
    color: #1E40AF;
    line-height: 1.3;
}
.nav-desc {
    font-size: .75rem;
    color: #6B7280;
    margin-top: 4px;
    line-height: 1.45;
}
.nav-arrow {
    font-size: 1.15rem;
    color: #CBD5E1;
    flex-shrink: 0;
    align-self: center;
    transition: color .2s, transform .2s;
    font-weight: 300;
    padding-left: 4px;
}
.nav-card:hover .nav-arrow {
    color: #0F4C81;
    transform: translateX(3px);
}
</style>
"""


def _section_header(title: str, subtitle: str = "") -> None:
    sub = (
        f'<p style="color:#6B7280;font-size:14px;margin:0;">{subtitle}</p>'
        if subtitle else ""
    )
    st.markdown(
        f'<div style="margin:28px 0 14px 0;">'
        f'<h3 style="color:#0F4C81;font-weight:700;margin-bottom:2px;font-size:20px;">{title}</h3>'
        f'{sub}'
        f'</div>',
        unsafe_allow_html=True,
    )


def render(filters: FilterState) -> None:
    page_header(
        title="Clinical Trials Intelligence Platform",
        subtitle="Competitive landscape, pipeline intelligence, endpoint benchmarking, PRO analytics, and safety analysis.",
        icon="⚗️",
    )
    filter_summary_bar(filters)

    with st.spinner("Loading overview…"):
        kpis = get_overview_kpis(filters)

    # ── KPI Rows ──────────────────────────────────────────────────────────────
    _section_header("Database Coverage", "Total scope of the clinical trials dataset")
    kpi_row([
        {"label": "Total Trials",       "value": kpis["total_trials"],       "icon": "🧪"},
        {"label": "Active Trials",      "value": kpis["active_trials"],      "icon": "🔵"},
        {"label": "Completed Trials",   "value": kpis["completed_trials"],   "icon": "✅"},
        {"label": "Trials with Results","value": kpis["trials_with_results"],"icon": "📋"},
    ])
    st.markdown("<div style='height:10px'></div>", unsafe_allow_html=True)
    kpi_row([
        {"label": "Unique Sponsors",   "value": kpis["unique_sponsors"],  "icon": "🏢"},
        {"label": "Unique Drugs",      "value": kpis["unique_drugs"],     "icon": "💊"},
        {"label": "Unique Conditions", "value": kpis["unique_conditions"],"icon": "🔬"},
        {"label": "Trials with PROs",  "value": kpis["trials_with_pros"], "icon": "👤"},
    ])

    # ── Charts Section ────────────────────────────────────────────────────────
    if not filters.has_any_filter():
        st.markdown("<div style='height:8px'></div>", unsafe_allow_html=True)
        filter_required_callout(
            "Please select at least one filter in the sidebar "
            "(indication, drug class, sponsor, phase, etc.) to view the charts."
        )
    else:
        _section_header(
            "Landscape Overview",
            "Distribution of trials across phases, sponsors, conditions, and time",
        )
        with st.spinner("Loading charts…"):
            col1, col2 = st.columns(2)
            with col1:
                phase_df = get_trials_by_phase(filters)
                if phase_df.empty:
                    no_data_callout("phase distribution")
                else:
                    chart_tile(phase_bar(phase_df, x="phase", y="trial_count",
                                         title="Trial Count by Phase"))
            with col2:
                time_df = get_trials_over_time(filters)
                if time_df.empty:
                    no_data_callout("trial timeline")
                else:
                    time_df["year"] = pd.to_datetime(time_df["year"]).dt.year
                    chart_tile(area_chart(time_df, x="year", y="trial_count",
                                          title="Trials First Posted per Year"))

            col3, col4 = st.columns(2)
            with col3:
                sp_df = get_top_sponsors(filters, limit=15)
                if sp_df.empty:
                    no_data_callout("sponsors")
                else:
                    chart_tile(bar_chart(sp_df.head(12), x="sponsor", y="trial_count",
                                         orientation="h", title="Top Sponsors by Trial Count"))
            with col4:
                cond_df = get_top_conditions(filters, limit=15)
                if cond_df.empty:
                    no_data_callout("conditions")
                else:
                    chart_tile(bar_chart(cond_df.head(12), x="condition", y="trial_count",
                                         orientation="h", title="Top MeSH Conditions"))

    # ── Navigation Cards ──────────────────────────────────────────────────────
    st.markdown(
        "<hr style='margin:32px 0 0 0;border:none;border-top:1px solid #E5E7EB;'>",
        unsafe_allow_html=True,
    )
    _section_header(
        "Explore Platform Modules",
        "Navigate to any analysis module using the tabs above or the shortcuts below",
    )
    st.markdown(_NAV_CSS, unsafe_allow_html=True)

    nav_pages = [p for p in PAGES if p["key"] != "home"]
    for i in range(0, len(nav_pages), 3):
        row_pages = nav_pages[i: i + 3]
        # Pad the last row to keep columns consistent
        pad = 3 - len(row_pages)
        cols = st.columns(3)
        for col, p in zip(cols, row_pages):
            with col:
                desc_html = (
                    f'<div class="nav-desc">{p["desc"]}</div>'
                    if p.get("desc") else ""
                )
                st.markdown(
                    f'<div class="nav-card">'
                    f'  <div class="nav-icon-wrap">{p["icon"]}</div>'
                    f'  <div class="nav-body">'
                    f'    <div class="nav-title">{p["label"]}</div>'
                    f'    {desc_html}'
                    f'  </div>'
                    f'  <div class="nav-arrow">›</div>'
                    f'</div>',
                    unsafe_allow_html=True,
                )
        if pad:
            # Consume remaining columns silently (empty cells keep grid uniform)
            for col in cols[3 - pad:]:
                with col:
                    st.empty()
