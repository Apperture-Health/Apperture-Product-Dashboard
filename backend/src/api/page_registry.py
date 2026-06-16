"""Shared page metadata for backend auth/session and frontend navigation."""

PAGE_MAP: list[tuple[str, str, str]] = [
    ("home", "🏠 Home", "Clinical Trials Intelligence Platform"),
    ("ask-the-data", "💬 Ask the Data", "AI Query"),
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
]

PAGE_LABELS = [label for _, label, _ in PAGE_MAP]
