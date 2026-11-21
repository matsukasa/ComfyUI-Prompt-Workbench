import os
import sqlite3
import sys
import tempfile
import unittest
from pathlib import Path
from unittest import mock

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import tagdb  # noqa: E402

SCHEMA = """
CREATE TABLE TAGS (tag_id INTEGER PRIMARY KEY, source_tag TEXT, tag TEXT UNIQUE);
CREATE TABLE TAG_FORMATS (format_id INTEGER PRIMARY KEY, format_name TEXT);
CREATE TABLE TAG_STATUS (tag_id INTEGER, format_id INTEGER, type_id INTEGER, alias INTEGER, preferred_tag_id INTEGER);
CREATE TABLE TAG_TRANSLATIONS (translation_id INTEGER PRIMARY KEY, tag_id INTEGER, language TEXT, translation TEXT);
CREATE TABLE TAG_USAGE_COUNTS (tag_id INTEGER, format_id INTEGER, count INTEGER);
CREATE TABLE TAG_TYPE_FORMAT_MAPPING (format_id INTEGER, type_id INTEGER, type_name_id INTEGER);
CREATE TABLE TAG_TYPE_NAME (type_name_id INTEGER PRIMARY KEY, type_name TEXT);
CREATE TABLE DATABASE_METADATA (key TEXT PRIMARY KEY, value TEXT);
INSERT INTO TAG_FORMATS VALUES (1, 'danbooru'), (2, 'pixiv');
INSERT INTO TAG_TYPE_NAME VALUES (1, 'general'), (2, 'character');
INSERT INTO TAG_TYPE_FORMAT_MAPPING VALUES (1, 0, 1), (1, 4, 2);
INSERT INTO DATABASE_METADATA VALUES ('version', 'v1');
"""


def make_database(path, tags):
    connection = sqlite3.connect(path)
    connection.executescript(SCHEMA)
    ids = {tag: index for index, (tag, *_rest) in enumerate(tags, 1)}
    for tag, format_id, preferred, count, translations in tags:
        connection.execute("INSERT INTO TAGS VALUES (?, ?, ?)", (ids[tag], tag, tag))
        connection.execute(
            "INSERT INTO TAG_STATUS VALUES (?, ?, 0, ?, ?)",
            (ids[tag], format_id, int(preferred != tag), ids.get(preferred, 999)),
        )
        if count:
            connection.execute("INSERT INTO TAG_USAGE_COUNTS VALUES (?, ?, ?)", (ids[tag], format_id, count))
        for translation in translations:
            connection.execute(
                "INSERT INTO TAG_TRANSLATIONS (tag_id, language, translation) VALUES (?, 'ja', ?)",
                (ids[tag], translation),
            )
    connection.commit()
    connection.close()


class TagDbTest(unittest.TestCase):
    def setUp(self):
        directory = tempfile.TemporaryDirectory()
        self.addCleanup(directory.cleanup)
        self.path = Path(directory.name) / "tags.sqlite"
        make_database(
            self.path,
            [
                ("long hair", 1, "long hair", 500, ["長髪", "長い髪", "ロングヘア", "Long hair(長)"]),
                ("long sleeves", 1, "long sleeves", 900, ["長袖"]),
                ("longhair", 1, "long hair", 0, []),
                ("cats", 1, "domestic cat", 0, []),
                ("domestic cat", 2, "domestic cat", 0, []),
                ("hatsune miku \\(vocaloid\\)", 1, "hatsune miku \\(vocaloid\\)", 50, ["初音ミク"]),
                ("^_^", 1, "^_^", 40, []),
                ("1000 users bookmark", 2, "1000 users bookmark", 10, []),
            ],
        )
        patcher = mock.patch.dict(os.environ, {tagdb.DATABASE_ENV: str(self.path)})
        patcher.start()
        self.addCleanup(patcher.stop)

    def test_prefix_results_are_ordered_by_usage(self):
        self.assertEqual([item["tag"] for item in tagdb.search("long")], ["long sleeves", "long hair"])

    def test_alias_resolves_to_canonical_tag(self):
        result = tagdb.search("longhair")[0]
        self.assertEqual((result["tag"], result["matched"], result["count"]), ("long hair", "longhair", 500))

    def test_translation_search_and_display_order(self):
        result = tagdb.search("長髪")[0]
        self.assertEqual(result["tag"], "long hair")
        self.assertEqual(result["type"], "general")
        self.assertEqual(result["translations"], ["長髪", "長い髪", "ロングヘア"])

    def test_contains_is_only_used_on_request(self):
        self.assertEqual(tagdb.search("sleeve"), [])
        self.assertEqual([item["tag"] for item in tagdb.search("sleeve", contains=True)], ["long sleeves"])

    def test_other_format_is_not_searched(self):
        self.assertEqual(tagdb.search("1000 users"), [])

    def test_validate(self):
        results = {item["tag"]: item for item in tagdb.validate(
            ["long_hair", "longhair", "cats", "hatsune miku (vocaloid)", "^_^", "nothing", "1000 users bookmark"]
        )}
        self.assertEqual(results["long_hair"]["state"], "ok")
        self.assertEqual((results["longhair"]["state"], results["longhair"]["preferred"]), ("alias", "long hair"))
        self.assertEqual(results["cats"]["state"], "ok")
        self.assertEqual(results["hatsune miku (vocaloid)"]["state"], "ok")
        self.assertEqual(results["^_^"]["state"], "ok")
        self.assertEqual(results["nothing"]["state"], "unknown")
        self.assertEqual(results["1000 users bookmark"]["state"], "unknown")

    def test_translate_tag_to_japanese(self):
        self.assertEqual(tagdb.translate("Long_Hair", "ja"), "長い髪")
        self.assertEqual(tagdb.translate("longhair", "ja"), "長い髪")

    def test_translate_translation_to_tag(self):
        self.assertEqual(tagdb.translate("長い髪", "en"), "long hair")

    def test_translate_only_matches_whole_tags(self):
        self.assertEqual(tagdb.translate("a girl with long hair", "ja"), "")
        self.assertEqual(tagdb.translate("長い髪の女の子", "en"), "")

    def test_translate_keeps_text_already_in_target_language(self):
        self.assertEqual(tagdb.translate("longhair", "en"), "")
        self.assertEqual(tagdb.translate("長い髪", "ja"), "")

    def test_status(self):
        self.assertEqual(
            tagdb.status(),
            {"available": True, "databases": [{"name": "tags.sqlite", "version": "v1"}]},
        )

    def test_missing_database_is_unavailable(self):
        with mock.patch.dict(os.environ, {tagdb.DATABASE_ENV: str(self.path) + ".missing"}):
            self.assertFalse(tagdb.status()["available"])
            self.assertEqual(tagdb.search("long"), [])

    def test_hf_cache_uses_refs_main(self):
        with tempfile.TemporaryDirectory() as directory:
            cache = Path(directory) / "datasets--NEXTAltair--genai-image-tag-db-mit"
            snapshot = cache / "snapshots" / "abc"
            snapshot.mkdir(parents=True)
            (snapshot / "genai-image-tag-db-mit.sqlite").write_bytes(b"")
            (cache / "refs").mkdir()
            (cache / "refs" / "main").write_text("abc", encoding="utf-8")
            with mock.patch.dict(os.environ, {tagdb.DATABASE_ENV: "", "HF_HUB_CACHE": directory}):
                self.assertEqual(tagdb.database_paths(), [snapshot / "genai-image-tag-db-mit.sqlite"])


if __name__ == "__main__":
    unittest.main()
