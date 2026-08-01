"""Convert all upstream Japanese prompt groups to the bundled JSON schema."""

import argparse
import json
from pathlib import Path

import yaml


AUDITED_COMMIT = "d4b37aa4187b40466772b6282d8b28acd5ad77c9"
REPOSITORY = "https://github.com/Physton/sd-webui-prompt-all-in-one"
EXCLUDED_GROUPS = {("人物", "二次元キャラクター")}
EXCLUDED_PRIMARY_CATEGORIES = {"漢服"}


def load_yaml(path):
    # BaseLoader keeps prompt-like scalars such as yes/no/on/off as strings.
    data = yaml.load(path.read_text(encoding="utf-8"), Loader=yaml.BaseLoader)
    if not isinstance(data, list):
        raise ValueError(f"Expected a category list in {path}")
    return data


def convert(source_directory):
    japanese_path = source_directory / "ja_JP.yaml"
    english_path = source_directory / "default.yaml"
    japanese = load_yaml(japanese_path)
    english = load_yaml(english_path)

    if len(japanese) != len(english):
        raise ValueError("Japanese and English primary-category counts differ")

    categories = []
    total_items = 0
    excluded_items = 0
    for category_index, (ja_category, en_category) in enumerate(zip(japanese, english), 1):
        ja_groups = ja_category.get("groups") or []
        en_groups = en_category.get("groups") or []
        if len(ja_groups) != len(en_groups):
            raise ValueError(f"Group count differs in primary category {category_index}")

        for group_index, (ja_group, en_group) in enumerate(zip(ja_groups, en_groups), 1):
            ja_parent = str(ja_category.get("name") or "").strip()
            en_parent = str(en_category.get("name") or "").strip()
            ja_name = str(ja_group.get("name") or "").strip()
            en_name = str(en_group.get("name") or "").strip()
            tag_map = ja_group.get("tags") or {}
            if not isinstance(tag_map, dict):
                raise ValueError(f"Expected tag mapping in category {category_index}/{group_index}")
            if ja_parent in EXCLUDED_PRIMARY_CATEGORIES or (ja_parent, ja_name) in EXCLUDED_GROUPS:
                excluded_items += len(tag_map)
                continue

            items = []
            for prompt, translation in tag_map.items():
                prompt_text = str(prompt).strip()
                if not prompt_text:
                    continue
                items.append(
                    {
                        "prompt": prompt_text,
                        "translation": {"ja": str(translation or "").strip()},
                    }
                )

            total_items += len(items)
            categories.append(
                {
                    "id": f"{category_index:02d}-{group_index:03d}",
                    "parent": {"en": en_parent, "ja": ja_parent},
                    "label": {
                        "en": f"{en_parent} / {en_name}",
                        "ja": f"{ja_parent} / {ja_name}",
                    },
                    "items": items,
                }
            )

    return {
        "source": {
            "repository": REPOSITORY,
            "commit": AUDITED_COMMIT,
            "paths": ["group_tags/default.yaml", "group_tags/ja_JP.yaml"],
            "modified": True,
            "conversion": "Second-level groups flattened into bilingual categories, excluding the configured group list",
            "excludedGroups": ["人物 / 二次元キャラクター", "漢服 / *"],
        },
        "stats": {
            "primaryCategories": len(japanese),
            "categories": len(categories),
            "items": total_items,
            "excludedItems": excluded_items,
        },
        "categories": categories,
    }


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--source-directory", required=True, type=Path)
    parser.add_argument(
        "--output",
        type=Path,
        default=Path(__file__).resolve().parents[1] / "data" / "prompt_examples.json",
    )
    args = parser.parse_args()
    result = convert(args.source_directory)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    with args.output.open("w", encoding="utf-8", newline="\n") as output_file:
        json.dump(result, output_file, ensure_ascii=False, indent=2)
        output_file.write("\n")
    print(
        f"wrote {result['stats']['items']} items in "
        f"{result['stats']['categories']} categories to {args.output}"
    )


if __name__ == "__main__":
    main()
