"""Shared helpers for the disease-bucket automation scripts."""
import re
from pathlib import Path

CATALOGS = Path(__file__).resolve().parents[1] / "catalogs"

# Free-text → MeSH normalization synonyms (applied token-wise, longest first).
_SYNONYMS = [
    (r"\bcancers?\b", "neoplasms"),
    (r"\bcarcinomas?\b", "neoplasms"),
    (r"\btumou?rs?\b", "neoplasms"),
    (r"\bmalignan(?:t|cy|cies)\b", "neoplasms"),
    (r"\bca\b", "neoplasms"),
]
_STOP = {
    "the", "of", "and", "or", "with", "without", "in", "to", "for", "a", "an",
    "advanced", "metastatic", "recurrent", "refractory", "relapsed", "stage",
    "unresectable", "locally", "adult", "patients", "subjects", "healthy",
    "newly", "diagnosed", "primary", "secondary", "chronic", "acute", "severe",
    "moderate", "mild", "type", "grade", "disease", "disorder", "syndrome",
    # ordinal / therapy-line / staging noise that caused generic false matches
    "first", "second", "third", "fourth", "line", "1l", "2l", "3l", "4l",
    "early", "late", "positive", "negative", "high", "low", "risk",
}


def _is_number(w: str) -> bool:
    return any(ch.isdigit() for ch in w)


def normalize(text: str) -> str:
    """Lowercase, drop parentheticals/punctuation, apply cancer→neoplasms synonyms."""
    t = (text or "").lower().strip()
    t = re.sub(r"\([^)]*\)", " ", t)          # drop (parentheticals)
    t = re.sub(r"[^a-z0-9\s]", " ", t)        # punctuation → space
    for pat, repl in _SYNONYMS:
        t = re.sub(pat, repl, t)
    t = re.sub(r"\s+", " ", t).strip()
    return t


def tokens(text: str) -> set[str]:
    return {w for w in normalize(text).split()
            if w not in _STOP and len(w) > 2 and not _is_number(w)}
