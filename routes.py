import asyncio
import html
import json
import os
import re
import tempfile
import time
import unicodedata
from collections import OrderedDict, defaultdict, deque
from pathlib import Path
from urllib.parse import urlparse

MAX_REQUEST_BYTES = 64 * 1024
MAX_CATALOG_BYTES = 4 * 1024 * 1024
MAX_CATALOG_CATEGORIES = 500
MAX_CATALOG_TAGS = 10_000
MAX_TAG_SETS = 500
MAX_TAG_SET_TAGS = 100
MAX_TEXT_LENGTH = 8_000
MAX_BATCH_SIZE = 100
CACHE_LIMIT = 512
RATE_LIMIT = 30
RATE_WINDOW_SECONDS = 60

_CACHE = OrderedDict()
_RATE_BUCKETS = defaultdict(deque)
_REMOTE_SEMAPHORE = asyncio.Semaphore(3)
_ROUTES_REGISTERED = False
SUPPORTED_PROVIDERS = {"local", "offline", "libretranslate", "deepl", "openai"}
MYMEMORY_URL = "https://api.mymemory.translated.net/get"
_DICTIONARY_CACHE_SIGNATURE = None
_DICTIONARY_CACHE_VALUE = {}


class TranslationError(RuntimeError):
    pass


def _translation_lookup_key(value):
    text = unicodedata.normalize("NFKC", str(value or "")).strip()
    weighted = re.fullmatch(
        r"\(\s*(.+?)\s*:\s*[+-]?(?:\d+(?:\.\d*)?|\.\d+)\s*\)",
        text,
    )
    if weighted:
        text = weighted.group(1).strip()
    text = re.sub(r"[_\s]+", " ", text)
    return text.casefold().strip()


def _iter_catalog_translations(value):
    if isinstance(value, list):
        for item in value:
            yield from _iter_catalog_translations(item)
        return
    if not isinstance(value, dict):
        return

    prompt = value.get("prompt") or value.get("name")
    translation = value.get("translation_ja") or value.get("ja")
    if not translation and isinstance(value.get("translation"), dict):
        translation = value["translation"].get("ja")
    if isinstance(prompt, str) and isinstance(translation, str) and translation.strip():
        aliases = value.get("aliases") if isinstance(value.get("aliases"), list) else []
        yield prompt, translation.strip(), aliases

    for child in value.values():
        if isinstance(child, (dict, list)):
            yield from _iter_catalog_translations(child)


def _dictionary_paths(requested_name="", storage_directory=None):
    data_directory = Path(__file__).with_name("data")
    paths = [
        data_directory / "tag_catalog.json",
        data_directory / "translations.json",
    ]
    if requested_name:
        paths.append(user_catalog_path(requested_name, storage_directory))
    return paths


def _dictionary_signature(requested_name="", storage_directory=None):
    return tuple(
        (str(path), path.stat().st_mtime_ns, path.stat().st_size)
        for path in _dictionary_paths(requested_name, storage_directory)
        if path.is_file()
    )


