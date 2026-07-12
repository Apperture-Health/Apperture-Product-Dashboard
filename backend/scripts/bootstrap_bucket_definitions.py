"""
One-time bootstrap of the two new source-of-truth files from the CURRENT catalog,
so the automated pipeline starts with zero behavior change:

  bucket_definitions.json     — {bucket: {mesh_tree_prefixes, mesh_anchors, keywords, therapeutic_area}}
                                anchors  = the bucket's existing mesh_terms
                                prefixes = the disease-tree (C*/F03*) tree numbers of those anchors,
                                           reduced to ancestors (a parent prefix covers its children)
  bucket_manual_overrides.json — {raw_condition: bucket}, copied from the existing hand mapping
                                (bucket_catalog conditions). These always win in Layer 3, so every
                                currently-mapped condition keeps its bucket. Trim over time as the
                                MeSH pipeline proves it reproduces them.

Run once:  python backend/scripts/bootstrap_bucket_definitions.py
"""
import sys, json
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

CATALOGS = Path(__file__).resolve().parents[1] / "catalogs"
BUCKET_CATALOG = CATALOGS / "bucket_catalog.json"
THESAURUS = CATALOGS / "mesh_thesaurus.json"
DEFS_OUT = CATALOGS / "bucket_definitions.json"
OVERRIDES_OUT = CATALOGS / "bucket_manual_overrides.json"


def _disease_trees(trees: list[str]) -> list[str]:
    return [t for t in trees if t.startswith("C") or t.startswith("F03")]


def _reduce_to_ancestors(prefixes: set[str]) -> list[str]:
    """Drop any prefix that is a descendant of another present prefix
    (the ancestor already covers it)."""
    out = []
    for p in sorted(prefixes):
        if not any(p != a and p.startswith(a + ".") for a in prefixes):
            out.append(p)
    return sorted(out)


def main() -> None:
    catalog = json.loads(BUCKET_CATALOG.read_text(encoding="utf-8"))
    thes = json.loads(THESAURUS.read_text(encoding="utf-8"))
    thes_lower = {k.lower(): v for k, v in thes.items()}

    definitions: dict[str, dict] = {}
    overrides: dict[str, str] = {}

    for bucket, entry in catalog.items():
        anchors = sorted({m.lower().strip() for m in entry.get("mesh_terms", []) if m.strip()})
        prefixes: set[str] = set()
        for a in anchors:
            prefixes.update(_disease_trees(thes_lower.get(a, [])))
        definitions[bucket] = {
            "mesh_tree_prefixes": _reduce_to_ancestors(prefixes),
            "mesh_anchors": anchors,
            "keywords": [],
            "therapeutic_area": None,
        }
        for cond in entry.get("conditions", []):
            overrides[cond] = bucket

    DEFS_OUT.write_text(json.dumps(definitions, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    OVERRIDES_OUT.write_text(json.dumps(overrides, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    with_prefix = sum(1 for d in definitions.values() if d["mesh_tree_prefixes"])
    with_anchor = sum(1 for d in definitions.values() if d["mesh_anchors"])
    print(f"Wrote {DEFS_OUT.name}: {len(definitions)} buckets "
          f"({with_anchor} with anchors, {with_prefix} with tree prefixes)")
    print(f"Wrote {OVERRIDES_OUT.name}: {len(overrides)} preserved raw->bucket overrides")

    # sanity: flag suspiciously broad prefixes on non-catch-all buckets
    CATCHALL = {"Cancer / Neoplasm", "Other / Unclassified", "Hematologic Malignancy",
                "Lymphoma", "Leukemia", "Sarcoma / Soft Tissue or Bone Tumor"}
    print("\nBuckets with a top-level (<=7 char) prefix — review for over-breadth:")
    for b, d in definitions.items():
        broad = [p for p in d["mesh_tree_prefixes"] if len(p) <= 7]
        if broad and b not in CATCHALL:
            print(f"  {b:45} {broad}")


if __name__ == "__main__":
    main()
