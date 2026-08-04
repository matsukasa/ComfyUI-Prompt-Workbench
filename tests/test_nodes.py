import importlib.util
import json
import tempfile
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


def load_module(name, filename):
    spec = importlib.util.spec_from_file_location(name, ROOT / filename)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


nodes = load_module("prompt_aio_nodes", "nodes.py")
routes = load_module("prompt_aio_routes", "routes.py")


class PromptAllInOneNodeTests(unittest.TestCase):
    def test_schema_has_multiline_string_inputs_and_string_outputs(self):
        schema = nodes.PromptAllInOne.INPUT_TYPES()
        self.assertEqual(schema["required"]["prompt"][0], "STRING")
        self.assertTrue(schema["required"]["prompt"][1]["multiline"])
        self.assertEqual(nodes.PromptAllInOne.RETURN_TYPES, ("STRING",))

    def test_outputs_prompt_verbatim(self):
        node = nodes.PromptAllInOne()
        self.assertEqual(node.emit_prompt("a, b"), ("a, b",))

    def test_empty_and_none_values_do_not_fail(self):
        node = nodes.PromptAllInOne()
        self.assertEqual(node.emit_prompt(""), ("",))
        self.assertEqual(node.emit_prompt(None), ("",))

    def test_headless_import_does_not_require_frontend(self):
        self.assertIn("PromptAllInOne", nodes.NODE_CLASS_MAPPINGS)
        self.assertEqual(nodes.PromptAllInOne.CATEGORY, "prompt/Prompt Workbench")
        self.assertEqual(nodes.NODE_DISPLAY_NAME_MAPPINGS["PromptAllInOne"], "Prompt Workbench")


class TranslationTests(unittest.IsolatedAsyncioTestCase):
    async def test_local_dictionary_translation_and_cache(self):
        first, cached = await routes.translate_text("local", "masterpiece", target="ja")
        second, cached_again = await routes.translate_text("local", "masterpiece", target="ja")
        self.assertEqual(first, "傑作")
        self.assertEqual(second, "傑作")
        self.assertFalse(cached)
        self.assertTrue(cached_again)

    async def test_offline_provider_keeps_unknown_tag_local(self):
        translated, cached = await routes.translate_text("offline", "unknown_tag", target="ja")
        self.assertEqual(translated, "unknown_tag")
        self.assertFalse(cached)

    async def test_japanese_translation_uses_local_dictionary_before_remote_provider(self):
        translated, cached = await routes.translate_text("deepl", "masterpiece", target="ja")
        self.assertEqual(translated, "傑作")
        self.assertFalse(cached)

    async def test_local_translation_uses_bundled_catalog_and_legacy_translations(self):
        catalog_translation, _ = await routes.translate_text(
            "offline", "expressionless", target="ja"
        )
        legacy_translation, _ = await routes.translate_text(
            "offline", "blonde_hair", target="ja"
        )
        self.assertEqual(catalog_translation, "無表情")
        self.assertEqual(legacy_translation, "金髪")

    async def test_local_translation_normalizes_spaces_underscores_and_weights(self):
        spaced, _ = await routes.translate_text(
            "offline", "looking_back", target="ja-JP"
        )
        weighted, _ = await routes.translate_text(
            "offline", "(dynamic angle: 1.20)", target="ja"
        )
        self.assertEqual(spaced, "振り返る")
        self.assertEqual(weighted, "ダイナミックな角度")

    async def test_local_dictionary_translates_back_in_both_directions(self):
        english, _ = await routes.translate_text("offline", "背中", target="en")
        japanese, _ = await routes.translate_text("offline", "back", target="ja")
        self.assertEqual(english, "back")
        self.assertEqual(japanese, "背中")

    def test_free_translation_normalizes_prompt_tag_underscores(self):
        self.assertEqual(routes._mymemory_query("looking_at_viewer"), "looking at viewer")

    def test_mymemory_response_is_parsed_and_html_unescaped(self):
        result = routes._parse_mymemory_result(
            {"responseStatus": 200, "responseData": {"translatedText": "髪&amp;目"}},
            "hair and eyes",
        )
        self.assertEqual(result, "髪&目")

    def test_unchanged_free_translation_is_rejected(self):
        with self.assertRaises(routes.TranslationError):
            routes._parse_mymemory_result(
                {"responseStatus": 200, "responseData": {"translatedText": "long hair"}},
                "long hair",
            )

    async def test_unknown_provider_is_rejected(self):
        with self.assertRaises(routes.TranslationError):
            await routes.translate_text("unknown", "hello", target="ja")

    async def test_oversized_text_is_rejected(self):
        with self.assertRaises(routes.TranslationError):
            await routes.translate_text("local", "x" * (routes.MAX_TEXT_LENGTH + 1), target="ja")


