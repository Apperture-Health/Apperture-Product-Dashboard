"""
Build `catalogs/bucket_catalog.json` — the single, bucket-keyed source of truth
for disease-area buckets. Merges the two legacy catalogs so a bucket's trial
*conditions* and drug *MeSH terms* can never drift apart again:

  { "<bucket>": { "conditions": [...], "mesh_terms": [...] } }

Sources (kept on disk as artifacts):
  - disease_bucket_mapping.json : { raw_condition: bucket }
  - bucket_to_mesh_map.json     : { bucket: [mesh_term, ...] }

Exact original strings are preserved (condition casing matters: consumers do
exact-key lookups and lowercase only at query time).

Usage:
    python scripts/build_bucket_catalog.py
"""
from __future__ import annotations

import json
from collections import defaultdict
from pathlib import Path

CATALOGS = Path(__file__).resolve().parents[1] / "catalogs"
DISEASE_MAP_PATH = CATALOGS / "disease_bucket_mapping.json"
MESH_MAP_PATH = CATALOGS / "bucket_to_mesh_map.json"
OUT_PATH = CATALOGS / "bucket_catalog.json"


def main() -> None:
    condition_to_bucket: dict[str, str] = json.loads(DISEASE_MAP_PATH.read_text(encoding="utf-8"))
    bucket_to_mesh: dict[str, list[str]] = json.loads(MESH_MAP_PATH.read_text(encoding="utf-8"))

    # Invert {condition: bucket} → {bucket: [conditions]}, preserving order,
    # de-duplicated within a bucket.
    bucket_to_conditions: dict[str, list[str]] = defaultdict(list)
    for condition, bucket in condition_to_bucket.items():
        if condition not in bucket_to_conditions[bucket]:
            bucket_to_conditions[bucket].append(condition)

    cond_buckets = set(bucket_to_conditions)
    mesh_buckets = set(bucket_to_mesh)
    all_buckets = sorted(cond_buckets | mesh_buckets)

    catalog = {
        bucket: {
            "conditions": bucket_to_conditions.get(bucket, []),
            "mesh_terms": bucket_to_mesh.get(bucket, []),
        }
        for bucket in all_buckets
    }

    OUT_PATH.write_text(
        json.dumps(catalog, indent=2, ensure_ascii=False) + "\n", encoding="utf-8"
    )

    # ── Reconciliation summary ────────────────────────────────────────────────
    total_conditions = sum(len(v["conditions"]) for v in catalog.values())
    total_mesh = sum(len(v["mesh_terms"]) for v in catalog.values())
    print(f"Wrote {OUT_PATH.name}: {len(catalog)} buckets")
    print(f"  conditions: {total_conditions} (source {len(condition_to_bucket)})")
    print(f"  mesh_terms: {total_mesh}")
    only_cond = sorted(cond_buckets - mesh_buckets)
    only_mesh = sorted(mesh_buckets - cond_buckets)
    print(f"  buckets only in conditions source: {only_cond or 'none'}")
    print(f"  buckets only in mesh source: {only_mesh or 'none'}")


if __name__ == "__main__":
    main()
