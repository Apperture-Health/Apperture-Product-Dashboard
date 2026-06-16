"""
Data access wrapper for the FastAPI backend.
"""
from __future__ import annotations

import pandas as pd

from utils.runtime import runtime as st
from utils.db_conn import exec_sql, get_engine  # noqa: F401
from config.settings import DB_AACT, DB_DRUGS, DB_PRICING, DB_MARKET_ACCESS, DB_FDAERS


@st.cache_data(ttl=300, show_spinner=False)
def query_aact(sql: str, params: dict | None = None) -> pd.DataFrame:
    return exec_sql(sql, DB_AACT, params)


@st.cache_data(ttl=600, show_spinner=False)
def query_drugs(sql: str, params: dict | None = None) -> pd.DataFrame:
    return exec_sql(sql, DB_DRUGS, params)


@st.cache_data(ttl=900, show_spinner=False)
def query_aact_ae(sql: str, params: dict | None = None) -> pd.DataFrame:
    return exec_sql(sql, DB_AACT, params, timeout_s=300)


def query_aact_uncached(sql: str, params: dict | None = None) -> pd.DataFrame:
    return exec_sql(sql, DB_AACT, params)


@st.cache_data(ttl=300, show_spinner=False)
def query_pricing(sql: str, params: dict | None = None) -> pd.DataFrame:
    return exec_sql(sql, DB_PRICING, params)


@st.cache_data(ttl=300, show_spinner=False)
def query_market_access(sql: str, params: dict | None = None) -> pd.DataFrame:
    return exec_sql(sql, DB_MARKET_ACCESS, params)


@st.cache_data(ttl=900, show_spinner=False)
def query_fdaers(sql: str, params: dict | None = None) -> pd.DataFrame:
    return exec_sql(sql, DB_FDAERS, params, timeout_s=300)
