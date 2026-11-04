import os
import re
import sqlite3
import time
import unicodedata
from pathlib import Path

DATABASE_ENV = "PROMPT_WORKBENCH_TAGDB"
HF_DATABASES = (
    ("genai-image-tag-db-CC4", "genai-image-tag-db-cc4.sqlite"),
    ("genai-image-tag-db-mit", "genai-image-tag-db-mit.sqlite"),
    ("genai-image-tag-db", "genai-image-tag-db-cc0.sqlite"),
)
DEFAULT_FORMAT = "danbooru"
MAX_SEARCH_RESULTS = 100
MAX_VALIDATE_TAGS = 200
MAX_DISPLAY_TRANSLATIONS = 3
QUERY_SECONDS = 2.0

RANK_EXACT = 0
RANK_PREFIX = 1
RANK_ALIAS_PREFIX = 2
RANK_CONTAINS = 3

_HITS_SQL = """
WITH hit AS MATERIALIZED ({source})
SELECT p.tag, COALESCE(n.type_name, ''), COALESCE(u.count, 0), hit.matched
FROM hit
CROSS JOIN TAG_STATUS s ON s.tag_id = hit.tag_id AND s.format_id = :format_id
JOIN TAG_STATUS c ON c.tag_id = s.preferred_tag_id AND c.format_id = s.format_id AND c.alias = 0
JOIN TAGS p ON p.tag_id = s.preferred_tag_id
LEFT JOIN TAG_USAGE_COUNTS u ON u.tag_id = s.preferred_tag_id AND u.format_id = s.format_id
LEFT JOIN TAG_TYPE_FORMAT_MAPPING m ON m.format_id = c.format_id AND m.type_id = c.type_id
LEFT JOIN TAG_TYPE_NAME n ON n.type_name_id = m.type_name_id
ORDER BY COALESCE(u.count, 0) DESC
LIMIT :limit
"""
_TAG_PREFIX = "SELECT tag_id, tag AS matched FROM TAGS WHERE tag >= :low AND tag < :high"
_TRANSLATION_PREFIX = (
    "SELECT tag_id, translation AS matched FROM TAG_TRANSLATIONS WHERE translation >= :low AND translation < :high"
)
_TAG_EXACT = "SELECT tag_id, tag AS matched FROM TAGS WHERE tag = :name"
_TRANSLATION_EXACT = "SELECT tag_id, translation AS matched FROM TAG_TRANSLATIONS WHERE translation = :name"
_TAG_CONTAINS = "SELECT tag_id, tag AS matched FROM TAGS WHERE tag LIKE :pattern ESCAPE '\\'"
_TRANSLATION_CONTAINS = (
    "SELECT tag_id, translation AS matched FROM TAG_TRANSLATIONS WHERE translation LIKE :pattern ESCAPE '\\'"
)


def _hf_cache_directory():
    configured = os.environ.get("HF_HUB_CACHE")
    if configured:
        return Path(configured)
    home = os.environ.get("HF_HOME")
    return Path(home) / "hub" if home else Path.home() / ".cache" / "huggingface" / "hub"


def database_paths():
    configured = os.environ.get(DATABASE_ENV)
    if configured:
        return [Path(item) for item in configured.split(os.pathsep) if Path(item).is_file()]

    paths = []
    for repository, file_name in HF_DATABASES:
        cache = _hf_cache_directory() / f"datasets--NEXTAltair--{repository}"
        reference = cache / "refs" / "main"
        if not reference.is_file():
            continue
        path = cache / "snapshots" / reference.read_text(encoding="utf-8").strip() / file_name
        if path.is_file():
            paths.append(path)
    # CC4 と MIT はどちらも CC0 を土台にしているので、CC0 は単独のときだけ使う。
    return paths[:2]


def _connect(path):
    return sqlite3.connect(f"{path.resolve().as_uri()}?mode=ro&immutable=1", uri=True)


def _format_id(connection, format_name):
    row = connection.execute("SELECT format_id FROM TAG_FORMATS WHERE format_name = ?", (format_name,)).fetchone()
    return row[0] if row else None


