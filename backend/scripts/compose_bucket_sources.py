"""
Layer 3 — compose the two files the existing build_bucket_catalog.py consumes:

  disease_bucket_mapping.json  = {raw_condition: bucket}
      bucket_manual_overrides (existing hand mapping) ALWAYS WIN; every other
      drug_trials condition is placed via condition_to_mesh ∘ mesh_to_bucket.
  bucket_to_mesh_map.json      = {bucket: [mesh_term, ...]}   (mesh_to_bucket inverted)

Then the caller runs build_bucket_catalog.py (unchanged) to merge them into
bucket_catalog.json, which is all the app reads at runtime.

Usage:  python backend/scripts/compose_bucket_sources.py
"""
import sys, json
from pathlib import Path
from collections import defaultdict, Counter

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))
from _bucket_common import CATALOGS  # noqa: E402

OVERRIDES = CATALOGS / "bucket_manual_overrides.json"
COND_MESH = CATALOGS / "condition_to_mesh.json"
MESH_BUCKET = CATALOGS / "mesh_to_bucket.json"
DISEASE_MAP_OUT = CATALOGS / "disease_bucket_mapping.json"
BUCKET_MESH_OUT = CATALOGS / "bucket_to_mesh_map.json"
UNPLACED_OUT = CATALOGS / "condition_unplaced.json"


def main() -> None:
    overrides = json.loads(OVERRIDES.read_text(encoding="utf-8"))
    cond_mesh = json.loads(COND_MESH.read_text(encoding="utf-8"))
    mesh_bucket = {k.lower(): v for k, v in json.loads(MESH_BUCKET.read_text(encoding="utf-8")).items()}

    raw_to_bucket: dict[str, str] = {}
    # 1) overrides win (keep original casing/keys)
    for cond, bucket in overrides.items():
        raw_to_bucket[cond] = bucket
    override_lc = {c.strip().lower() for c in overrides}

    # 2) every other condition via mesh -> bucket (majority across its mesh terms)
    stats = Counter()
    unplaced: list[str] = []
    for cond, entry in cond_mesh.items():
        if cond.strip().lower() in override_lc:
            stats["override"] += 1
            continue
        buckets = Counter()
        for m in entry.get("mesh", []):
            b = mesh_bucket.get(m.lower().strip())
            if b:
                buckets[b] += 1
        if buckets:
            raw_to_bucket[cond] = buckets.most_common(1)[0][0]
            stats["auto"] += 1
        else:
            unplaced.append(cond)
            stats["unplaced"] += 1

    # bucket_to_mesh_map = invert mesh_to_bucket
    bucket_to_mesh: dict[str, set] = defaultdict(set)
    for mesh, bucket in mesh_bucket.items():
        bucket_to_mesh[bucket].add(mesh)

    DISEASE_MAP_OUT.write_text(
        json.dumps(dict(sorted(raw_to_bucket.items())), ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    BUCKET_MESH_OUT.write_text(
        json.dumps({b: sorted(m) for b, m in sorted(bucket_to_mesh.items())}, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8")
    UNPLACED_OUT.write_text(json.dumps(sorted(unplaced), ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    print(f"Wrote {DISEASE_MAP_OUT.name}: {len(raw_to_bucket)} raw->bucket")
    print(f"  composition: {dict(stats)}")
    print(f"Wrote {BUCKET_MESH_OUT.name}: {len(bucket_to_mesh)} buckets with mesh terms")
    print(f"Wrote {UNPLACED_OUT.name}: {len(unplaced)} conditions with no bucket (unchanged from today's behavior)")


if __name__ == "__main__":
    main()
