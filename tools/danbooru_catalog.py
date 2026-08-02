from __future__ import annotations

import base64
import hashlib
import json
import os
import random
import re
import tempfile
import time
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterable

import requests


BASE_URL = "https://danbooru.donmai.us"
USER_AGENT = "ComfyUI-Prompt-Workbench/1.0 (Danbooru catalog updater)"
MAX_PAGE_SIZE = 1000
REQUEST_INTERVAL = 0.25
MAX_RETRIES = 5
DENIED_TAGS = {
    "highres", "absurdres", "lowres", "commentary_request", "commentary",
    "translation_request", "translated", "tagme", "source_request",
    "character_request", "artist_request", "copyright_request", "bad_id",
    "duplicate", "revision", "animated", "sound", "video",
}
WIKI_LINK_RE = re.compile(r"\[\[([^\]|#]+)(?:\|[^\]]+)?\]\]")


class CatalogError(RuntimeError):
    pass


def utc_now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def normalize_tag(value: Any) -> str:
    return "_".join(str(value or "").strip().lower().split())


def chunks(values: list[str], size: int) -> Iterable[list[str]]:
    for index in range(0, len(values), size):
        yield values[index:index + size]


@dataclass
class DanbooruClient:
    cache_dir: Path
    refresh: bool = False
    request_interval: float = REQUEST_INTERVAL
    max_retries: int = MAX_RETRIES

    def __post_init__(self) -> None:
        self.cache_dir.mkdir(parents=True, exist_ok=True)
        self.session = requests.Session()
        self.session.headers.update({"User-Agent": USER_AGENT, "Accept": "application/json"})
        username = os.getenv("DANBOORU_USERNAME")
        api_key = os.getenv("DANBOORU_API_KEY")
        if username and api_key:
            token = base64.b64encode(f"{username}:{api_key}".encode("utf-8")).decode("ascii")
            self.session.headers["Authorization"] = f"Basic {token}"
        self._last_request = 0.0

    def _cache_path(self, endpoint: str, params: dict[str, Any]) -> Path:
        safe_params = {key: value for key, value in params.items() if key not in {"login", "api_key"}}
        digest = hashlib.sha256(json.dumps([endpoint, safe_params], sort_keys=True).encode("utf-8")).hexdigest()
        return self.cache_dir / f"{digest}.json"

    def get_json(self, endpoint: str, params: dict[str, Any]) -> Any:
        cache_path = self._cache_path(endpoint, params)
        if cache_path.exists() and not self.refresh:
            try:
                return json.loads(cache_path.read_text(encoding="utf-8"))["body"]
            except (OSError, json.JSONDecodeError, KeyError):
                pass

        url = f"{BASE_URL}{endpoint}"
        last_error: Exception | None = None
        for attempt in range(self.max_retries):
            wait = self.request_interval - (time.monotonic() - self._last_request)
            if wait > 0:
                time.sleep(wait)
            try:
                self._last_request = time.monotonic()
                response = self.session.get(url, params=params, timeout=(10, 30))
                if response.status_code == 429 or 500 <= response.status_code < 600:
                    retry_after = response.headers.get("Retry-After")
                    delay = float(retry_after) if retry_after and retry_after.isdigit() else (2 ** attempt) + random.random()
                    time.sleep(min(delay, 30))
                    continue
                if response.status_code == 410:
                    raise CatalogError(f"Danbooru pagination limit reached for {endpoint}")
                response.raise_for_status()
                if "application/json" not in response.headers.get("Content-Type", ""):
                    raise CatalogError(f"Danbooru returned non-JSON content for {endpoint}")
                body = response.json()
                payload = {"fetched_at": utc_now(), "endpoint": endpoint, "params": params, "body": body}
                cache_path.write_text(json.dumps(payload, ensure_ascii=False), encoding="utf-8")
                return body
            except (requests.RequestException, ValueError, CatalogError) as exc:
                last_error = exc
                if isinstance(exc, CatalogError):
                    break
                if attempt + 1 < self.max_retries:
                    time.sleep(min((2 ** attempt) + random.random(), 30))
        raise CatalogError(f"Danbooru request failed for {endpoint}: {last_error}")

    def paginated(self, endpoint: str, params: dict[str, Any], max_pages: int = 1000) -> list[dict[str, Any]]:
        output: list[dict[str, Any]] = []
        limit = min(int(params.get("limit", MAX_PAGE_SIZE)), MAX_PAGE_SIZE)
        for page in range(1, max_pages + 1):
            body = self.get_json(endpoint, {**params, "limit": limit, "page": page})
            if not isinstance(body, list):
                raise CatalogError(f"Expected an array from {endpoint}")
            output.extend(item for item in body if isinstance(item, dict))
            if len(body) < limit:
                return output
        raise CatalogError(f"Page limit {max_pages} reached for {endpoint}")


