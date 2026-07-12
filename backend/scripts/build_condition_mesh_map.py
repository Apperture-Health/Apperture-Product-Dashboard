"""
Layer 1 — map raw free-text trial conditions to MeSH terms (our OWN mapping;
does NOT use ctgov.browse_conditions).

Universe: distinct conditions of trials in public.drug_trials (plus any conditions
already present in bucket_manual_overrides, so existing buckets also get MeSH signal).

Cascade per condition:
  1. exact normalized match to the MeSH thesaurus
  2. conservative fuzzy match (token Jaccard) against disease-tree MeSH terms
  3. LLM fallback (gpt-4.1-mini, batched, JSON) constrained to candidate MeSH terms
Everything is cached in condition_to_mesh.json; re-runs only classify NEW conditions.

Usage:
  python backend/scripts/build_condition_mesh_map.py            # full (with LLM)
  python backend/scripts/build_condition_mesh_map.py --no-llm   # deterministic only (measure)
  python backend/scripts/build_condition_mesh_map.py --limit 200
"""
import sys, json, argparse, difflib
from pathlib import Path
from collections import defaultdict

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))
from _bucket_common import CATALOGS, normalize, tokens  # noqa: E402
from utils.db_conn import exec_sql  # noqa: E402
from utils.runtime import runtime  # noqa: E402

THESAURUS = CATALOGS / "mesh_thesaurus.json"
OVERRIDES = CATALOGS / "bucket_manual_overrides.json"
OUT = CATALOGS / "condition_to_mesh.json"

FUZZY_MIN_JACCARD = 0.6
LLM_MODEL = "gpt-4.1-mini"
LLM_BATCH = 40
CANDIDATE_K = 12


def load_conditions() -> list[str]:
    df = exec_sql(
        "SELECT DISTINCT c.downcase_name FROM ctgov.conditions c "
        "WHERE c.nct_id IN (SELECT DISTINCT nct_id FROM public.drug_trials) "
        "AND c.downcase_name IS NOT NULL",
        "aact",
    )
    conds = {str(x).strip() for x in df["downcase_name"] if str(x).strip()}
    if OVERRIDES.exists():
        conds |= {c.strip().lower() for c in json.loads(OVERRIDES.read_text(encoding="utf-8"))}
    return sorted(conds)


def build_index(thes: dict[str, list[str]]):
    """Disease-tree MeSH terms + token inverted index + normalized→term map."""
    disease = {t for t, trees in thes.items()
               if any(x.startswith("C") or x.startswith("F03") for x in trees)}
    norm_to_term: dict[str, str] = {}
    inverted: dict[str, set[str]] = defaultdict(set)
    term_tokens: dict[str, set[str]] = {}
    for term in disease:
        norm_to_term.setdefault(normalize(term), term)
        tk = tokens(term)
        term_tokens[term] = tk
        for w in tk:
            inverted[w].add(term)
    return disease, norm_to_term, inverted, term_tokens


def fuzzy_match(cond, inverted, term_tokens):
    ctk = tokens(cond)
    if not ctk:
        return None, 0.0, []
    cands: set[str] = set()
    for w in ctk:
        cands |= inverted.get(w, set())
    if not cands:
        return None, 0.0, []

    ncond = normalize(cond)
    # (1) Subset match: a MeSH term whose every token appears in the condition is a
    # strong hit (condition = that disease + modifiers). Prefer the MOST specific
    # (most tokens); tie-break by string similarity. This is the primary signal.
    subset = [t for t in cands if term_tokens[t] and term_tokens[t] <= ctk]
    if subset:
        best = max(subset, key=lambda t: (len(term_tokens[t]),
                                          difflib.SequenceMatcher(None, ncond, normalize(t)).ratio()))
        return best, 1.0, _rank_candidates(cands, ctk, ncond, term_tokens)

    # (2) Otherwise fall back to Jaccard threshold on the best-scoring candidate.
    scored = []
    for term in cands:
        ttk = term_tokens[term]
        jac = len(ctk & ttk) / len(ctk | ttk) if (ctk | ttk) else 0.0
        ratio = difflib.SequenceMatcher(None, ncond, normalize(term)).ratio()
        scored.append((0.7 * jac + 0.3 * ratio, jac, term))
    scored.sort(reverse=True)
    best_score, best_jac, best_term = scored[0]
    return (best_term if best_jac >= FUZZY_MIN_JACCARD else None), best_score, \
        [t for _, _, t in scored[:CANDIDATE_K]]