def tag_variants(value):
    """プロンプト上の表記から TAGS.tag の候補を返す。^_^ のように _ を含むタグがあるので元の表記も残す。"""
    text = unicodedata.normalize("NFKC", str(value or "")).strip().lower()
    spaced = re.sub(r"[_\s]+", " ", text).strip()
    escaped = re.sub(r"(?<!\\)([()])", r"\\\1", spaced)
    return list(dict.fromkeys(item for item in (escaped, spaced, text) if item))


def display_translations(values):
    """訳は1つに絞らず、読みやすいものを先頭に並べる。ラテン文字やカッコを含む訳は後ろへ回す。"""
    unique = dict.fromkeys(values)
    ordered = sorted(unique, key=lambda text: (bool(re.search(r"[A-Za-z(（]", text)), len(text), text))
    return ordered[:MAX_DISPLAY_TRANSLATIONS]


def _hits(connection, source, params):
    deadline = time.monotonic() + QUERY_SECONDS
    connection.set_progress_handler(lambda: time.monotonic() > deadline, 100_000)
    try:
        return connection.execute(_HITS_SQL.format(source=source), params).fetchall()
    except sqlite3.OperationalError as exc:
        # 部分一致は全件走査になるので、時間切れならそこまでの結果で返す。
        if "interrupted" in str(exc):
            return []
        raise


def _search_database(path, variants, format_name, limit, contains):
    connection = _connect(path)
    try:
        format_id = _format_id(connection, format_name)
        if format_id is None:
            return []

        found = {}

        def collect(source, rank, extra):
            for tag, type_name, count, matched in _hits(
                connection, source, {"format_id": format_id, "limit": limit, **extra}
            ):
                current_rank = rank
                if matched in variants and count:
                    current_rank = RANK_EXACT
                elif rank == RANK_PREFIX and matched != tag:
                    current_rank = RANK_ALIAS_PREFIX
                current = found.get(tag)
                if current is None or (current_rank, -count) < (current["rank"], -current["count"]):
                    found[tag] = {
                        "tag": tag,
                        "type": type_name,
                        "count": count,
                        "rank": current_rank,
                        "matched": matched,
                    }

        for variant in variants:
            bounds = {"low": variant, "high": variant + "\U0010ffff"}
            collect(_TAG_PREFIX, RANK_PREFIX, bounds)
            collect(_TRANSLATION_PREFIX, RANK_PREFIX, bounds)
        if contains:
            escaped = re.sub(r"([\\%_])", r"\\\1", variants[0])
            pattern = {"pattern": f"%{escaped}%"}
            collect(_TAG_CONTAINS, RANK_CONTAINS, pattern)
            collect(_TRANSLATION_CONTAINS, RANK_CONTAINS, pattern)
        return list(found.values())
    finally:
        connection.close()


def _translations(paths, tags, language):
    collected = {tag: [] for tag in tags}
    placeholders = ",".join("?" for _ in tags)
    for path in paths:
        connection = _connect(path)
        try:
            rows = connection.execute(
                "SELECT t.tag, x.translation FROM TAGS t JOIN TAG_TRANSLATIONS x ON x.tag_id = t.tag_id "
                f"WHERE x.language = ? AND t.tag IN ({placeholders})",
                (language, *tags),
            )
            for tag, translation in rows:
                collected[tag].append(translation)
        finally:
            connection.close()
    return collected


def search(query, language="ja", format_name=DEFAULT_FORMAT, limit=20, contains=False):
    variants = tag_variants(query)
    paths = database_paths()
    if not variants or not paths:
        return []
    limit = max(1, min(int(limit), MAX_SEARCH_RESULTS))

    merged = {}
    for path in paths:
        for hit in _search_database(path, variants, format_name, limit, contains):
            current = merged.get(hit["tag"])
            if current is None:
                merged[hit["tag"]] = hit
            else:
                current["count"] = max(current["count"], hit["count"])
                current["rank"] = min(current["rank"], hit["rank"])

    results = sorted(merged.values(), key=lambda item: (item["rank"], -item["count"], item["tag"]))[:limit]
    if not results:
        return []
    translations = _translations(paths, [item["tag"] for item in results], language)
    return [
        {
            "tag": item["tag"],
            "type": item["type"],
            "count": item["count"],
            "matched": item["matched"] if item["matched"] != item["tag"] else "",
            "translations": display_translations(translations[item["tag"]]),
        }
        for item in results
    ]


