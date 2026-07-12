"""
Layer 2 — assign each MeSH term to its bucket.

Cascade per MeSH term (first match wins):
  1. TRAINING vote: the existing hand mapping (bucket_manual_overrides) composed with
     Layer 1 (condition_to_mesh) tells us which bucket each MeSH term historically
     belongs to. A clear majority wins — this reproduces the current taxonomy.
  2. anchor: the term is listed in a bucket's mesh_anchors.
  3. tree-prefix: the term's MeSH tree number starts with a bucket's mesh_tree_prefix
     (LONGEST prefix wins → most-specific bucket). Generalizes to NEW terms.
  4. keyword substring.
  5. else -> unresolved (review).

Inputs:  bucket_definitions.json, bucket_manual_overrides.json, condition_to_mesh.json,
         mesh_thesaurus.json, and drug_indications2.indication_mesh (DB).
Outputs: mesh_to_bucket.json, and mesh_bucket_review.json for unresolved terms.

Usage:  python backend/scripts/build_mesh_bucket_map.py
"""
import sys, json
from pathlib import Path
from collections import defaultdict, Counter

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))
from _bucket_common import CATALOGS  # noqa: E402
from utils.db_conn import exec_sql  # noqa: E402

DEFS = CATALOGS / "bucket_definitions.json"
OVERRIDES = CATALOGS / "bucket_manual_overrides.json"
MESH_OVERRIDES = CATALOGS / "mesh_manual_overrides.json"
COND_MESH = CATALOGS / "condition_to_mesh.json"
THESAURUS = CATALOGS / "mesh_thesaurus.json"
OUT = CATALOGS / "mesh_to_bucket.json"
REVIEW = CATALOGS / "mesh_bucket_review.json"

TRAIN_MIN_VOTES = 2
TRAIN_MIN_SHARE = 0.60


def drug_mesh_terms() -> set[str]:
    df = exec_sql("SELECT DISTINCT LOWER(indication_mesh) m FROM public.drug_indications2 "
                  "WHERE indication_mesh IS NOT NULL", "drugs")
    return {str(x).strip() for x in df["m"] if str(x).strip()}


def main() -> None:
    defs = json.loads(DEFS.read_text(encoding="utf-8"))
    overrides = json.loads(OVERRIDES.read_text(encoding="utf-8"))
    mesh_overrides = {k.lower().strip(): v for k, v in
                      json.loads(MESH_OVERRIDES.read_text(encoding="utf-8")).items()} \
        if MESH_OVERRIDES.exists() else {}
    cond_mesh = json.loads(COND_MESH.read_text(encoding="utf-8"))
    thes = {k.lower(): v for k, v in json.loads(THESAURUS.read_text(encoding="utf-8")).items()}

    # ── training votes: mesh_term -> Counter(bucket) via overrides ∘ condition_to_mesh
    votes: dict[str, Counter] = defaultdict(Counter)
    for raw_cond, bucket in overrides.items():
        entry = cond_mesh.get(raw_cond.strip().lower())
        if not entry:
            continue
        for m in entry.get("mesh", []):
            votes[m.lower().strip()][bucket] += 1

    def train_bucket(term: str):
        c = votes.get(term)
        if not c:
            return None
        bucket, n = c.most_common(1)[0]
        if n >= TRAIN_MIN_VOTES and n / sum(c.values()) >= TRAIN_MIN_SHARE:
            return bucket
        return None

    # ── anchor + prefix + keyword indexes from bucket_definitions
    anchor_to_bucket: dict[str, str] = {}
    prefix_pairs: list[tuple[str, str]] = []   # (tree_prefix, bucket)
    keyword_pairs: list[tuple[str, str]] = []
    for bucket, d in defs.items():
        for a in d.get("mesh_anchors", []):
            anchor_to_bucket.setdefault(a.lower().strip(), bucket)
        for p in d.get("mesh_tree_prefixes", []):
            prefix_pairs.append((p, bucket))
        for k in d.get("keywords", []):
            keyword_pairs.append((k.lower().strip(), bucket))

    def prefix_bucket(term: str):
        trees = thes.get(term, [])
        best_len, best_bucket = -1, None
        for tree in trees:
            for pfx, bucket in prefix_pairs:
                if (tree == pfx or tree.startswith(pfx + ".")) and len(pfx) > best_len:
                    best_len, best_bucket = len(pfx), bucket
        return best_bucket

    def keyword_bucket(term: str):
        for kw, bucket in keyword_pairs:
            if kw and kw in term:
                return bucket
        return None

    # ── universe of MeSH terms to place
    terms: set[str] = set()
    for entry in cond_mesh.values():
        terms |= {m.lower().strip() for m in entry.get("mesh", [])}
    terms |= drug_mesh_terms()
    terms |= set(anchor_to_bucket)

    result: dict[str, str] = {}
    review: dict[str, list[str]] = {}
    stats = Counter()
    for term in sorted(terms):
        # Precedence: hand-curated mesh override (authoritative, preserves drug-side
        # brand resolution) > training vote > anchor > tree-prefix > keyword.
        if term in mesh_overrides:
            result[term] = mesh_overrides[term]
            stats["override"] += 1
            continue
        b = train_bucket(term) or anchor_to_bucket.get(term) or prefix_bucket(term) or keyword_bucket(term)
        if b:
            result[term] = b
            method = ("training" if train_bucket(term) else
                      "anchor" if anchor_to_bucket.get(term) else
                      "tree-prefix" if prefix_bucket(term) else "keyword")
            stats[method] += 1
        else:
            review[term] = [f"{bk}:{n}" for bk, n in votes.get(term, Counter()).most_common(3)]
            stats["unresolved"] += 1

    OUT.write_text(json.dumps(dict(sorted(result.items())), ensure_ascii=False, indent=0) + "\n", encoding="utf-8")
    REVIEW.write_text(json.dumps(dict(sorted(review.items())), ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Wrote {OUT.name}: {len(result)} MeSH terms bucketed")
    print(f"  by method: {dict(stats)}")
    print(f"Wrote {REVIEW.name}: {len(review)} unresolved MeSH terms")


if __name__ == "__main__":
    main()
