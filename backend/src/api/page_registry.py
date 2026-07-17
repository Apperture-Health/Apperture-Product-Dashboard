"""Shared page metadata for backend auth/session and frontend navigation."""

PAGE_MAP: list[tuple[str, str, str]] = [
    ("home", "🏠 Home", "Clinical Trials Intelligence Platform"),
    # Ask the Data is an always-available sidebar feature for non-admin users,
    # not a navigable page or a configurable tab permission.
    ("pipeline", "📈 Pipeline", "Pipeline Landscape"),
    ("drug-detail", "💊 Drug Detail", "Drug Detail"),
    ("drug-pricing", "💰 Drug Pricing", "Drug Pricing"),
    ("market-access", "🏥 Market Access", "Market Access"),
    ("sponsors", "🏢 Sponsors", "Sponsor Benchmark"),
    ("trial-design", "📋 Trial Design", "Trial Design"),
    ("endpoints", "🎯 Endpoints", "Planned Endpoints"),
    ("outcomes", "📊 Outcomes", "Reported Outcomes"),
    ("scores", "🔢 Scores", "Outcome Score Analysis"),
    ("pro-overview", "👤 PRO Overview", "PRO Overview"),
    ("trial-groups", "🗂️ Trial Groups", "Trial Groups"),
    ("safety", "🛡️ Safety", "Safety Analysis"),
    ("real-world-safety", "🌐 Real World Safety", "FAERS Post-Market Safety"),
    ("user-management", "👥 Manage Users", "Manage Users"),
    ("activity-log", "📊 Activity Log", "Activity Log"),
]

PAGE_LABELS = [label for _, label, _ in PAGE_MAP]
PAGE_LABEL_BY_KEY = {key: label for key, label, _ in PAGE_MAP}

# Admin-only tabs: shown ONLY to super-admins, and never mixed with other tabs.
# Both live under the "User Management" nav group. Gating is enforced in
# utils.auth.get_allowed_tabs_for_user (and server-side on every /api/admin/*
# endpoint). Do not add these to any normal user's tab config.
ADMIN_TAB_KEYS = ("user-management", "activity-log")
ADMIN_TAB_LABELS = [label for key, label, _ in PAGE_MAP if key in ADMIN_TAB_KEYS]
ADMIN_TAB_LABEL_SET = set(ADMIN_TAB_LABELS)
