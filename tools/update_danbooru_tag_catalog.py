from __future__ import annotations

import argparse
import json
from pathlib import Path

from danbooru_catalog import CatalogError, DanbooruClient, atomic_write_outputs, build_catalog


ROOT = Path(__file__).resolve().parents[1]


def main() -> int:
    parser = argparse.ArgumentParser(description="Update the bundled catalog from the official Danbooru API")
    parser.add_argument("--refresh", action="store_true", help="Ignore cached API responses")
    parser.add_argument("--taxonomy", type=Path, default=ROOT / "data" / "danbooru_taxonomy.json")
    parser.add_argument("--legacy", type=Path, default=ROOT / "data" / "prompt_examples.json")
    parser.add_argument("--cache-dir", type=Path, default=ROOT / ".cache" / "danbooru")
    args = parser.parse_args()
    try:
        taxonomy = json.loads(args.taxonomy.read_text(encoding="utf-8"))
        legacy = json.loads(args.legacy.read_text(encoding="utf-8"))
        client = DanbooruClient(args.cache_dir, refresh=args.refresh)
        ui, full, markdown = build_catalog(taxonomy, legacy, client)
        atomic_write_outputs({
            ROOT / "data" / "danbooru_tag_catalog.json": json.dumps(ui, ensure_ascii=False, indent=2) + "\n",
            ROOT / "data" / "danbooru_tag_catalog_full.json": json.dumps(full, ensure_ascii=False, indent=2) + "\n",
            ROOT / "docs" / "danbooru_tag_catalog.md": markdown,
        })
        print(f"wrote {ui['stats']['tags']} tags in {ui['stats']['small_categories']} small categories")
        return 0
    except (CatalogError, OSError, json.JSONDecodeError) as exc:
        print(f"update failed; existing completed catalogs were preserved: {exc}")
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