def load_json(path: Path) -> Any:
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise CatalogError(f"Could not read {path}: {exc}") from exc


def extract_legacy_candidates(legacy: dict[str, Any]) -> dict[str, set[str]]:
    groups: dict[str, set[str]] = {}
    for category in legacy.get("categories", []):
        group_id = str(category.get("id", ""))
        groups[group_id] = {
            normalize_tag(item.get("prompt"))
            for item in category.get("items", [])
            if normalize_tag(item.get("prompt"))
        }
    return groups


def fetch_wiki_candidates(client: DanbooruClient, titles: list[str]) -> tuple[set[str], dict[str, str]]:
    candidates: set[str] = set()
    evidence: dict[str, str] = {}
    for title in titles:
        body = client.get_json("/wiki_pages.json", {
            "search[title]": title,
            "search[hide_deleted]": "yes",
            "limit": 1,
            "only": "title,body,updated_at,is_deleted",
        })
        if not isinstance(body, list) or not body:
            continue
        for match in WIKI_LINK_RE.findall(str(body[0].get("body", ""))):
            name = normalize_tag(match)
            if name and not name.startswith(("tag_group:", "help:", "howto:", "api:")):
                candidates.add(name)
                evidence.setdefault(name, f"wiki:{title}")
    return candidates, evidence


def alias_map(records: list[dict[str, Any]]) -> dict[str, str]:
    aliases: dict[str, str] = {}
    for record in records:
        if record.get("status") != "active":
            continue
        antecedent = normalize_tag(record.get("antecedent_name"))
        consequent = normalize_tag(record.get("consequent_name"))
        if antecedent and consequent:
            aliases[antecedent] = consequent
    return aliases


def canonical_name(name: str, aliases: dict[str, str]) -> str:
    visited: set[str] = set()
    while name in aliases and name not in visited:
        visited.add(name)
        name = aliases[name]
    return name


def fetch_official_tags(client: DanbooruClient, names: set[str]) -> dict[str, dict[str, Any]]:
    output: dict[str, dict[str, Any]] = {}
    for batch in chunks(sorted(names), 100):
        body = client.get_json("/tags.json", {
            "search[name_normalize]": ",".join(batch),
            "search[category]": 0,
            "search[hide_empty]": "yes",
            "search[is_deprecated]": "no",
            "search[order]": "name",
            "limit": MAX_PAGE_SIZE,
            "only": "id,name,post_count,category,is_deprecated,updated_at,wiki_page[title,updated_at]",
        })
        if not isinstance(body, list):
            raise CatalogError("Expected an array from /tags.json")
        for record in body:
            name = normalize_tag(record.get("name"))
            if name:
                output[name] = record
    return output