def _load_dictionary(requested_name="", storage_directory=None):
    global _DICTIONARY_CACHE_SIGNATURE, _DICTIONARY_CACHE_VALUE

    paths = _dictionary_paths()
    signature = _dictionary_signature()
    if signature == _DICTIONARY_CACHE_SIGNATURE:
        dictionary = _DICTIONARY_CACHE_VALUE
    else:
        dictionary = {"ja": {}, "en": {}}
        for path in paths[:1]:
            try:
                data = json.loads(path.read_text(encoding="utf-8"))
            except (OSError, json.JSONDecodeError):
                continue
            for prompt, translation, aliases in _iter_catalog_translations(data):
                canonical_key = _translation_lookup_key(prompt)
                if not canonical_key:
                    continue
                dictionary["ja"][canonical_key] = translation
                dictionary["en"][_translation_lookup_key(translation)] = prompt
                for alias in aliases:
                    alias_key = _translation_lookup_key(alias)
                    if alias_key:
                        dictionary["ja"][alias_key] = translation

        explicit_path = paths[1]
        try:
            explicit = json.loads(explicit_path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            explicit = {}
        if isinstance(explicit, dict):
            for language, table in explicit.items():
                if not isinstance(language, str) or not isinstance(table, dict):
                    continue
                normalized_table = dictionary.setdefault(language.casefold(), {})
                for source, translated in table.items():
                    key = _translation_lookup_key(source)
                    if key and isinstance(translated, str) and translated.strip():
                        normalized_table[key] = translated.strip()

        _DICTIONARY_CACHE_SIGNATURE = signature
        _DICTIONARY_CACHE_VALUE = dictionary
    if requested_name:
        dictionary = {language: table.copy() for language, table in dictionary.items()}
        catalog = load_examples_catalog(
            requested_name=requested_name,
            storage_directory=storage_directory,
        )
        for prompt, translation, aliases in _iter_catalog_translations(catalog):
            canonical_key = _translation_lookup_key(prompt)
            if not canonical_key:
                continue
            dictionary.setdefault("ja", {})[canonical_key] = translation
            dictionary.setdefault("en", {})[_translation_lookup_key(translation)] = prompt
            for alias in aliases:
                alias_key = _translation_lookup_key(alias)
                if alias_key:
                    dictionary["ja"][alias_key] = translation
    return dictionary


def catalog_storage_directory(base_directory=None):
    if base_directory is not None:
        return Path(base_directory)
    try:
        import folder_paths

        user_directory = Path(folder_paths.get_user_directory())
    except (ImportError, AttributeError):
        user_directory = Path(__file__).with_name("user_data")
    return user_directory / "prompt_workbench" / "tag_catalogs"


def tag_set_storage_directory(base_directory=None):
    if base_directory is not None:
        return Path(base_directory)
    try:
        import folder_paths

        user_directory = Path(folder_paths.get_user_directory())
    except (ImportError, AttributeError):
        user_directory = Path(__file__).with_name("user_data")
    return user_directory / "prompt_workbench" / "tag_sets"


def normalize_catalog_name(value):
    name = unicodedata.normalize("NFKC", str(value or "")).strip()
    if name.lower().endswith(".json"):
        name = name[:-5].rstrip()
    if not name or len(name) > 64 or not re.fullmatch(r"[\w -]+", name, flags=re.UNICODE):
        raise ValueError("Catalog name must use letters, numbers, spaces, hyphens, or underscores")
    if name.rstrip(" .").upper() in {
        "CON", "PRN", "AUX", "NUL", "COM1", "COM2", "COM3", "COM4", "COM5",
        "COM6", "COM7", "COM8", "COM9", "LPT1", "LPT2", "LPT3", "LPT4",
        "LPT5", "LPT6", "LPT7", "LPT8", "LPT9",
    }:
        raise ValueError("Catalog name is reserved by Windows")
    return name


def user_catalog_path(name, storage_directory=None):
    safe_name = normalize_catalog_name(name)
    directory = catalog_storage_directory(storage_directory).resolve()
    target = (directory / f"{safe_name}.json").resolve()
    if target.parent != directory:
        raise ValueError("Catalog path is outside the storage directory")
    return target


def user_tag_set_path(name, storage_directory=None):
    safe_name = normalize_catalog_name(name)
    directory = tag_set_storage_directory(storage_directory).resolve()
    target = (directory / f"{safe_name}.json").resolve()
    if target.parent != directory:
        raise ValueError("Tag set path is outside the storage directory")
    return target


def default_examples_path(data_directory=None):
    data_directory = Path(data_directory) if data_directory is not None else Path(__file__).with_name("data")
    return data_directory / "tag_catalog.json"


DEFAULT_TAG_SETS_CATALOG = {
    "schema_version": 1,
    "major_categories": [
        {
            "id": "tagset_major:image_parts",
            "label_ja": "イメージ要素",
            "medium_categories": [
                {
                    "id": "tagset_medium:image_parts:styling",
                    "label_ja": "スタイリング",
                    "small_categories": [
                        {
                            "id": "tagset_small:image_parts:styling:clothing",
                            "label_ja": "服装",
                            "sets": [
                                {
                                    "id": "outfit_casual_street",
                                    "name": "Casual street outfit",
                                    "name_ja": "服装",
                                    "tags": [
                                        "casual outfit",
                                        "streetwear",
                                        "jacket",
                                        "shirt",
                                        "skirt",
                                        "sneakers",
                                        "fashionable",
                                    ],
                                }
                            ],
                        },
                        {
                            "id": "tagset_small:image_parts:styling:hairstyle",
                            "label_ja": "髪型",
                            "sets": [
                                {
                                    "id": "hairstyle_soft_long_hair",
                                    "name": "Soft long hairstyle",
                                    "name_ja": "髪型",
                                    "tags": [
                                        "long hair",
                                        "wavy hair",
                                        "hair between eyes",
                                        "side bangs",
                                        "soft hair",
                                        "detailed hair",
                                    ],
                                }
                            ],
                        },
                    ],
                },
                {
                    "id": "tagset_medium:image_parts:scene",
                    "label_ja": "シーン",
                    "small_categories": [
                        {
                            "id": "tagset_small:image_parts:scene:background",
                            "label_ja": "背景のイメージ",
                            "sets": [
                                {
                                    "id": "background_cinematic_city",
                                    "name": "Cinematic city background",
                                    "name_ja": "背景のイメージ",
                                    "tags": [
                                        "cityscape",
                                        "street",
                                        "night",
                                        "neon lights",
                                        "depth of field",
                                        "cinematic lighting",
                                        "detailed background",
                                    ],
                                }
                            ],
                        }
                    ],
                },
            ],
        }
    ],
}


def default_tag_sets_path(data_directory=None):
    data_directory = Path(data_directory) if data_directory is not None else Path(__file__).with_name("data")
    return data_directory / "tag_sets.json"


def tag_set_image_directory(data_directory=None):
    data_directory = Path(data_directory) if data_directory is not None else Path(__file__).with_name("data")
    return data_directory / "tag-set-images"


def tag_set_image_path(file_name, data_directory=None):
    name = str(file_name or "").strip()
    if not name:
        raise ValueError("Image file name is required")
    path_name = Path(name).name
    if path_name != name or not path_name.lower().endswith((".webp", ".png", ".jpg", ".jpeg", ".gif", ".avif")):
        raise ValueError("Invalid image file name")
    return (tag_set_image_directory(data_directory) / path_name).resolve()


def tag_set_image_content_type(path):
    suffix = Path(path).suffix.lower()
    return {
        ".webp": "image/webp",
        ".png": "image/png",
        ".jpg": "image/jpeg",
        ".jpeg": "image/jpeg",
        ".gif": "image/gif",
        ".avif": "image/avif",
    }.get(suffix, "application/octet-stream")


def _empty_tag_sets_catalog(warnings=None):
    return {"schema_version": 1, "major_categories": [], "warnings": list(warnings or [])}


def _short_text(value, limit=200):
    return str(value or "").strip()[:limit]


def normalize_tag_sets_catalog(data):
    if not isinstance(data, dict) or data.get("schema_version") != 1:
        return _empty_tag_sets_catalog(["Unsupported tag set schema"])
    output = {"schema_version": 1, "major_categories": [], "warnings": []}
    set_count = 0
    for major_index, major in enumerate(data.get("major_categories") if isinstance(data.get("major_categories"), list) else []):
        if not isinstance(major, dict):
            output["warnings"].append(f"Skipped invalid major category at {major_index}")
            continue
        major_id = _short_text(major.get("id"), 120) or f"tagset_major:{major_index}"
        major_output = {
            "id": major_id,
            "label_ja": _short_text(major.get("label_ja") or major.get("name_ja") or major.get("name")),
            "medium_categories": [],
        }
        if major.get("label_en"):
            major_output["label_en"] = _short_text(major.get("label_en"))
        for medium_index, medium in enumerate(major.get("medium_categories") if isinstance(major.get("medium_categories"), list) else []):
            if not isinstance(medium, dict):
                output["warnings"].append(f"Skipped invalid medium category under {major_id}")
                continue
            medium_id = _short_text(medium.get("id"), 120) or f"{major_id}:medium:{medium_index}"
            medium_output = {
                "id": medium_id,
                "label_ja": _short_text(medium.get("label_ja") or medium.get("name_ja") or medium.get("name")),
                "small_categories": [],
            }
            if medium.get("label_en"):
                medium_output["label_en"] = _short_text(medium.get("label_en"))
            for small_index, small in enumerate(medium.get("small_categories") if isinstance(medium.get("small_categories"), list) else []):
                if not isinstance(small, dict):
                    output["warnings"].append(f"Skipped invalid small category under {medium_id}")
                    continue
                small_id = _short_text(small.get("id"), 120) or f"{medium_id}:small:{small_index}"
                small_output = {
                    "id": small_id,
                    "label_ja": _short_text(small.get("label_ja") or small.get("name_ja") or small.get("name")),
                    "sets": [],
                }
                if small.get("label_en"):
                    small_output["label_en"] = _short_text(small.get("label_en"))
                for set_index, item in enumerate(small.get("sets") if isinstance(small.get("sets"), list) else []):
                    if set_count >= MAX_TAG_SETS:
                        output["warnings"].append("Skipped tag sets beyond the limit")
                        break
                    if not isinstance(item, dict):
                        output["warnings"].append(f"Skipped invalid tag set under {small_id}")
                        continue
                    tags = [
                        _short_text(tag, 10000)
                        for tag in (item.get("tags") if isinstance(item.get("tags"), list) else [])
                    ]
                    tags = [tag for tag in tags if tag][:MAX_TAG_SET_TAGS]
                    if not tags:
                        output["warnings"].append(f"Skipped empty tag set under {small_id}")
                        continue
                    set_id = _short_text(item.get("id"), 160) or f"{small_id}:set:{set_index}"
                    set_output = {
                        "id": set_id,
                        "name": _short_text(item.get("name") or item.get("name_en") or item.get("name_ja") or set_id),
                        "tags": tags,
                    }
                    if item.get("name_ja"):
                        set_output["name_ja"] = _short_text(item.get("name_ja"))
                    if item.get("name_en"):
                        set_output["name_en"] = _short_text(item.get("name_en"))
                    if item.get("image_url"):
                        set_output["image_url"] = _short_text(item.get("image_url"), 1000)
                    if item.get("image_path"):
                        set_output["image_path"] = _short_text(item.get("image_path"), 1000)
                    small_output["sets"].append(set_output)
                    set_count += 1
                medium_output["small_categories"].append(small_output)
            major_output["medium_categories"].append(medium_output)
        output["major_categories"].append(major_output)
    return output


def load_tag_sets_catalog(data_directory=None):
    path = default_tag_sets_path(data_directory)
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except FileNotFoundError:
        catalog = normalize_tag_sets_catalog(DEFAULT_TAG_SETS_CATALOG)
        catalog["warnings"].append("Tag set file not found; using built-in defaults")
        return catalog
    except (OSError, json.JSONDecodeError):
        catalog = normalize_tag_sets_catalog(DEFAULT_TAG_SETS_CATALOG)
        catalog["warnings"].append("Tag set file could not be loaded; using built-in defaults")
        return catalog
    return normalize_tag_sets_catalog(data)


def tag_sets_path(data_directory=None, requested_name="", storage_directory=None):
    if requested_name:
        requested = user_tag_set_path(requested_name, storage_directory)
        if requested.is_file():
            return requested
    return default_tag_sets_path(data_directory)


def tag_sets_path_status(requested_name="", data_directory=None, storage_directory=None):
    selected = str(requested_name or "")
    if selected:
        selected_path = user_tag_set_path(selected, storage_directory)
        exists = selected_path.is_file()
        active_path = selected_path if exists else default_tag_sets_path(data_directory)
    else:
        selected_path = None
        exists = False
        active_path = default_tag_sets_path(data_directory)
    return {
        "selected": selected,
        "exists": exists,
        "path": str(active_path.resolve()),
        "selected_path": str(selected_path.resolve()) if selected_path is not None else "",
        "default_path": str(default_tag_sets_path(data_directory).resolve()),
    }


def load_selected_tag_sets_catalog(data_directory=None, requested_name="", storage_directory=None):
    path = tag_sets_path(data_directory, requested_name, storage_directory)
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except FileNotFoundError:
        catalog = normalize_tag_sets_catalog(DEFAULT_TAG_SETS_CATALOG)
        catalog["warnings"].append("Tag set file not found; using built-in defaults")
        return catalog
    except (OSError, json.JSONDecodeError):
        catalog = normalize_tag_sets_catalog(DEFAULT_TAG_SETS_CATALOG)
        catalog["warnings"].append("Tag set file could not be loaded; using built-in defaults")
        return catalog
    return normalize_tag_sets_catalog(data)


def examples_path(data_directory=None, requested_name="", storage_directory=None):
    if requested_name:
        requested = user_catalog_path(requested_name, storage_directory)
        if requested.is_file():
            return requested
    return default_examples_path(data_directory)


def catalog_path_status(requested_name="", data_directory=None, storage_directory=None):
    selected = str(requested_name or "")
    if selected:
        selected_path = user_catalog_path(selected, storage_directory)
        exists = selected_path.is_file()
        active_path = selected_path if exists else default_examples_path(data_directory)
    else:
        selected_path = None
        exists = False
        active_path = default_examples_path(data_directory)
    return {
        "selected": selected,
        "exists": exists,
        "path": str(active_path.resolve()),
        "selected_path": str(selected_path.resolve()) if selected_path is not None else "",
        "default_path": str(default_examples_path(data_directory).resolve()),
    }


def load_examples_catalog(data_directory=None, requested_name="", storage_directory=None):
    path = examples_path(data_directory, requested_name, storage_directory)
    data = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(data, dict):
        raise ValueError("Prompt examples root must be an object")
    return data


def list_user_catalogs(storage_directory=None):
    directory = catalog_storage_directory(storage_directory)
    if not directory.is_dir():
        return []
    return sorted(
        (path.stem for path in directory.glob("*.json") if path.is_file()),
        key=str.casefold,
    )[:500]


def list_user_tag_sets(storage_directory=None):
    directory = tag_set_storage_directory(storage_directory)
    if not directory.is_dir():
        return []
    return sorted(
        (path.stem for path in directory.glob("*.json") if path.is_file()),
        key=str.casefold,
    )[:500]


def validate_user_catalog(data):
    if not isinstance(data, dict):
        raise ValueError("Unsupported user catalog schema")
    is_stored = data.get("schema") == "prompt-workbench/tag-catalog" and data.get("version") == 1
    is_bundled = data.get("schema_version") == 1 and isinstance(data.get("major_categories"), list)
    if not is_stored and not is_bundled:
        raise ValueError("Unsupported user catalog schema")

    category_count = 0
    tag_count = 0
    if is_stored:
        if not isinstance(data.get("categories"), list) or not isinstance(data.get("tags"), list):
            raise ValueError("Catalog must contain categories and tags arrays")
        categories = data["categories"]
        if not categories:
            raise ValueError("Catalog category count is invalid")
        for category in categories:
            if not isinstance(category, dict):
                raise ValueError("Every catalog category must be an object")
            if not isinstance(category.get("id"), str) or not category["id"].strip():
                raise ValueError("Every catalog category must have an id")
        for item in data["tags"]:
            if not isinstance(item, dict) or not isinstance(item.get("prompt"), str) or not item["prompt"].strip():
                raise ValueError("Every catalog tag must have a prompt")
        category_count = len(categories)
        tag_count = len(data["tags"])
    else:
        majors = data["major_categories"]
        if not majors:
            raise ValueError("Catalog category count is invalid")
        for major in majors:
            if not isinstance(major, dict) or not isinstance(major.get("id"), str) or not major["id"].strip():
                raise ValueError("Every catalog category must have an id")
            mediums = major.get("medium_categories")
            if not isinstance(mediums, list):
                raise ValueError("Every major category must contain medium_categories")
            category_count += 1
            for medium in mediums:
                if not isinstance(medium, dict) or not isinstance(medium.get("id"), str) or not medium["id"].strip():
                    raise ValueError("Every catalog category must have an id")
                smalls = medium.get("small_categories")
                if not isinstance(smalls, list):
                    raise ValueError("Every medium category must contain small_categories")
                category_count += 1
                for small in smalls:
                    if not isinstance(small, dict) or not isinstance(small.get("id"), str) or not small["id"].strip():
                        raise ValueError("Every catalog category must have an id")
                    items = small.get("tags")
                    if not isinstance(items, list):
                        raise ValueError("Every small category must contain tags")
                    category_count += 1
                    for item in items:
                        if not isinstance(item, dict) or not isinstance(item.get("name"), str) or not item["name"].strip():
                            raise ValueError("Every catalog tag must have a name")
                    tag_count += len(items)

    if category_count > MAX_CATALOG_CATEGORIES:
        raise ValueError("Catalog category count is invalid")
    if tag_count > MAX_CATALOG_TAGS:
        raise ValueError("Catalog contains too many tags")
    encoded = json.dumps(data, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
    if len(encoded) > MAX_CATALOG_BYTES:
        raise ValueError("Catalog exceeds the 4 MB limit")
    return data


def validate_user_tag_sets(data):
    if not isinstance(data, dict):
        raise ValueError("Unsupported tag set schema")
    if data.get("schema_version") != 1 or not isinstance(data.get("major_categories"), list):
        raise ValueError("Tag set file must contain schema_version: 1 and major_categories")
    normalized = normalize_tag_sets_catalog(data)
    set_count = 0
    for major in normalized.get("major_categories", []):
        for medium in major.get("medium_categories", []):
            for small in medium.get("small_categories", []):
                set_count += len(small.get("sets", []))
    if not normalized.get("major_categories"):
        raise ValueError("Tag set category count is invalid")
    if set_count > 2000:
        raise ValueError("Tag set file contains too many sets")
    encoded = json.dumps(data, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
    if len(encoded) > MAX_CATALOG_BYTES:
        raise ValueError("Tag set file exceeds the 4 MB limit")
    return data


def save_user_catalog(name, data, storage_directory=None):
    catalog = validate_user_catalog(data)
    target = user_catalog_path(name, storage_directory)
    target.parent.mkdir(parents=True, exist_ok=True)
    serialized = json.dumps(catalog, ensure_ascii=False, indent=2) + "\n"
    created = False
    try:
        with target.open("x", encoding="utf-8", newline="\n") as output:
            created = True
            output.write(serialized)
            output.flush()
            os.fsync(output.fileno())
    except Exception:
        if created and target.exists():
            target.unlink()
        raise
    return target


def save_user_tag_sets(name, data, storage_directory=None):
    tag_sets = validate_user_tag_sets(data)
    target = user_tag_set_path(name, storage_directory)
    target.parent.mkdir(parents=True, exist_ok=True)
    serialized = json.dumps(tag_sets, ensure_ascii=False, indent=2) + "\n"
    created = False
    try:
        with target.open("x", encoding="utf-8", newline="\n") as output:
            created = True
            output.write(serialized)
            output.flush()
            os.fsync(output.fileno())
    except Exception:
        if created and target.exists():
            target.unlink()
        raise
    return target


def overwrite_user_catalog(name, data, storage_directory=None):
    catalog = validate_user_catalog(data)
    target = user_catalog_path(name, storage_directory)
    if not target.is_file():
        raise FileNotFoundError(target.name)
    serialized = json.dumps(catalog, ensure_ascii=False, indent=2) + "\n"
    temporary_path = None
    try:
        with tempfile.NamedTemporaryFile(
            "w",
            encoding="utf-8",
            newline="\n",
            dir=target.parent,
            prefix=f".{target.name}.",
            suffix=".tmp",
            delete=False,
        ) as output:
            temporary_path = Path(output.name)
            output.write(serialized)
            output.flush()
            os.fsync(output.fileno())
        os.replace(temporary_path, target)
        temporary_path = None
    finally:
        if temporary_path is not None and temporary_path.exists():
            temporary_path.unlink()
    return target


def overwrite_user_tag_sets(name, data, storage_directory=None):
    tag_sets = validate_user_tag_sets(data)
    target = user_tag_set_path(name, storage_directory)
    if not target.is_file():
        raise FileNotFoundError(target.name)
    serialized = json.dumps(tag_sets, ensure_ascii=False, indent=2) + "\n"
    temporary_path = None
    try:
        with tempfile.NamedTemporaryFile(
            "w",
            encoding="utf-8",
            newline="\n",
            dir=target.parent,
            prefix=f".{target.name}.",
            suffix=".tmp",
            delete=False,
        ) as output:
            temporary_path = Path(output.name)
            output.write(serialized)
            output.flush()
            os.fsync(output.fileno())
        os.replace(temporary_path, target)
        temporary_path = None
    finally:
        if temporary_path is not None and temporary_path.exists():
            temporary_path.unlink()
    return target


def provider_status():
    return [
        {
            "id": "local",
            "label": "Free automatic (dictionary -> MyMemory)",
            "available": True,
            "api_key_required": False,
        },
        {
            "id": "offline",
            "label": "Local dictionary only",
            "available": True,
            "api_key_required": False,
        },
        {
            "id": "libretranslate",
            "label": "LibreTranslate-compatible",
            "available": bool(os.getenv("PROMPT_WORKBENCH_LIBRE_URL")),
            "api_key_required": False,
            "reason": "PROMPT_WORKBENCH_LIBRE_URL is not set",
        },
        {
            "id": "deepl",
            "label": "DeepL",
            "available": bool(os.getenv("PROMPT_WORKBENCH_DEEPL_API_KEY")),
            "api_key_required": True,
            "reason": "PROMPT_WORKBENCH_DEEPL_API_KEY is not set",
        },
        {
            "id": "openai",
            "label": "OpenAI-compatible",
            "available": bool(
                os.getenv("PROMPT_WORKBENCH_OPENAI_API_KEY")
                and os.getenv("PROMPT_WORKBENCH_OPENAI_MODEL")
            ),
            "api_key_required": True,
            "reason": "PROMPT_WORKBENCH_OPENAI_API_KEY or PROMPT_WORKBENCH_OPENAI_MODEL is not set",
        },
    ]


def _validate_url(url):
    parsed = urlparse(url)
    if parsed.scheme not in {"http", "https"} or not parsed.netloc:
        raise TranslationError("Translation endpoint must be an http(s) URL")
    if parsed.username or parsed.password:
        raise TranslationError("Credentials are not allowed in translation URLs")
    return url.rstrip("/")


def _cache_key(provider, source, target, text, dictionary_signature=()):
    return (provider, source.lower(), target.lower(), text, dictionary_signature)


def _cache_get(key):
    if key not in _CACHE:
        return None
    value = _CACHE.pop(key)
    _CACHE[key] = value
    return value


def _cache_set(key, value):
    _CACHE[key] = value
    _CACHE.move_to_end(key)
    while len(_CACHE) > CACHE_LIMIT:
        _CACHE.popitem(last=False)


def _rate_limit(client_id):
    now = time.monotonic()
    bucket = _RATE_BUCKETS[client_id]
    while bucket and now - bucket[0] > RATE_WINDOW_SECONDS:
        bucket.popleft()
    if len(bucket) >= RATE_LIMIT:
        raise TranslationError("Translation rate limit reached; retry shortly")
    bucket.append(now)


def _local_translate(text, target, catalog_name=""):
    dictionary = _load_dictionary(catalog_name)
    target_language = target.casefold()
    table = dictionary.get(target_language) or dictionary.get(target_language.split("-", 1)[0], {})
    return table.get(_translation_lookup_key(text), text)


async def _post_json(session, url, payload, headers=None):
    async with session.post(url, json=payload, headers=headers or {}) as response:
        body = await response.text()
        if response.status >= 400:
            raise TranslationError(f"Translation service returned HTTP {response.status}")
        try:
            return json.loads(body)
        except json.JSONDecodeError as exc:
            raise TranslationError("Translation service returned invalid JSON") from exc


async def _get_json(session, url, params):
    async with session.get(url, params=params) as response:
        body = await response.text()
        if response.status >= 400:
            raise TranslationError(f"Translation service returned HTTP {response.status}")
        try:
            return json.loads(body)
        except json.JSONDecodeError as exc:
            raise TranslationError("Translation service returned invalid JSON") from exc


def _mymemory_query(text):
    query = " ".join(text.replace("_", " ").split())
    if len(query.encode("utf-8")) > 500:
        raise TranslationError("Free translation is limited to 500 bytes per tag")
    return query


def _parse_mymemory_result(data, query):
    status = data.get("responseStatus", 200) if isinstance(data, dict) else 500
    if not isinstance(status, int) or status >= 400:
        details = data.get("responseDetails") if isinstance(data, dict) else None
        raise TranslationError(str(details or "Free translation service rejected the request"))
    result = data.get("responseData", {}).get("translatedText")
    if not isinstance(result, str) or not result.strip():
        raise TranslationError("Free translation service returned an empty result")
    result = html.unescape(result).strip()
    if result.casefold() == query.casefold():
        raise TranslationError("Free translation service did not translate this tag")
    return result


async def _translate_mymemory(session, text, source, target):
    query = _mymemory_query(text)
    source_language = source.lower()
    target_language = target.lower()
    if source_language == "auto":
        source_language = "en" if target_language.startswith("ja") else "ja"
    data = await _get_json(
        session,
        MYMEMORY_URL,
        {"q": query, "langpair": f"{source_language}|{target_language}", "mt": "1"},
    )
    return _parse_mymemory_result(data, query)


async def translate_text(provider, text, source="auto", target="en", timeout=12, catalog_name=""):
    if not isinstance(text, str) or not text.strip():
        raise TranslationError("Translation text is empty")
    if len(text) > MAX_TEXT_LENGTH:
        raise TranslationError(f"Translation text exceeds {MAX_TEXT_LENGTH} characters")
    if provider not in SUPPORTED_PROVIDERS:
        raise TranslationError("Unknown translation provider")

    dictionary_signature = _dictionary_signature(catalog_name)
    key = _cache_key(provider, source, target, text, dictionary_signature)
    cached = _cache_get(key)
    if cached is not None:
        return cached, True

    local_result = _local_translate(text, target, catalog_name)
    if target.lower().startswith("ja") and local_result != text:
        _cache_set(key, local_result)
        return local_result, False
    if provider in {"local", "offline"}:
        if provider == "offline" or local_result != text:
            _cache_set(key, local_result)
            return local_result, False

    try:
        import aiohttp
    except ImportError as exc:
        raise TranslationError("aiohttp is unavailable in this ComfyUI installation") from exc

    timeout = max(3, min(int(timeout), 30))
    client_timeout = aiohttp.ClientTimeout(total=timeout)
    async with _REMOTE_SEMAPHORE, aiohttp.ClientSession(timeout=client_timeout) as session:
        if provider == "local":
            result = await _translate_mymemory(session, text, source, target)
        elif provider == "libretranslate":
            base_url = _validate_url(os.getenv("PROMPT_WORKBENCH_LIBRE_URL", ""))
            payload = {"q": text, "source": source, "target": target, "format": "text"}
            api_key = os.getenv("PROMPT_WORKBENCH_LIBRE_API_KEY")
            if api_key:
                payload["api_key"] = api_key
            data = await _post_json(session, f"{base_url}/translate", payload)
            result = data.get("translatedText")
        elif provider == "deepl":
            api_key = os.getenv("PROMPT_WORKBENCH_DEEPL_API_KEY")
            if not api_key:
                raise TranslationError("DeepL API key is not configured")
            base_url = _validate_url(
                os.getenv("PROMPT_WORKBENCH_DEEPL_URL", "https://api-free.deepl.com/v2")
            )
            payload = {"text": [text], "target_lang": target.upper()}
            if source.lower() != "auto":
                payload["source_lang"] = source.upper()
            data = await _post_json(
                session,
                f"{base_url}/translate",
                payload,
                {"Authorization": f"DeepL-Auth-Key {api_key}"},
            )
            translations = data.get("translations") or []
            result = translations[0].get("text") if translations else None
        else:
            api_key = os.getenv("PROMPT_WORKBENCH_OPENAI_API_KEY")
            if not api_key:
                raise TranslationError("OpenAI-compatible API key is not configured")
            base_url = _validate_url(
                os.getenv("PROMPT_WORKBENCH_OPENAI_BASE_URL", "https://api.openai.com/v1")
            )
            model = os.getenv("PROMPT_WORKBENCH_OPENAI_MODEL")
            if not model:
                raise TranslationError("OpenAI-compatible model is not configured")
            payload = {
                "model": model,
                "temperature": 0,
                "messages": [
                    {
                        "role": "system",
                        "content": (
                            "Translate the supplied Stable Diffusion prompt tag to "
                            f"{target}. Return only the translation and preserve model syntax."
                        ),
                    },
                    {"role": "user", "content": text},
                ],
            }
            data = await _post_json(
                session,
                f"{base_url}/chat/completions",
                payload,
                {"Authorization": f"Bearer {api_key}"},
            )
            choices = data.get("choices") or []
            result = choices[0].get("message", {}).get("content") if choices else None

    if not isinstance(result, str) or not result.strip():
        raise TranslationError("Translation service returned an empty result")
    result = result.strip()[:MAX_TEXT_LENGTH]
    _cache_set(key, result)
    return result, False


def register_routes():
    global _ROUTES_REGISTERED
    if _ROUTES_REGISTERED:
        return

    from aiohttp import web
    from server import PromptServer

    routes = PromptServer.instance.routes

    @routes.get("/prompt_workbench/examples")
    async def get_examples(request):
        try:
            requested_name = request.rel_url.query.get("file", "")
            data = load_examples_catalog(requested_name=requested_name)
        except (OSError, ValueError, json.JSONDecodeError):
            return web.json_response({"error": "Prompt examples are unavailable"}, status=500)
        return web.json_response(data)

    @routes.get("/prompt_workbench/tag_sets")
    async def get_tag_sets(request):
        requested_name = request.rel_url.query.get("file", "")
        return web.json_response(load_selected_tag_sets_catalog(requested_name=requested_name))

    @routes.get("/prompt-workbench-data/tag-set-images/{file_name}")
    async def get_tag_set_image(request):
        try:
            path = tag_set_image_path(request.match_info.get("file_name", ""))
        except ValueError:
            return web.Response(status=400, text="Invalid image file name")
        if not path.is_file():
            return web.Response(status=404, text="Image not found")
        return web.Response(
            body=path.read_bytes(),
            content_type=tag_set_image_content_type(path),
        )

    @routes.get("/prompt_workbench/tag_sets/files")
    async def get_tag_set_files(request):
        selected = request.rel_url.query.get("selected", "")
        try:
            files = list_user_tag_sets()
            status = tag_sets_path_status(selected)
        except ValueError as exc:
            return web.json_response({"error": str(exc)}, status=400)
        return web.json_response({"files": files, **status})

    @routes.post("/prompt_workbench/tag_sets/files")
    async def post_tag_set_file(request):
        if request.content_length and request.content_length > MAX_CATALOG_BYTES:
            return web.json_response({"error": "Tag set request is too large"}, status=413)
        try:
            body = await request.json()
            target = save_user_tag_sets(body.get("name"), body.get("tag_sets"))
            return web.json_response({"name": target.stem, "filename": target.name}, status=201)
        except FileExistsError:
            return web.json_response({"error": "A tag set file with this name already exists"}, status=409)
        except (OSError, ValueError, TypeError, json.JSONDecodeError) as exc:
            return web.json_response({"error": str(exc)}, status=400)

    @routes.put("/prompt_workbench/tag_sets/files")
    async def put_tag_set_file(request):
        if request.content_length and request.content_length > MAX_CATALOG_BYTES:
            return web.json_response({"error": "Tag set request is too large"}, status=413)
        try:
            body = await request.json()
            target = overwrite_user_tag_sets(body.get("name"), body.get("tag_sets"))
            return web.json_response({"name": target.stem, "filename": target.name})
        except FileNotFoundError:
            return web.json_response({"error": "The selected tag set file no longer exists"}, status=404)
        except (OSError, ValueError, TypeError, json.JSONDecodeError) as exc:
            return web.json_response({"error": str(exc)}, status=400)

    @routes.get("/prompt_workbench/catalogs")
    async def get_catalogs(request):
        selected = request.rel_url.query.get("selected", "")
        try:
            files = list_user_catalogs()
            status = catalog_path_status(selected)
        except ValueError as exc:
            return web.json_response({"error": str(exc)}, status=400)
        return web.json_response({"files": files, **status})

    @routes.post("/prompt_workbench/catalogs")
    async def post_catalog(request):
        if request.content_length and request.content_length > MAX_CATALOG_BYTES:
            return web.json_response({"error": "Catalog request is too large"}, status=413)
        try:
            body = await request.json()
            target = save_user_catalog(body.get("name"), body.get("catalog"))
            return web.json_response({"name": target.stem, "filename": target.name}, status=201)
        except FileExistsError:
            return web.json_response({"error": "A catalog with this name already exists"}, status=409)
        except (OSError, ValueError, TypeError, json.JSONDecodeError) as exc:
            return web.json_response({"error": str(exc)}, status=400)

    @routes.put("/prompt_workbench/catalogs")
    async def put_catalog(request):
        if request.content_length and request.content_length > MAX_CATALOG_BYTES:
            return web.json_response({"error": "Catalog request is too large"}, status=413)
        try:
            body = await request.json()
            target = overwrite_user_catalog(body.get("name"), body.get("catalog"))
            return web.json_response({"name": target.stem, "filename": target.name})
        except FileNotFoundError:
            return web.json_response({"error": "The selected catalog no longer exists"}, status=404)
        except (OSError, ValueError, TypeError, json.JSONDecodeError) as exc:
            return web.json_response({"error": str(exc)}, status=400)

    @routes.get("/prompt_workbench/providers")
    async def get_providers(_request):
        return web.json_response({"providers": provider_status()})

    @routes.post("/prompt_workbench/translate")
    async def post_translate(request):
        if request.content_length and request.content_length > MAX_REQUEST_BYTES:
            return web.json_response({"error": "Request is too large"}, status=413)
        try:
            body = await request.json()
            provider = body.get("provider", "local")
            texts = body.get("texts")
            if not isinstance(texts, list) or not 1 <= len(texts) <= MAX_BATCH_SIZE:
                raise TranslationError("texts must be a non-empty bounded array")
            if not all(isinstance(item, str) for item in texts):
                raise TranslationError("Every translation item must be a string")
            _rate_limit(request.remote or "local")
            source = str(body.get("source", "auto"))[:16]
            target = str(body.get("target", "en"))[:16]
            catalog_name = normalize_catalog_name(body.get("catalog", "")) if body.get("catalog") else ""
            timeout = body.get("timeout", 12)
            async def translate_item(item):
                try:
                    translated, cached = await translate_text(
                        provider, item, source, target, timeout, catalog_name
                    )
                    return {"source": item, "translated": translated, "cached": cached}
                except (TranslationError, asyncio.TimeoutError) as exc:
                    message = "Translation timed out" if isinstance(exc, asyncio.TimeoutError) else str(exc)
                    return {"source": item, "translated": "", "cached": False, "error": message}

            results = await asyncio.gather(*(translate_item(item) for item in texts))
            return web.json_response({"results": results})
        except (TranslationError, ValueError, TypeError, json.JSONDecodeError) as exc:
            return web.json_response({"error": str(exc)}, status=400)
        except asyncio.TimeoutError:
            return web.json_response({"error": "Translation timed out"}, status=504)

    _ROUTES_REGISTERED = True
