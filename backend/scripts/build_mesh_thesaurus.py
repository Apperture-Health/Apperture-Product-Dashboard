"""
Cache the MeSH thesaurus from ctgov.mesh_terms into catalogs/mesh_thesaurus.json
so the bucketing scripts don't repeatedly hit the DB.

Output: { downcase_mesh_term: [tree_number, ...] }   (a term may sit in several trees)

Run:  python backend/scripts/build_mesh_thesaurus.py
"""
import sys, json
from pathlib import Path
from collections import defaultdict

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

from utils.db_conn import exec_sql  # noqa: E402

CATALOGS = Path(__file__).resolve().parents[1] / "catalogs"
OUT = CATALOGS / "mesh_thesaurus.json"


def main() -> None:
    df = exec_sql(
        "SELECT DISTINCT downcase_mesh_term, tree_number "
        "FROM ctgov.mesh_terms WHERE tree_number IS NOT NULL",
        "aact",
    )
    term_to_trees: dict[str, set[str]] = defaultdict(set)
    for row in df.itertuples(index=False):
        term = str(row.downcase_mesh_term).strip()
        term_to_trees[term].add(str(row.tree_number).strip())

    result = {t: sorted(v) for t, v in sorted(term_to_trees.items())}
    OUT.write_text(json.dumps(result, ensure_ascii=False, indent=0) + "\n", encoding="utf-8")

    disease = sum(1 for trees in result.values() if any(t.startswith("C") or t.startswith("F03") for t in trees))
    print(f"Wrote {OUT.name}: {len(result)} MeSH terms "
          f"({disease} disease-tree terms under C*/F03*)")


if __name__ == "__main__":
    main()