def _rank_candidates(cands, ctk, ncond, term_tokens):
    scored = []
    for term in cands:
        ttk = term_tokens[term]
        jac = len(ctk & ttk) / len(ctk | ttk) if (ctk | ttk) else 0.0
        scored.append((jac, term))
    scored.sort(reverse=True)
    return [t for _, t in scored[:CANDIDATE_K]]


def llm_classify(batch: list[tuple[str, list[str]]]) -> dict[str, str | None]:
    import openai
    key = runtime.secrets.get("openai_api_key", "")
    if not key:
        raise RuntimeError("OpenAI API key not configured")
    client = openai.OpenAI(api_key=key)
    lines = [f'{i+1}. "{c}"  candidates: {cands}' for i, (c, cands) in enumerate(batch)]
    system = (
        "You map clinical-trial condition strings to the single best MeSH term. "
        "For each numbered item, choose the MeSH term from its candidate list that best "
        "represents the condition's disease. If none fit, return null. "
        "Return a JSON object {\"results\": [{\"n\": <number>, \"mesh\": <term or null>}]}. "
        "Only use a term from that item's candidate list."
    )
    resp = client.chat.completions.create(
        model=LLM_MODEL, temperature=0, response_format={"type": "json_object"},
        messages=[{"role": "system", "content": system},
                  {"role": "user", "content": "\n".join(lines)}],
    )
    data = json.loads(resp.choices[0].message.content)
    out: dict[str, str | None] = {}
    for r in data.get("results", []):
        idx = int(r.get("n", 0)) - 1
        if 0 <= idx < len(batch):
            m = r.get("mesh")
            cond, cands = batch[idx]
            out[cond] = m if (m in cands) else None
    return out


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--no-llm", action="store_true")
    ap.add_argument("--limit", type=int, default=0)
    args = ap.parse_args()

    thes = json.loads(THESAURUS.read_text(encoding="utf-8"))
    cache = json.loads(OUT.read_text(encoding="utf-8")) if OUT.exists() else {}
    conditions = load_conditions()
    if args.limit:
        conditions = conditions[: args.limit]

    disease, norm_to_term, inverted, term_tokens = build_index(thes)

    def needs_work(c: str) -> bool:
        if c not in cache:
            return True
        # retry unresolved-with-candidates once the LLM is enabled
        e = cache[c]
        return (not args.no_llm) and e.get("method") == "unresolved" \
            and bool(e.get("candidates")) and not e.get("llm_tried")

    todo = [c for c in conditions if needs_work(c)]
    print(f"conditions: {len(conditions)} | reusing cache: {len(conditions)-len(todo)} | to classify: {len(todo)}")

    stats = defaultdict(int)
    llm_pending: list[tuple[str, list[str]]] = []
    for cond in todo:
        exact = norm_to_term.get(normalize(cond))
        if exact:
            cache[cond] = {"mesh": [exact], "method": "exact"}
            stats["exact"] += 1
            continue
        term, score, cands = fuzzy_match(cond, inverted, term_tokens)
        if term:
            cache[cond] = {"mesh": [term], "method": "fuzzy", "score": round(score, 3)}
            stats["fuzzy"] += 1
        elif args.no_llm or not cands:
            cache[cond] = {"mesh": [], "method": "unresolved", "candidates": cands[:5]}
            stats["unresolved"] += 1
        else:
            llm_pending.append((cond, cands))

    if llm_pending and not args.no_llm:
        print(f"LLM classifying {len(llm_pending)} conditions in batches of {LLM_BATCH}...")
        for i in range(0, len(llm_pending), LLM_BATCH):
            batch = llm_pending[i:i + LLM_BATCH]
            try:
                res = llm_classify(batch)
            except Exception as e:
                print(f"  batch {i//LLM_BATCH} failed: {e}")
                res = {}
            for cond, cands in batch:
                m = res.get(cond)
                if m:
                    cache[cond] = {"mesh": [m], "method": "llm"}
                    stats["llm"] += 1
                else:
                    cache[cond] = {"mesh": [], "method": "unresolved",
                                   "candidates": cands[:5], "llm_tried": True}
                    stats["unresolved"] += 1
            print(f"  ...{min(i+LLM_BATCH, len(llm_pending))}/{len(llm_pending)}")

    OUT.write_text(json.dumps(cache, ensure_ascii=False, indent=0) + "\n", encoding="utf-8")
    resolved = sum(1 for c in conditions if cache.get(c, {}).get("mesh"))
    print(f"\nWrote {OUT.name}: {len(cache)} cached")
    print(f"  this run: {dict(stats)}")
    print(f"  resolved (>=1 mesh): {resolved}/{len(conditions)} ({100*resolved/len(conditions):.1f}%)")


if __name__ == "__main__":
    main()