def build_catalog(
    taxonomy: dict[str, Any],
    legacy: dict[str, Any],
    client: DanbooruClient,
) -> tuple[dict[str, Any], dict[str, Any], str]:
    legacy_groups = extract_legacy_candidates(legacy)
    aliases = alias_map(client.paginated("/tag_aliases.json", {
        "search[status]": "active",
        "search[order]": "name",
        "limit": MAX_PAGE_SIZE,
        "only": "antecedent_name,consequent_name,status,updated_at",
    }))
    implications = client.paginated("/tag_implications.json", {
        "search[status]": "active",
        "search[order]": "name",
        "limit": MAX_PAGE_SIZE,
        "only": "antecedent_name,consequent_name,status,updated_at",
    })

    evidence_by_leaf: dict[str, dict[str, str]] = {}
    candidates_by_leaf: dict[str, set[str]] = {}
    all_names: set[str] = set()
    for major in taxonomy.get("major_categories", []):
        for medium in major.get("medium_categories", []):
            for leaf in medium.get("small_categories", []):
                leaf_id = str(leaf["id"])
                evidence: dict[str, str] = {}
                candidates: set[str] = set()
                for group_id in leaf.get("legacy_group_ids", []):
                    for name in legacy_groups.get(group_id, set()):
                        candidates.add(name)
                        evidence.setdefault(name, f"legacy-reference:{group_id}")
                wiki_candidates, wiki_evidence = fetch_wiki_candidates(client, leaf.get("wiki_pages", []))
                candidates.update(wiki_candidates)
                evidence.update(wiki_evidence)
                for name in leaf.get("manual_tags", []):
                    normalized = normalize_tag(name)
                    if normalized:
                        candidates.add(normalized)
                        evidence[normalized] = "manual"
                excluded = {normalize_tag(name) for name in leaf.get("exclude_tags", [])} | DENIED_TAGS
                candidates -= excluded
                candidates = {canonical_name(name, aliases) for name in candidates}
                candidates_by_leaf[leaf_id] = candidates
                evidence_by_leaf[leaf_id] = {
                    canonical_name(name, aliases): reason for name, reason in evidence.items()
                }
                all_names.update(candidates)

    for implication in implications:
        antecedent = canonical_name(normalize_tag(implication.get("antecedent_name")), aliases)
        consequent = canonical_name(normalize_tag(implication.get("consequent_name")), aliases)
        if not antecedent or not consequent:
            continue
        for leaf_id, candidates in candidates_by_leaf.items():
            if consequent in candidates and antecedent not in DENIED_TAGS:
                candidates.add(antecedent)
                evidence_by_leaf[leaf_id].setdefault(antecedent, f"implication:{antecedent}->{consequent}")
                all_names.add(antecedent)

    official = fetch_official_tags(client, all_names)
    generated_at = utc_now()
    used_tags: set[str] = set()
    ui_majors: list[dict[str, Any]] = []
    full_tags: list[dict[str, Any]] = []
    markdown = ["# Danbooruタグカタログ", "", f"生成日時: {generated_at}", ""]

    for major in taxonomy.get("major_categories", []):
        ui_major = {key: major[key] for key in ("id", "label_ja", "description_ja")}
        ui_major["medium_categories"] = []
        markdown.extend([f"# {major['label_ja']}", ""])
        for medium in major.get("medium_categories", []):
            ui_medium = {key: medium[key] for key in ("id", "label_ja", "description_ja")}
            ui_medium["small_categories"] = []
            markdown.extend([f"## {medium['label_ja']}", ""])
            pending: list[tuple[dict[str, Any], list[dict[str, Any]]]] = []
            for leaf in medium.get("small_categories", []):
                records = [
                    record for name in candidates_by_leaf.get(leaf["id"], set())
                    if (record := official.get(name))
                    and record.get("category") == 0
                    and not record.get("is_deprecated")
                    and int(record.get("post_count", 0)) > 0
                    and name not in used_tags
                ]
                records.sort(key=lambda item: (-int(item["post_count"]), str(item["name"])))
                pending.append((leaf, records))

            allocated: list[tuple[dict[str, Any], list[dict[str, Any]]]] = []
            medium_used: set[str] = set()
            for leaf, records in pending:
                selected = [record for record in records if record["name"] not in medium_used][:20]
                if len(selected) < 20:
                    allocated = []
                    break
                allocated.append((leaf, selected))
                medium_used.update(record["name"] for record in selected)

            if not allocated:
                combined: dict[str, dict[str, Any]] = {}
                for _, records in pending:
                    for record in records:
                        if record["name"] not in used_tags:
                            combined[record["name"]] = record
                merged = sorted(combined.values(), key=lambda item: (-int(item["post_count"]), str(item["name"])))
                if len(merged) < 20:
                    counts = ", ".join(f"{leaf['id']}={len(records)}" for leaf, records in pending)
                    raise CatalogError(f"Medium category {medium['id']} cannot supply 20 tags ({counts})")
                allocated = [({
                    "id": f"{medium['id']}:general",
                    "label_ja": medium.get("fallback_label_ja", medium["label_ja"]),
                    "description_ja": medium["description_ja"],
                }, merged[:20])]

            for leaf, selected in allocated:
                tags = []
                markdown.extend([f"### {leaf['label_ja']}", ""])
                for rank, record in enumerate(selected, 1):
                    name = record["name"]
                    used_tags.add(name)
                    tags.append({"id": int(record["id"]), "name": name, "post_count": int(record["post_count"]), "rank": rank})
                    markdown.append(f"{rank}. {name} — {int(record['post_count']):,} posts")
                    full_tags.append({
                        "danbooru_id": int(record["id"]),
                        "name": name,
                        "post_count": int(record["post_count"]),
                        "danbooru_category": int(record["category"]),
                        "is_deprecated": bool(record["is_deprecated"]),
                        "updated_at": record.get("updated_at"),
                        "wiki_present": bool(record.get("wiki_page")),
                        "major_category_id": major["id"],
                        "medium_category_id": medium["id"],
                        "small_category_id": leaf["id"],
                        "rank": rank,
                        "classification_evidence": evidence_by_leaf.get(leaf.get("id", ""), {}).get(name, "merged-category"),
                        "manual_override": evidence_by_leaf.get(leaf.get("id", ""), {}).get(name) == "manual",
                        "source": f"{BASE_URL}/tags/{record['id']}",
                    })
                markdown.append("")
                ui_medium["small_categories"].append({
                    "id": leaf["id"],
                    "label_ja": leaf["label_ja"],
                    "description_ja": leaf["description_ja"],
                    "tags": tags,
                })
            ui_major["medium_categories"].append(ui_medium)
        ui_majors.append(ui_major)

    small_count = sum(len(medium["small_categories"]) for major in ui_majors for medium in major["medium_categories"])
    ui = {
        "schema_version": 1,
        "generated_at": generated_at,
        "source": {
            "name": "Danbooru official API",
            "base_url": BASE_URL,
            "endpoints": ["/tags.json", "/wiki_pages.json", "/tag_aliases.json", "/tag_implications.json"],
        },
        "stats": {
            "major_categories": len(ui_majors),
            "medium_categories": sum(len(major["medium_categories"]) for major in ui_majors),
            "small_categories": small_count,
            "tags": len(full_tags),
        },
        "major_categories": ui_majors,
    }
    full = {
        "schema_version": 1,
        "generated_at": generated_at,
        "source": ui["source"],
        "stats": ui["stats"],
        "aliases": aliases,
        "tags": full_tags,
    }
    validate_catalogs(ui, full)
    return ui, full, "\n".join(markdown).rstrip() + "\n"