class CatalogRouteTests(unittest.TestCase):
    def test_examples_path_falls_back_without_a_bundled_catalog(self):
        with tempfile.TemporaryDirectory() as directory:
            data_directory = Path(directory)
            (data_directory / "prompt_examples.json").write_text('{"source":"legacy"}', encoding="utf-8")
            self.assertEqual(routes.examples_path(data_directory).name, "prompt_examples.json")

    def test_examples_path_prefers_and_loads_bundled_catalog(self):
        with tempfile.TemporaryDirectory() as directory:
            data_directory = Path(directory)
            (data_directory / "prompt_examples.json").write_text('{"source":"legacy"}', encoding="utf-8")
            expected = {"schema_version": 1, "major_categories": []}
            (data_directory / "tag_catalog.json").write_text(
                json.dumps(expected), encoding="utf-8"
            )
            self.assertEqual(routes.examples_path(data_directory).name, "tag_catalog.json")
            self.assertEqual(routes.load_examples_catalog(data_directory), expected)

    def test_broken_catalog_json_is_reported_instead_of_silently_using_legacy(self):
        with tempfile.TemporaryDirectory() as directory:
            data_directory = Path(directory)
            (data_directory / "prompt_examples.json").write_text('{"source":"legacy"}', encoding="utf-8")
            (data_directory / "tag_catalog.json").write_text("{broken", encoding="utf-8")
            with self.assertRaises(json.JSONDecodeError):
                routes.load_examples_catalog(data_directory)

    def test_named_user_catalog_is_preferred_and_missing_name_falls_back(self):
        with tempfile.TemporaryDirectory() as data_directory, tempfile.TemporaryDirectory() as storage_directory:
            data_path = Path(data_directory)
            storage_path = Path(storage_directory)
            default = {"categories": [{"id": "default", "items": []}]}
            custom = {"schema": "prompt-workbench/tag-catalog", "version": 1, "categories": [{"id": "custom"}], "tags": []}
            (data_path / "prompt_examples.json").write_text(json.dumps(default), encoding="utf-8")
            routes.save_user_catalog("私のタグ", custom, storage_path)
            self.assertEqual(
                routes.load_examples_catalog(data_path, "私のタグ", storage_path), custom
            )
            self.assertEqual(
                routes.load_examples_catalog(data_path, "存在しない", storage_path), default
            )

    def test_named_catalog_save_never_overwrites_existing_file(self):
        with tempfile.TemporaryDirectory() as storage_directory:
            catalog = {"schema": "prompt-workbench/tag-catalog", "version": 1, "categories": [{"id": "custom"}], "tags": []}
            target = routes.save_user_catalog("my catalog", catalog, storage_directory)
            original = target.read_bytes()
            with self.assertRaises(FileExistsError):
                routes.save_user_catalog("my catalog.json", {"schema": "prompt-workbench/tag-catalog", "version": 1, "categories": [{"id": "other"}], "tags": []}, storage_directory)
            self.assertEqual(target.read_bytes(), original)

    def test_catalog_names_cannot_escape_storage_directory(self):
        with tempfile.TemporaryDirectory() as storage_directory:
            with self.assertRaises(ValueError):
                routes.user_catalog_path("../outside", storage_directory)

    def test_existing_broken_user_catalog_does_not_fall_back_to_default(self):
        with tempfile.TemporaryDirectory() as data_directory, tempfile.TemporaryDirectory() as storage_directory:
            data_path = Path(data_directory)
            storage_path = Path(storage_directory)
            (data_path / "prompt_examples.json").write_text('{"categories":[]}', encoding="utf-8")
            storage_path.mkdir(parents=True, exist_ok=True)
            (storage_path / "broken.json").write_text("{broken", encoding="utf-8")
            with self.assertRaises(json.JSONDecodeError):
                routes.load_examples_catalog(data_path, "broken", storage_path)


if __name__ == "__main__":
    unittest.main()