def _translation_rank(text):
    # 校服、百褶裙 のような中国語が ja に混ざっているので、仮名を含む訳を優先する。
    return bool(re.search(r"[A-Za-z(（]", text)), not re.search(r"[ぁ-ヿ]", text), len(text), text


def translate(text, target, format_name=DEFAULT_FORMAT):
    """タグ全体が完全一致したときだけ訳を返す。自然文は翻訳サービスに任せる。"""
    language = target.split("-", 1)[0].casefold()
    to_tag = language == "en"
    if text.isascii() == to_tag:
        return ""

    counts = {}
    paths = database_paths()
    for path in paths:
        connection = _connect(path)
        try:
            format_id = _format_id(connection, format_name)
            if format_id is None:
                continue
            for name in tag_variants(text):
                params = {"format_id": format_id, "limit": MAX_SEARCH_RESULTS, "name": name}
                for tag, _type_name, count, _matched in _hits(
                    connection, _TRANSLATION_EXACT if to_tag else _TAG_EXACT, params
                ):
                    # 訳からタグへ戻すときは、使われていないタグを選ばない。
                    if count or not to_tag:
                        counts[tag] = max(counts.get(tag, 0), count)
        finally:
            connection.close()
    if not counts:
        return ""

    tag = max(counts, key=counts.get)
    if to_tag:
        return tag
    translations = _translations(paths, [tag], language)[tag]
    # 複数のDBに同じ訳があれば、片方にしかない訳より信頼できる。
    return min(translations, key=lambda item: (-translations.count(item), *_translation_rank(item))) if translations else ""


def _lookup_status(path, names, format_name):
    connection = _connect(path)
    try:
        format_id = _format_id(connection, format_name)
        if format_id is None:
            return {}
        placeholders = ",".join("?" for _ in names)
        rows = connection.execute(
            "SELECT t.tag, s.alias, p.tag, c.alias FROM TAGS t "
            "JOIN TAG_STATUS s ON s.tag_id = t.tag_id AND s.format_id = ? "
            "JOIN TAGS p ON p.tag_id = s.preferred_tag_id "
            "LEFT JOIN TAG_STATUS c ON c.tag_id = s.preferred_tag_id AND c.format_id = s.format_id "
            f"WHERE t.tag IN ({placeholders})",
            (format_id, *names),
        )
        return {tag: (bool(alias), preferred, target_alias) for tag, alias, preferred, target_alias in rows}
    finally:
        connection.close()


def validate(tags, format_name=DEFAULT_FORMAT):
    tags = list(dict.fromkeys(tags))[:MAX_VALIDATE_TAGS]
    variants = {tag: tag_variants(tag) for tag in tags}
    names = sorted({name for items in variants.values() for name in items})
    paths = database_paths()
    known = {}
    if names:
        for path in paths:
            for name, status in _lookup_status(path, names, format_name).items():
                # CC4 にしかないタグがあるので、正規タグと判定できたDBの結果を優先する。
                if name not in known or known[name][0]:
                    known[name] = status

    results = []
    for tag in tags:
        result = {"tag": tag, "state": "unknown", "preferred": ""}
        for name in variants[tag]:
            status = known.get(name)
            if status is None:
                continue
            is_alias, preferred, target_alias = status
            # 別名の解決先が同じ形式に無い場合は、提案できないので正規タグと同じ扱いにする。
            if is_alias and target_alias == 0:
                result.update(state="alias", preferred=preferred)
            else:
                result["state"] = "ok"
            break
        results.append(result)
    return results


def status():
    databases = []
    for path in database_paths():
        connection = _connect(path)
        try:
            row = connection.execute("SELECT value FROM DATABASE_METADATA WHERE key = 'version'").fetchone()
        finally:
            connection.close()
        databases.append({"name": path.name, "version": row[0] if row else ""})
    return {"available": bool(databases), "databases": databases}
