"""
Orchestrator — the single command for the disease-bucket pipeline.

Runs, in order:
  1. build_condition_mesh_map.py   (Layer 1: raw condition -> MeSH, incremental+cached)
  2. build_mesh_bucket_map.py      (Layer 2: MeSH -> bucket via training/tree/anchors)
  3. compose_bucket_sources.py     (Layer 3: write disease_bucket_mapping + bucket_to_mesh_map)
  4. build_bucket_catalog.py       (existing, unchanged: -> bucket_catalog.json, runtime source)

Add/adjust a disease area by editing catalogs/bucket_definitions.json (a MeSH tree
prefix and/or anchors), then run this. Pass --no-llm to skip the Layer-1 API calls.

Usage:  python backend/scripts/sync_disease_buckets.py [--no-llm]
"""
import sys, subprocess
from pathlib import Path

HERE = Path(__file__).resolve().parent
PY = sys.executable


def run(script: str, *args: str) -> None:
    print(f"\n{'='*70}\n>>> {script} {' '.join(args)}\n{'='*70}")
    r = subprocess.run([PY, str(HERE / script), *args])
    if r.returncode != 0:
        raise SystemExit(f"{script} failed with exit {r.returncode}")


def main() -> None:
    passthru = [a for a in sys.argv[1:] if a in ("--no-llm",)]
    run("build_condition_mesh_map.py", *passthru)
    run("build_mesh_bucket_map.py")
    run("compose_bucket_sources.py")
    run("build_bucket_catalog.py")
    print("\nSync complete. Runtime reads catalogs/bucket_catalog.json.")


if __name__ == "__main__":
    main()
