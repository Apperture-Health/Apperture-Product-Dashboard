"""
Build `catalogs/bucket_to_mesh_map.json` — a best-effort mapping from each
sidebar disease-area *bucket* (display label) to the MeSH terms used in the
drugs DB table `public.drug_indications2.indication_mesh`.

The MeSH vocabulary is taken from the keys of `mesh_to_indication_map.json`
(the same `ctgov.browse_conditions` MeSH terms expected in `indication_mesh`).
Each MeSH term is assigned to a bucket by:

  (a) direct lookup of the term in `disease_bucket_mapping.json`
      (raw_condition -> bucket, case-insensitive); else
  (b) mapping each of the term's `indication_name` values through
      `disease_bucket_mapping.json`; the majority bucket wins.

MeSH terms with no confident bucket are written to the "unmapped" report so a
human can hand-correct the output. This is a one-off generator — commit both
this script and its JSON output.

Usage:
    python scripts/build_bucket_to_mesh_map.py
"""
from __future__ import annotations

import json
from collections import Counter, defaultdict
from pathlib import Path

CATALOGS = Path(__file__).resolve().parents[1] / "catalogs"
MESH_MAP_PATH = CATALOGS / "mesh_to_indication_map.json"
BUCKET_MAP_PATH = CATALOGS / "disease_bucket_mapping.json"
OUT_PATH = CATALOGS / "bucket_to_mesh_map.json"
UNMAPPED_PATH = CATALOGS / "bucket_to_mesh_unmapped.json"

# Hand-reviewed overrides for MeSH terms the automatic derivation cannot place
# (their indication_name values are not present in disease_bucket_mapping.json).
# { mesh_term: bucket_display_label }
MANUAL_OVERRIDES: dict[str, str] = {
    "dendritic cell sarcoma, interdigitating": "Hematologic Malignancy",
    "leukemia, myelomonocytic, juvenile": "Leukemia",
}


def _bucket_for_mesh(
    mesh_term: str,
    indication_names: list[str],
    raw_to_bucket_lower: dict[str, str],
) -> str | None:
    """Resolve the best bucket for a single MeSH term (see module docstring)."""
    # (a) the MeSH term is itself a known raw condition
    direct = raw_to_bucket_lower.get(mesh_term.lower().strip())
    if direct:
        return direct
    # (b) majority vote across the term's FDA-label indication names
    votes = Counter(
        raw_to_bucket_lower[i.lower().strip()]
        for i in indication_names
        if i.lower().strip() in raw_to_bucket_lower
    )
    if votes:
        return votes.most_common(1)[0][0]
    return None


def main() -> None:
    mesh_map: dict[str, list[str]] = json.loads(MESH_MAP_PATH.read_text(encoding="utf-8"))
    raw_to_bucket: dict[str, str] = json.loads(BUCKET_MAP_PATH.read_text(encoding="utf-8"))
    raw_to_bucket_lower = {k.lower().strip(): v for k, v in raw_to_bucket.items()}
    all_buckets = sorted(set(raw_to_bucket.values()))

    bucket_to_mesh: dict[str, set[str]] = defaultdict(set)
    unmapped: dict[str, list[str]] = {}

    for mesh_term, indication_names in mesh_map.items():
        bucket = MANUAL_OVERRIDES.get(mesh_term.lower().strip()) or _bucket_for_mesh(
            mesh_term, indication_names, raw_to_bucket_lower
        )
        if bucket is None:
            unmapped[mesh_term] = indication_names
            continue
        bucket_to_mesh[bucket].add(mesh_term)

    # Emit every bucket key (even those with no MeSH terms) so the file is a
    # complete, reviewable manifest of the 113 buckets.
    result = {b: sorted(bucket_to_mesh.get(b, set())) for b in all_buckets}

    OUT_PATH.write_text(json.dumps(result, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    UNMAPPED_PATH.write_text(json.dumps(unmapped, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")

    mapped_buckets = sum(1 for v in result.values() if v)
    print(f"Wrote {OUT_PATH.name}: {len(result)} buckets ({mapped_buckets} with >=1 MeSH term)")
    print(f"Wrote {UNMAPPED_PATH.name}: {len(unmapped)} MeSH terms need hand-mapping")
    if unmapped:
        for m in unmapped:
            print(f"  UNMAPPED: {m}")


if __name__ == "__main__":
    main()
