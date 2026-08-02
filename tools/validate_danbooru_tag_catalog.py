from __future__ import annotations

import json
from pathlib import Path

from danbooru_catalog import CatalogError, validate_catalogs


ROOT = Path(__file__).resolve().parents[1]


def main() -> int:
    try:
        ui = json.loads((ROOT / "data" / "danbooru_tag_catalog.json").read_text(encoding="utf-8"))
        full = json.loads((ROOT / "data" / "danbooru_tag_catalog_full.json").read_text(encoding="utf-8"))
        validate_catalogs(ui, full)
        print(f"valid catalog: {ui['stats']['tags']} tags, {ui['stats']['small_categories']} small categories")
        return 0
    except (CatalogError, OSError, json.JSONDecodeError) as exc:
        print(f"invalid catalog: {exc}")
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