def validate_catalogs(ui: dict[str, Any], full: dict[str, Any]) -> None:
    if ui.get("schema_version") != 1 or full.get("schema_version") != 1:
        raise CatalogError("Unsupported catalog schema")
    majors = ui.get("major_categories")
    if not isinstance(majors, list) or len(majors) != 14:
        raise CatalogError("Catalog must contain exactly 14 major categories")
    ids: set[str] = set()
    ui_records: list[tuple[str, int, int]] = []
    all_tag_names: set[str] = set()
    for major in majors:
        for category in [major, *major.get("medium_categories", [])]:
            identifier = category.get("id")
            if not identifier or identifier in ids:
                raise CatalogError(f"Duplicate or empty category id: {identifier}")
            ids.add(identifier)
        for medium in major.get("medium_categories", []):
            for leaf in medium.get("small_categories", []):
                identifier = leaf.get("id")
                if not identifier or identifier in ids:
                    raise CatalogError(f"Duplicate or empty category id: {identifier}")
                ids.add(identifier)
                tags = leaf.get("tags")
                if not isinstance(tags, list) or len(tags) != 20:
                    raise CatalogError(f"{identifier} must contain exactly 20 tags")
                names = [tag.get("name") for tag in tags]
                if len(set(names)) != 20 or any(not name or " " in name for name in names):
                    raise CatalogError(f"{identifier} has invalid or duplicate tag names")
                duplicate_names = all_tag_names.intersection(names)
                if duplicate_names:
                    raise CatalogError(f"Tags are assigned to multiple categories: {sorted(duplicate_names)}")
                all_tag_names.update(names)
                counts = [tag.get("post_count") for tag in tags]
                if any(not isinstance(count, int) or count <= 0 for count in counts) or counts != sorted(counts, reverse=True):
                    raise CatalogError(f"{identifier} post counts are invalid or unsorted")
                for expected_rank, tag in enumerate(tags, 1):
                    if tag.get("rank") != expected_rank:
                        raise CatalogError(f"{identifier} has an invalid rank")
                    ui_records.append((tag["name"], tag["post_count"], tag["rank"]))
    full_records = [(tag.get("name"), tag.get("post_count"), tag.get("rank")) for tag in full.get("tags", [])]
    if sorted(ui_records) != sorted(full_records):
        raise CatalogError("UI and audit catalogs contain different tags")
    if any(tag.get("danbooru_category") != 0 or tag.get("is_deprecated") for tag in full.get("tags", [])):
        raise CatalogError("Audit catalog contains excluded Danbooru tags")


def atomic_write_outputs(outputs: dict[Path, str]) -> None:
    previous = {path: path.read_bytes() if path.exists() else None for path in outputs}
    staged: dict[Path, Path] = {}
    try:
        for path, content in outputs.items():
            path.parent.mkdir(parents=True, exist_ok=True)
            with tempfile.NamedTemporaryFile("w", encoding="utf-8", newline="\n", dir=path.parent, delete=False) as handle:
                handle.write(content)
                handle.flush()
                os.fsync(handle.fileno())
                staged[path] = Path(handle.name)
        for path, temporary in staged.items():
            os.replace(temporary, path)
    except Exception:
        for path, body in previous.items():
            if body is None:
                if path.exists():
                    path.unlink()
            else:
                path.write_bytes(body)
        raise
    finally:
        for temporary in staged.values():
            if temporary.exists():
                temporary.unlink()
